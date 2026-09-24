import { z } from "zod";
import type { ReportMessageTemplateId } from "@/lib/report-templates";
import {
  AUTOMATION_PERIOD_PRESETS,
  isValidTimezone,
  type AutomationPeriodPreset,
  type IsoWeekday,
} from "./periods";

export const AUTOMATION_STATUSES = ["active", "paused"] as const;
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number];

export const AUTOMATION_RUN_STATUSES = ["scheduled", "running", "sent", "failed", "skipped"] as const;
export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];

export const AUTOMATION_RUN_TRIGGERS = ["scheduled", "manual", "test"] as const;
export type AutomationRunTrigger = (typeof AUTOMATION_RUN_TRIGGERS)[number];

export const AUTOMATION_FREQUENCIES = ["weekly"] as const;
export const AUTOMATION_CHANNELS = ["whatsapp"] as const;

// Must stay identical to REPORT_MESSAGE_TEMPLATES in lib/report-templates (a test
// enforces it): the automation does not own templates, it points at the same ones
// "Copiar relatório" uses.
export const AUTOMATION_MESSAGE_TEMPLATES = ["sales", "messages", "followers", "traffic", "overview"] as const satisfies readonly ReportMessageTemplateId[];

// Who receives the message. Only routing information: never a provider token or
// credential (the schema is strict, so unknown keys - such as a secret - are rejected).
export const recipientSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("phone"),
    phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Informe o telefone com DDI, ex.: +5511999999999."),
    display_name: z.string().trim().max(120).optional(),
  }).strict(),
  z.object({
    type: z.literal("group"),
    group_id: z.string().trim().min(1, "Informe o grupo.").max(120),
    display_name: z.string().trim().max(120).optional(),
  }).strict(),
]);
export type AutomationRecipient = z.infer<typeof recipientSchema>;

const uuid = z.string().uuid();

export const automationInputSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome para a automação.").max(120),
  document_id: uuid,
  routine_key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/).nullable().optional(),
  message_template: z.enum(AUTOMATION_MESSAGE_TEMPLATES),
  period_preset: z.enum(AUTOMATION_PERIOD_PRESETS),
  comparison_enabled: z.boolean().default(true),
  include_detailed_report: z.boolean().default(false),
  // Only the short lead-in of the detailed-report link is customizable; empty = default text.
  detailed_report_intro: z.string().trim().max(300).nullish().transform((value) => (value ? value : null)),
  frequency: z.enum(AUTOMATION_FREQUENCIES).default("weekly"),
  run_weekday: z.number().int().min(1).max(7),
  run_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM."),
  timezone: z.string().refine(isValidTimezone, "Fuso horário inválido."),
  channel: z.enum(AUTOMATION_CHANNELS).default("whatsapp"),
  recipient: recipientSchema,
  status: z.enum(AUTOMATION_STATUSES).default("paused"),
});
export type AutomationInput = z.infer<typeof automationInputSchema>;
export type AutomationFormInput = z.input<typeof automationInputSchema>;
// For edits: only the fields that were sent, never silently reset to a default.
export const automationPatchSchema = automationInputSchema.partial();

export interface AutomationRow {
  id: string;
  client_id: string;
  document_id: string;
  name: string;
  routine_key: string | null;
  message_template: ReportMessageTemplateId;
  period_preset: AutomationPeriodPreset;
  comparison_enabled: boolean;
  include_detailed_report: boolean;
  detailed_report_intro: string | null;
  frequency: (typeof AUTOMATION_FREQUENCIES)[number];
  run_weekday: IsoWeekday;
  run_time: string;
  timezone: string;
  channel: (typeof AUTOMATION_CHANNELS)[number];
  recipient: AutomationRecipient;
  status: AutomationStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  next_run_at: string | null;
}

export interface AutomationRunRow {
  id: string;
  automation_id: string;
  client_id: string;
  attempt: number;
  scheduled_for: string;
  status: AutomationRunStatus;
  started_at: string | null;
  finished_at: string | null;
  timezone: string;
  period_preset: AutomationPeriodPreset;
  period_since: string;
  period_until: string;
  compare_since: string | null;
  compare_until: string | null;
  message_template: ReportMessageTemplateId;
  message_text: string | null;
  error_code: string | null;
  error_message: string | null;
  provider_message_id: string | null;
  trigger_type: AutomationRunTrigger;
  parent_run_id: string | null;
  requested_by: string | null;
  idempotency_key: string | null;
  recipient_label: string | null;
  provider: string | null;
  provider_status: string | null;
  retryable: boolean;
  retry_after: string | null;
  report_snapshot: { title: string; config: unknown; data: unknown } | null;
  report_share_token: string | null;
  created_at: string;
  updated_at: string;
}

// Operational routines are just several automations that share a routine_key.
// Nothing about the model is specific to them; these definitions only say which
// automations a routine consists of, ready for a UI to offer later.
export const AUTOMATION_ROUTINES = {
  // Monday reports the weekend just ended; Friday reports the Monday-Thursday block.
  rotina_laos: {
    label: "Rotina LAOS",
    items: [
      { suffix: "segunda · sexta a domingo", run_weekday: 1, period_preset: "friday_sunday" },
      { suffix: "sexta · segunda a quinta", run_weekday: 5, period_preset: "monday_thursday" },
    ],
  },
  semanal_completo: {
    label: "Semanal completo",
    items: [{ suffix: "segunda · semana completa", run_weekday: 1, period_preset: "monday_sunday" }],
  },
} as const;
export type AutomationRoutineKey = keyof typeof AUTOMATION_ROUTINES;

export function buildRoutineAutomations(
  routineKey: AutomationRoutineKey,
  base: Omit<AutomationFormInput, "name" | "run_weekday" | "period_preset" | "routine_key">,
  nameBase?: string,
): AutomationInput[] {
  const routine = AUTOMATION_ROUTINES[routineKey];
  return routine.items.map((item) =>
    automationInputSchema.parse({
      ...base,
      name: `${nameBase?.trim() || routine.label} — ${item.suffix}`,
      routine_key: routineKey,
      run_weekday: item.run_weekday,
      period_preset: item.period_preset,
    }),
  );
}
