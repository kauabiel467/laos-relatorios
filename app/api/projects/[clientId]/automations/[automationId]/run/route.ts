import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeProject, ProjectAccessError } from "@/lib/projects/access";
import { executeAutomationRun } from "@/lib/automations/executor";
import { automationPatchSchema, type AutomationRow, type AutomationRunRow } from "@/lib/automations/model";
import { listDeliverySummaries } from "@/lib/automations/delivery-store";
import { createExecutorDeps } from "@/lib/automations/runtime";
import { AUTOMATION_COLUMNS, AUTOMATION_RUN_COLUMNS } from "@/lib/automations/store";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { rateLimit, requestIp, tooManyRequestsResponse } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";
// Collecting the data and sending can take a while; the platform limit is 60 s.
export const maxDuration = 60;

const uuid = z.string().uuid();

const bodySchema = z.discriminatedUnion("mode", [
  // "Executar agora": a REAL send to the automation's recipient, so it needs an explicit confirmation.
  z.object({ mode: z.literal("run"), request_id: uuid, confirm: z.literal(true, { message: "Confirme o envio ao destinatário." }) }),
  // "Enviar teste": goes to a number typed by the person, using the automation's
  // current settings (the edit form may pass the unsaved ones as `overrides`).
  z.object({
    mode: z.literal("test"),
    request_id: uuid,
    phone: z.string().trim().min(1, "Informe o telefone de teste."),
    confirm_production_recipient: z.boolean().optional(),
    overrides: automationPatchSchema.optional(),
  }),
  z.object({ mode: z.literal("retry"), run_id: uuid }),
]);

const fail = (error: unknown) => {
  if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
  return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível concluir." }, { status: 400 });
};

export async function POST(request: NextRequest, context: { params: Promise<{ clientId: string; automationId: string }> }) {
  try {
    const params = await context.params;
    const clientId = uuid.parse(params.clientId);
    const automationId = uuid.parse(params.automationId);
    // Sending a report to a client is limited to owners and managers.
    const { db, user } = await authorizeProject(clientId, true);
    const limit = rateLimit(`automation-run:${user.id}:${requestIp(request)}`, 12, 60_000);
    if (!limit.allowed) return tooManyRequestsResponse(limit);
    const body = bodySchema.parse(await request.json());

    const { data: automationRow } = await db
      .from("agency_report_automations")
      .select(AUTOMATION_COLUMNS)
      .eq("id", automationId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (!automationRow) throw new ProjectAccessError("Automação não encontrada ou inacessível.", 404);
    const automation = automationRow as unknown as AutomationRow;
    const deps = createExecutorDeps();
    const now = new Date();

    let outcome;
    if (body.mode === "run") {
      outcome = await executeAutomationRun(deps, {
        automation, trigger: "manual", scheduledFor: now, requestedBy: user.id, requestKey: body.request_id,
      });
    } else if (body.mode === "test") {
      const phone = normalizePhone(body.phone);
      if (!phone.ok) throw Error(phone.message);
      const production = automation.recipient.type === "phone" ? normalizePhone(automation.recipient.phone) : null;
      if (production?.ok && production.e164 === phone.e164 && !body.confirm_production_recipient) {
        return NextResponse.json(
          { error: "Este é o número do destinatário real da automação. Confirme para enviar o teste a ele.", code: "confirm_production_recipient" },
          { status: 409 },
        );
      }
      // Unsaved form values only ever reach a TEST run; the saved automation is never touched.
      const effective = { ...automation, ...(body.overrides ?? {}) } as AutomationRow;
      outcome = await executeAutomationRun(deps, {
        automation: effective, trigger: "test", scheduledFor: now, requestedBy: user.id, requestKey: body.request_id, testPhone: phone.e164,
      });
    } else {
      const { data: parentRow } = await db
        .from("agency_report_automation_runs")
        .select(AUTOMATION_RUN_COLUMNS)
        .eq("id", body.run_id)
        .eq("automation_id", automationId)
        .maybeSingle();
      if (!parentRow) throw new ProjectAccessError("Execução não encontrada ou inacessível.", 404);
      const parent = parentRow as unknown as AutomationRunRow;
      // A run can also be repeated when WhatsApp accepted it but then failed to deliver it.
      const deliveryFailed = parent.status === "sent" && (await listDeliverySummaries(db, [parent.id])).get(parent.id)?.status === "failed";
      if (parent.status !== "failed" && !deliveryFailed) throw Error("Só é possível tentar novamente uma execução que falhou.");
      if (parent.trigger_type === "test") throw Error("Testes não são repetidos: envie um novo teste.");
      outcome = await executeAutomationRun(deps, {
        automation, trigger: parent.trigger_type, scheduledFor: new Date(parent.scheduled_for), requestedBy: user.id, retryOf: parent,
      });
    }

    if (outcome.status === "duplicate") {
      return NextResponse.json({ error: "Esta execução já foi iniciada. Confira o histórico." }, { status: 409 });
    }
    if (outcome.status === "busy") {
      return NextResponse.json({ error: "Já existe uma execução desta automação em andamento." }, { status: 409 });
    }
    // The frozen report and internal keys stay server-side; the history endpoint is the only source for the rest.
    const run: Partial<AutomationRunRow> = { ...outcome.run };
    delete run.report_snapshot;
    delete run.requested_by;
    delete run.idempotency_key;
    return NextResponse.json({ status: outcome.status, run }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return fail(error);
  }
}
