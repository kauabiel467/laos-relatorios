import type { AutomationRow, AutomationRunRow, AutomationRunStatus, AutomationRunTrigger } from "./model";
import type { AutomationPeriodPreset } from "./periods";

// Everything a person reads about an automation, in pt-BR. Pure, so the exact
// wording is testable and the React components stay presentational.

const WEEKDAYS = [
  { short: "Seg", name: "segunda", article: "Toda" },
  { short: "Ter", name: "terça", article: "Toda" },
  { short: "Qua", name: "quarta", article: "Toda" },
  { short: "Qui", name: "quinta", article: "Toda" },
  { short: "Sex", name: "sexta", article: "Toda" },
  { short: "Sáb", name: "sábado", article: "Todo" },
  { short: "Dom", name: "domingo", article: "Todo" },
] as const;

export const weekdayName = (isoWeekday: number) => WEEKDAYS[isoWeekday - 1]?.name ?? "";
export const weekdayOptions = WEEKDAYS.map((day, index) => ({ value: index + 1, label: `${day.name[0].toUpperCase()}${day.name.slice(1)}${index < 5 ? "-feira" : ""}` }));

export const PERIOD_PRESET_TEXT: Record<AutomationPeriodPreset, { title: string; short: string; help: string }> = {
  monday_thursday: { title: "Segunda → Quinta", short: "Seg → Qui", help: "Ideal para o relatório enviado na sexta-feira." },
  friday_sunday: { title: "Sexta → Domingo", short: "Sex → Dom", help: "Ideal para o relatório enviado na segunda-feira." },
  monday_sunday: { title: "Segunda → Domingo", short: "Seg → Dom", help: "Semana completa anterior." },
};

export const CHANNEL_LABELS: Record<string, string> = { whatsapp: "WhatsApp" };

export const RUN_STATUS_LABELS: Record<AutomationRunStatus, string> = {
  scheduled: "Agendada",
  running: "Em execução",
  sent: "Enviado",
  failed: "Falhou",
  skipped: "Ignorada",
};

export const RUN_TRIGGER_LABELS: Record<AutomationRunTrigger, string> = {
  scheduled: "Agendada",
  manual: "Manual",
  test: "Teste",
};

// The report link of a run. A retry reuses the report of the attempt it repeats,
// so it has no token of its own: follow the chain to the run that created it.
export function runReportToken(run: Pick<AutomationRunRow, "report_share_token" | "parent_run_id">, byId: Map<string, Pick<AutomationRunRow, "report_share_token" | "parent_run_id">>) {
  let current: Pick<AutomationRunRow, "report_share_token" | "parent_run_id"> | undefined = run;
  for (let depth = 0; current && depth < 10; depth += 1) {
    if (current.report_share_token) return current.report_share_token;
    current = current.parent_run_id ? byId.get(current.parent_run_id) : undefined;
  }
  return null;
}

// "Toda segunda às 09:00" / "Todo domingo às 18:30". Postgres returns time as HH:MM:SS.
export function scheduleLabel(automation: Pick<AutomationRow, "run_weekday" | "run_time" | "frequency">) {
  const day = WEEKDAYS[automation.run_weekday - 1];
  return `${day.article} ${day.name} às ${automation.run_time.slice(0, 5)}`;
}

// yyyy-mm-dd -> dd/mm (no Date, so no timezone can move the day)
export function formatDayMonth(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}` : value;
}

export function formatDayMonthYear(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export const formatPeriod = (since: string, until: string, separator = "–") =>
  `${formatDayMonth(since)}${separator}${formatDayMonth(until)}`;

function zonedParts(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { day: get("day"), month: get("month"), year: get("year"), hour: get("hour"), minute: get("minute") };
}

// "28/09 às 09:00", on the wall clock of the automation's timezone.
export function formatInstant(value: string | Date, timezone: string) {
  const { day, month, hour, minute } = zonedParts(new Date(value), timezone);
  return `${day}/${month} às ${hour}:${minute}`;
}

// "24/09/2026 09:00"
export function formatInstantFull(value: string | Date, timezone: string) {
  const { day, month, year, hour, minute } = zonedParts(new Date(value), timezone);
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

export function nextRunLabel(automation: Pick<AutomationRow, "status" | "next_run_at" | "timezone">) {
  if (automation.status !== "active") return "Pausada";
  return automation.next_run_at ? formatInstant(automation.next_run_at, automation.timezone) : "—";
}

export function lastRunLabel(run: Pick<AutomationRunRow, "status" | "scheduled_for" | "timezone"> | null | undefined) {
  if (!run) return "Ainda não executada";
  return `${RUN_STATUS_LABELS[run.status]} · ${formatInstant(run.scheduled_for, run.timezone)}`;
}

export function comparisonLabel(automation: Pick<AutomationRow, "comparison_enabled">) {
  return automation.comparison_enabled ? "Compara com a semana anterior" : "Sem comparação";
}
