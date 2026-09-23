import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  bindProjectMeta,
  unlinkProjectMeta,
  testProjectMetaConnection,
  projectCampaigns,
} from "@/lib/projects/meta";
import { authorizeProject, ProjectAccessError } from "@/lib/projects/access";
import {
  loadProjectWorkspace,
  createProject,
  addProjectRecord,
  updateGoalProgress,
  updateProject,
  setProjectOnboardingStep,
  completeProjectSetup,
  inviteProjectClient,
  revokeProjectClient,
  revokeProjectInvitation,
} from "@/lib/projects/service";
import { copyProjectDocument, getProjectDocument, deleteProjectDocument, setProjectDocumentPublication, setProjectDocumentShareToken, saveProjectDocument } from "@/lib/projects/documents";
import { configSchema } from "@/lib/projects/schema";
import {
  normalizeAnalysisConfig,
  type AnalysisConfig,
  type ProjectDocument,
} from "@/lib/projects/model";
import {
  projectCreateSchema,
  projectDetailsSchema,
} from "@/lib/projects/config";
import { rateLimit, requestIp, tooManyRequestsResponse } from "@/lib/utils/rate-limit";
export const maxDuration = 60;
const uuid = z.string().uuid();
const recordSchema = z.object({
  client_id: uuid,
  kind: z.enum(["goal", "timeline", "automation"]),
  title: z.string().trim().min(1).max(180),
  visibility: z.enum(["internal", "shared"]).default("internal"),
  payload: z.object({
    description: z.string().max(12000).optional(),
    metric: z.string().max(80).optional(),
    target: z.number().positive().finite().optional(),
    actual: z.number().nonnegative().finite().optional(),
    direction: z.enum(["above", "below"]).optional(),
    deadline: z.string().date().optional(),
    cadence: z.enum(["weekly", "monthly"]).optional(),
  }).strict(),
});
const fail = (e: unknown) =>
  NextResponse.json(
    {
      error:
        e instanceof z.ZodError
          ? e.issues[0]?.message
          : e instanceof Error
            ? e.message === "UNAUTHORIZED"
              ? "Entre novamente para continuar."
              : e.message
            : "Não foi possível concluir.",
    },
    { status: e instanceof ProjectAccessError ? e.status : e instanceof Error && e.message === "UNAUTHORIZED" ? 401 : 400 },
  );
