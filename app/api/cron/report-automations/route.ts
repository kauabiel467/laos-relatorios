import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createExecutorDeps } from "@/lib/automations/runtime";
import { runSchedulerPass } from "@/lib/automations/scheduler";

export const dynamic = "force-dynamic";
// The pass stops starting new runs after ~45 s, so it always ends inside this.
export const maxDuration = 60;

// Shared-secret check, constant time. Vercel Cron sends "Authorization: Bearer
// $CRON_SECRET" when the CRON_SECRET environment variable is set; any other
// caller (an external pinger) must send the same header. Without a configured
// secret the endpoint is closed to everyone.
function authorized(request: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`));
}

async function handle(request: NextRequest) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "Agendador não configurado." }, { status: 503 });
  }
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const summary = await runSchedulerPass(createExecutorDeps());
    return NextResponse.json({ ok: true, ...summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ scope: "report-automations", event: "scheduler.error", error: error instanceof Error ? error.message.slice(0, 200) : "erro" }));
    return NextResponse.json({ error: "Falha ao executar o agendador." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
