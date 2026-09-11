import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getSupabaseServerClient,
  getSupabaseAdminClient,
} from "@/lib/supabase/server";
import {
  authorizeProject,
  bindProjectMeta,
  projectCampaigns,
  collectAnalysis,
} from "@/lib/projects/meta";
import { configSchema } from "@/lib/projects/schema";
import {
  normalizeAnalysisConfig,
  type AnalysisConfig,
  type ProjectDocument,
} from "@/lib/projects/model";
export const maxDuration = 60;
const uuid = z.string().uuid();
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
    { status: e instanceof Error && e.message === "UNAUTHORIZED" ? 401 : 400 },
  );
export async function GET(req: NextRequest) {
  try {
    const db = await getSupabaseServerClient();
    if (!db) throw Error("Serviço indisponível.");
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) throw Error("UNAUTHORIZED");
    if (req.nextUrl.searchParams.get("campaigns"))
      return NextResponse.json(
        {
          campaigns: await projectCampaigns(
            uuid.parse(req.nextUrl.searchParams.get("campaigns")),
          ),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    const { data, error } = await db
      .from("agency_documents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw Error("Não foi possível carregar os documentos.");
    return NextResponse.json(
      { documents: data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const b = await req.json(),
      cid = uuid.parse(b.client_id);
    const { db, user, role } = await authorizeProject(cid);
    if (b.action === "bind") {
      await bindProjectMeta(
        cid,
        z
          .string()
          .regex(/^act_\d+$/)
          .parse(b.account_id),
      );
      return NextResponse.json({ ok: true });
    }
    if (b.action === "project") {
      const value = z
        .object({
          name: z.string().trim().min(2).max(120),
          segment: z.string().max(80),
          unit: z.string().max(100),
          contact_email: z.string().email().or(z.literal("")),
          logo_url: z.string().url().startsWith("https://").or(z.literal("")),
        })
        .parse(b.value);
      const { error } = await db
        .from("agency_clients")
        .update(value)
        .eq("id", cid);
      if (error) throw Error("Não foi possível salvar o projeto.");
      return NextResponse.json({ ok: true });
    }
    if (b.action === "unlink") {
      if (!["owner", "manager"].includes(role))
        throw Error("Somente proprietários e gerentes podem desconectar.");
      const admin = getSupabaseAdminClient();
      if (!admin) throw Error("Serviço indisponível.");
      const { error } = await admin
        .from("agency_meta_connections")
        .delete()
        .eq("client_id", cid);
      if (error) throw Error("Falha ao desvincular.");
      await db
        .from("agency_clients")
        .update({ meta_account_id: null, meta_connected_at: null })
        .eq("id", cid);
      return NextResponse.json({ ok: true });
    }
    let existing: ProjectDocument | null = null;
    if (b.id) {
      const { data } = await db
        .from("agency_documents")
        .select("*")
        .eq("id", uuid.parse(b.id))
        .eq("client_id", cid)
        .single();
      if (!data) throw Error("Documento não encontrado.");
      existing = data;
    }
    if (["duplicate", "convert", "template"].includes(b.action)) {
      if (!existing) throw Error("Documento não encontrado.");
      const kind =
        b.action === "convert"
          ? "report"
          : b.action === "template"
            ? "template"
            : existing.kind;
      const { data, error } = await db
        .from("agency_documents")
        .insert({
          client_id: cid,
          kind,
          title:
            (b.action === "template"
              ? "Modelo · "
              : b.action === "duplicate"
                ? "Cópia · "
                : "Relatório · ") + existing.title.slice(0, 145),
          config: existing.config,
          data: kind === "template" ? null : existing.data,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw Error("Não foi possível criar a cópia.");
      return NextResponse.json(data);
    }
    if (b.action === "timeline") {
      if (!existing) throw Error("Documento não encontrado.");
      const { error } = await db
        .from("agency_records")
        .insert({
          client_id: cid,
          kind: "timeline",
          title: existing.title,
          visibility: existing.status === "published" ? "shared" : "internal",
          created_by: user.id,
          payload: {
            description:
              (existing.kind === "dashboard" ? "Dashboard" : "Relatório") +
              " registrado no histórico. Período: " +
              existing.config.since +
              " a " +
              existing.config.until,
          },
        });
      if (error) throw Error("Não foi possível registrar.");
      return NextResponse.json({ ok: true });
    }
    if (b.action === "delete") {
      if (!existing || existing.status !== "draft")
        throw Error("Apenas rascunhos podem ser excluídos.");
      const { error } = await db
        .from("agency_documents")
        .delete()
        .eq("id", existing.id)
        .eq("client_id", cid);
      if (error) throw Error("Não foi possível excluir.");
      return NextResponse.json({ ok: true });
    }
    if (b.action === "publish") {
      if (!existing?.data || existing.kind === "template")
        throw Error("Importe os resultados antes de publicar.");
      const { data, error } = await db
        .from("agency_documents")
        .update({ status: "published" })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw Error("Não foi possível publicar.");
      return NextResponse.json(data);
    }
    if (b.action === "unpublish") {
      if (!existing || existing.kind !== "dashboard")
        throw Error("Relatórios publicados permanecem preservados.");
      const { data, error } = await db
        .from("agency_documents")
        .update({ status: "draft" })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw Error("Não foi possível restringir o acesso.");
      return NextResponse.json(data);
    }
    if (!["create", "save", "refresh"].includes(b.action))
      throw Error("Ação não reconhecida.");
    if (existing?.kind === "report" && existing.status === "published")
      throw Error("Duplique o relatório publicado para criar uma nova versão.");
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
    // Editing dates or filters invalidates the saved result; never relabel an old snapshot as new data.
    const changed =
      existing &&
      JSON.stringify([
        config.since,
        config.until,
        config.comparison,
        config.compare_since,
        config.compare_until,
        config.campaign_ids,
        config.primary_metric,
      ]) !==
        JSON.stringify([
          existing.config.since,
          existing.config.until,
          existing.config.comparison,
          existing.config.compare_since,
          existing.config.compare_until,
          existing.config.campaign_ids,
          normalizeAnalysisConfig(existing.config).primary_metric,
        ]);
    const data =
      kind === "template"
        ? null
        : b.action === "refresh" || b.action === "create"
          ? await collectAnalysis(cid, config)
          : changed
            ? null
            : existing?.data;
    const value = {
      title,
      config,
      data,
      ...(changed && b.action === "save" ? { status: "draft" } : {}),
    };
    const result = existing
      ? await db
          .from("agency_documents")
          .update(value)
          .eq("id", existing.id)
          .select()
          .single()
      : await db
          .from("agency_documents")
          .insert({ ...value, client_id: cid, kind, created_by: user.id })
          .select()
          .single();
    if (result.error) throw Error("Não foi possível salvar o documento.");
    return NextResponse.json(result.data);
  } catch (e) {
    return fail(e);
  }
}