export async function GET(req: NextRequest) {
  const limit = rateLimit(`projects:get:${requestIp(req)}`, 120, 60_000);
  if (!limit.allowed) return tooManyRequestsResponse(limit);
  try {
    if (req.nextUrl.searchParams.get("campaigns"))
      return NextResponse.json(
        {
          campaigns: await projectCampaigns(
            uuid.parse(req.nextUrl.searchParams.get("campaigns")),
          ),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    const params = req.nextUrl.searchParams;
    const clientId = params.has("project") ? uuid.parse(params.get("project")) : undefined;
    const documentId = params.has("document") ? uuid.parse(params.get("document")) : undefined;
    const legacyDocumentId = params.has("legacyDocument") ? uuid.parse(params.get("legacyDocument")) : undefined;
    if ((documentId || legacyDocumentId) && !clientId) throw Error("Informe o projeto do documento.");
    return NextResponse.json(
      await loadProjectWorkspace(clientId, documentId, legacyDocumentId),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: NextRequest) {
  const limit = rateLimit(`projects:post:${requestIp(req)}`, 60, 60_000);
  if (!limit.allowed) return tooManyRequestsResponse(limit);
  try {
    const b = await req.json();
    if (b.action === "client") {
      return NextResponse.json(
        await createProject(projectCreateSchema.parse(b.value)),
      );
    }
    const cid = uuid.parse(b.client_id ?? b.value?.client_id);
    const { db, user } = await authorizeProject(cid);
    if (b.action === "bind" || b.action === "meta") {
      return NextResponse.json(await bindProjectMeta(
        cid,
        z
          .string()
          .regex(/^act_\d+$/)
          .parse(b.account_id),
      ));
    }
    if (b.action === "test_integration") {
      return NextResponse.json(await testProjectMetaConnection(cid));
    }
    if (b.action === "record") {
      if (b.value?.kind === "report") throw Error("Crie relatórios na área de documentos do projeto. Registros históricos permanecem preservados.");
      await addProjectRecord(recordSchema.parse(b.value));
      return NextResponse.json({ ok: true });
    }
    if (b.action === "progress") {
      await updateGoalProgress(cid, uuid.parse(b.id), z.number().nonnegative().finite().parse(b.actual));
      return NextResponse.json({ ok: true });
    }
    if (b.action === "access") {
      return NextResponse.json(
        await inviteProjectClient(
          cid,
          z.string().trim().email("Informe um e-mail válido.").parse(b.email),
        ),
      );
    }
    if (b.action === "revoke_access") {
      await revokeProjectClient(cid, uuid.parse(b.user_id));
      return NextResponse.json({ ok: true });
    }
    if (b.action === "revoke_invitation") {
      await revokeProjectInvitation(cid, uuid.parse(b.invitation_id));
      return NextResponse.json({ ok: true });
    }
    if (b.action === "project") {
      await updateProject(cid, projectDetailsSchema.parse(b.value));
      return NextResponse.json({ ok: true });
    }
    if (b.action === "advance_onboarding") {
      await setProjectOnboardingStep(
        cid,
        z.union([z.literal(2), z.literal(3), z.literal(4)]).parse(b.step),
      );
      return NextResponse.json({ ok: true });
    }
    if (b.action === "complete_setup") {
      await completeProjectSetup(cid);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "unlink") {
      await unlinkProjectMeta(cid);
      return NextResponse.json({ ok: true });
    }
    let existing: ProjectDocument | null = null;
    if (b.id) {
      existing = await getProjectDocument(db, cid, uuid.parse(b.id));
    }
    if (["duplicate", "convert", "template"].includes(b.action)) {
      if (!existing) throw Error("Documento não encontrado.");
      return NextResponse.json(await copyProjectDocument(db, existing, user.id, b.action));
    }
    if (b.action === "timeline") {
      if (!existing) throw Error("Documento não encontrado.");
      await addProjectRecord({
          client_id: cid,
          kind: "timeline",
          title: existing.title,
          visibility: existing.status === "published" ? "shared" : "internal",
          payload: {
            document_id: existing.id,
            description:
              (existing.kind === "dashboard" ? "Dashboard" : "Relatório") +
              " registrado no histórico. Período: " +
              existing.config.since +
              " a " +
              existing.config.until,
          },
        });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "delete") {
      await deleteProjectDocument(db, existing);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "publish") {
      return NextResponse.json(await setProjectDocumentPublication(db, existing, true));
    }
    if (b.action === "unpublish") {
      return NextResponse.json(await setProjectDocumentPublication(db, existing, false));
    }
    if (b.action === "share_link") {
      return NextResponse.json(await setProjectDocumentShareToken(db, existing, true));
    }
    if (b.action === "revoke_link") {
      return NextResponse.json(await setProjectDocumentShareToken(db, existing, false));
    }
    if (!["create", "save", "refresh"].includes(b.action))
      throw Error("Ação não reconhecida.");
    const config = configSchema.parse(
      normalizeAnalysisConfig(b.config ?? existing?.config),
    ) as AnalysisConfig;
    const title = z
      .string()
      .trim()
      .min(1)
      .max(180)
      .parse(b.title ?? existing?.title);
    const kind =
      existing?.kind ?? z.enum(["dashboard", "report"]).parse(b.kind);
    return NextResponse.json(await saveProjectDocument(db, cid, user.id, { action: b.action, title, config, kind }, existing));
  } catch (e) {
    return fail(e);
  }
}
