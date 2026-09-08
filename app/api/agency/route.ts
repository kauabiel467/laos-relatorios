import { getTeamContext } from "@/lib/team/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fetchMetaDashboardData } from "@/lib/integrations/meta-dashboard";
const uuid = z.string().uuid();
const clientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  team_id: uuid,
  segment: z.string().trim().max(80),
  unit: z.string().trim().max(100),
  contact_email: z.string().email().or(z.literal("")).optional(),
});
const recordSchema = z.object({
  client_id: uuid,
  kind: z.enum(["goal", "timeline", "report", "automation"]),
  title: z.string().trim().min(1).max(180),
  visibility: z.enum(["internal", "shared"]).default("internal"),
  payload: z
    .object({
      description: z.string().max(12000).optional(),
      metric: z.string().max(80).optional(),
      target: z.number().positive().optional(),
      actual: z.number().nonnegative().optional(),
      direction: z.enum(["above", "below"]).optional(),
      deadline: z.string().date().optional(),
      cadence: z.enum(["weekly", "monthly"]).optional(),
    })
    .strict(),
});
async function session() {
  const db = await getSupabaseServerClient();
  if (!db) throw new Error("Serviço indisponível. Tente novamente mais tarde.");
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new Error("UNAUTHORIZED");
  return { db, user };
}
function failure(e: unknown) {
  const msg =
    e instanceof Error ? e.message : "Não foi possível concluir a operação.";
  return NextResponse.json(
    {
      error:
        msg === "UNAUTHORIZED"
          ? "Entre novamente para continuar."
          : e instanceof z.ZodError
            ? "Confira os campos informados."
            : msg,
    },
    { status: msg === "UNAUTHORIZED" ? 401 : 400 },
  );
}
export async function GET() {
  try {
    const { db, user } = await session();
    await getTeamContext();
    const [c, r, m] = await Promise.all([
      db.from("agency_clients").select("*").order("name"),
      db
        .from("agency_records")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000),
      db.from("team_members").select("team_id").eq("user_id", user.id),
    ]);
    if (c.error || r.error || m.error)
      throw new Error("Não foi possível carregar a carteira. Tente novamente.");
    const tids = (m.data ?? []).map((x) => x.team_id);
    const teams = tids.length
      ? await db.from("teams").select("id,name").in("id", tids)
      : { data: [] };
    return NextResponse.json(
      {
        clients: c.data,
        records: r.data,
        teams: teams.data ?? [],
        staffClientIds: c.data
          .filter((x) => tids.includes(x.team_id))
          .map((x) => x.id),
        isStaff: tids.length > 0,
        userName: user.email?.split("@")[0] ?? "Minha conta",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const { db, user } = await session();
    const body = await req.json();
    if (body.action === "client") {
      const value = clientSchema.parse(body.value);
      const { data, error } = await db
        .from("agency_clients")
        .insert({ ...value, contact_email: value.contact_email || null })
        .select()
        .single();
      if (error)
        throw new Error(
          "Não foi possível cadastrar o cliente. Confira sua equipe e tente novamente.",
        );
      return NextResponse.json(data);
    }
    const cid = uuid.parse(body.client_id ?? body.value?.client_id);
    const { data: c } = await db
      .from("agency_clients")
      .select("*")
      .eq("id", cid)
      .single();
    if (!c) throw new Error("Cliente não encontrado.");
    const { data: membership } = await db
      .from("team_members")
      .select("role")
      .eq("team_id", c.team_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership)
      throw new Error("Esta ação é exclusiva da equipe responsável.");
    if (body.action === "record") {
      const value = recordSchema.parse(body.value);
      if (
        value.kind === "goal" &&
        (!value.payload.target || !value.payload.deadline)
      )
        throw new Error("Informe o valor e o prazo da meta.");
      if (value.kind === "automation" && !value.payload.cadence)
        throw new Error("Selecione a frequência.");
      const payload: Record<string, unknown> = { ...value.payload };
      if (value.kind === "report") {
        const { data: s } = await db
          .from("agency_records")
          .select("payload,created_at")
          .eq("client_id", cid)
          .eq("kind", "snapshot")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (s) {
          payload.bundle = s.payload.bundle;
          payload.source = s.payload.source;
          payload.period = s.payload.period;
          payload.synced_at = s.created_at;
        }
      }
      const { error } = await db
        .from("agency_records")
        .insert({
          ...value,
          payload,
          status:
            value.kind === "report"
              ? "draft"
              : value.kind === "automation"
                ? "paused"
                : "active",
          created_by: user.id,
        });
      if (error) throw new Error("Não foi possível salvar.");
      return NextResponse.json({ ok: true });
    }
    if (body.action === "progress") {
      const id = uuid.parse(body.id),
        actual = z.number().nonnegative().finite().parse(body.actual);
      const { data: r } = await db
        .from("agency_records")
        .select("payload")
        .eq("id", id)
        .eq("client_id", cid)
        .eq("kind", "goal")
        .single();
      if (!r) throw new Error("Meta não encontrada.");
      const { error } = await db
        .from("agency_records")
        .update({ payload: { ...r.payload, actual } })
        .eq("id", id)
        .eq("client_id", cid);
      if (error) throw new Error("Não foi possível atualizar a meta.");
      return NextResponse.json({ ok: true });
    }
    if (body.action === "status") {
      const id = uuid.parse(body.id);
      const { data: r } = await db
        .from("agency_records")
        .select("*")
        .eq("id", id)
        .eq("client_id", cid)
        .single();
      if (!r) throw new Error("Registro não encontrado.");
      if (r.kind === "report" && r.status === "published")
        throw new Error(
          "Relatórios publicados são preservados. Crie uma nova versão.",
        );
      const status =
        r.kind === "report"
          ? "published"
          : r.kind === "goal"
            ? "resolved"
            : "paused";
      const { error } = await db
        .from("agency_records")
        .update({
          status,
          ...(r.kind === "report" ? { visibility: "shared" } : {}),
        })
        .eq("id", id)
        .eq("client_id", cid);
      if (error) throw new Error("Não foi possível atualizar.");
      return NextResponse.json({ ok: true });
    }
    if (body.action === "access") {
      const email = z.string().email().parse(body.email);
      const { error } = await db.rpc("agency_grant_access", {
        cid,
        target_email: email,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "meta") {
      const account = z
        .string()
        .regex(/^act_\d+$/)
        .parse(body.account_id);
      const bundle = await fetchMetaDashboardData(account, "last_30d");
      const { error } = await db
        .from("agency_clients")
        .update({ meta_account_id: account })
        .eq("id", cid);
      if (error) throw new Error("Não foi possível vincular a conta.");
      const { error: saveError } = await db
        .from("agency_records")
        .insert({
          client_id: cid,
          kind: "snapshot",
          title: "Meta Ads · últimos 30 dias",
          visibility: "shared",
          created_by: user.id,
          payload: { source: "Meta Ads", period: "Últimos 30 dias", bundle },
        });
      if (saveError)
        throw new Error(
          "Dados consultados, mas não foi possível salvar a atualização.",
        );
      return NextResponse.json({ ok: true });
    }
    throw new Error("Ação não reconhecida.");
  } catch (e) {
    return failure(e);
  }
}
