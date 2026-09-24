import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeProject, ProjectAccessError } from "@/lib/projects/access";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { rateLimit, requestIp, tooManyRequestsResponse } from "@/lib/utils/rate-limit";
import type { AnalysisConfig, AnalysisData } from "@/lib/projects/model";
import {
  AUTOMATION_ROUTINES,
  automationInputSchema,
  automationPatchSchema,
  buildRoutineAutomations,
  type AutomationRow,
} from "@/lib/automations/model";
import { resolveAutomationTimezone } from "@/lib/automations/periods";
import { previewSampleFromDocument } from "@/lib/automations/preview";
import {
  AUTOMATION_COLUMNS,
  createAutomation,
  createAutomations,
  deleteAutomation,
  listAutomationRuns,
  listAutomations,
  listLatestRuns,
  setAutomationStatus,
  updateAutomation,
} from "@/lib/automations/store";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();

const routineBaseSchema = automationInputSchema.omit({ name: true, run_weekday: true, period_preset: true, routine_key: true });

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), input: automationInputSchema }),
  z.object({
    action: z.literal("create_routine"),
    routine: z.enum(Object.keys(AUTOMATION_ROUTINES) as [keyof typeof AUTOMATION_ROUTINES, ...(keyof typeof AUTOMATION_ROUTINES)[]]),
    name_base: z.string().trim().max(80).optional(),
    base: routineBaseSchema,
  }),
  z.object({ action: z.literal("update"), id: uuid, patch: automationPatchSchema }),
  z.object({ action: z.literal("set_status"), id: uuid, status: z.enum(["active", "paused"]) }),
  z.object({ action: z.literal("delete"), id: uuid }),
]);

const fail = (error: unknown) => {
  if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível concluir." }, { status: 400 });
};

async function loadOwnedAutomation(db: Awaited<ReturnType<typeof authorizeProject>>["db"], clientId: string, id: string) {
  const { data, error } = await db
    .from("agency_report_automations")
    .select(AUTOMATION_COLUMNS)
    .eq("id", id)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error || !data) throw new ProjectAccessError("Automação não encontrada ou inacessível.", 404);
  return data as unknown as AutomationRow;
}

export async function GET(request: NextRequest, context: { params: Promise<{ clientId: string }> }) {
  const limit = rateLimit(`automations:get:${requestIp(request)}`, 120, 60_000);
  if (!limit.allowed) return tooManyRequestsResponse(limit);
  try {
    const clientId = uuid.parse((await context.params).clientId);
    const { db, client, role } = await authorizeProject(clientId);

    const runsFor = request.nextUrl.searchParams.get("runs");
    if (runsFor) {
      const automation = await loadOwnedAutomation(db, clientId, uuid.parse(runsFor));
      return NextResponse.json({ runs: await listAutomationRuns(db, automation.id) }, { headers: { "Cache-Control": "private, no-store" } });
    }

    // The integration's timezone is the second choice after the project's own. It
    // lives in a server-only table, so it is read here with a minimal column list.
    const admin = getSupabaseAdminClient();
    const integration = admin
      ? await admin.from("agency_meta_connections").select("account_timezone").eq("client_id", clientId).maybeSingle()
      : null;
    const [automations, latest, dashboards] = await Promise.all([
      listAutomations(db, clientId),
      listLatestRuns(db, clientId),
      db.from("agency_documents").select("id,title,status,config,data").eq("client_id", clientId).eq("kind", "dashboard").order("created_at", { ascending: false }),
    ]);
    if (dashboards.error) throw Error("Não foi possível carregar os dashboards do projeto.");
    return NextResponse.json(
      {
        canManage: role === "owner" || role === "manager",
        project: {
          name: client.name,
          defaultTimezone: resolveAutomationTimezone({
            projectTimezone: client.timezone,
            integrationTimezone: (integration?.data as { account_timezone?: string | null } | null)?.account_timezone,
          }),
        },
        automations: automations.map((automation) => ({ ...automation, last_run: latest.get(automation.id) ?? null })),
        dashboards: (dashboards.data ?? []).map((document) => ({
          id: document.id as string,
          title: document.title as string,
          status: document.status as string,
          sample: previewSampleFromDocument({
            config: document.config as AnalysisConfig | null,
            data: document.data as AnalysisData | null,
          }),
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ clientId: string }> }) {
  const limit = rateLimit(`automations:post:${requestIp(request)}`, 60, 60_000);
  if (!limit.allowed) return tooManyRequestsResponse(limit);
  try {
    const clientId = uuid.parse((await context.params).clientId);
    // Changing automations is limited to owners and managers (also enforced by RLS).
    const { db, user } = await authorizeProject(clientId, true);
    const body = bodySchema.parse(await request.json());

    if (body.action === "create") {
      return NextResponse.json({ automation: await createAutomation(db, clientId, user.id, body.input) });
    }
    if (body.action === "create_routine") {
      const inputs = buildRoutineAutomations(body.routine, body.base, body.name_base);
      return NextResponse.json({ automations: await createAutomations(db, clientId, user.id, inputs) });
    }
    const existing = await loadOwnedAutomation(db, clientId, body.id);
    if (body.action === "update") {
      return NextResponse.json({ automation: await updateAutomation(db, existing, body.patch) });
    }
    if (body.action === "set_status") {
      return NextResponse.json({ automation: await setAutomationStatus(db, existing, body.status) });
    }
    await deleteAutomation(db, existing);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
