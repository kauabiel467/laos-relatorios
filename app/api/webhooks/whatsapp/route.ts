import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { recordDeliveryStatuses } from "@/lib/automations/delivery-store";
import { parseDeliveryStatuses, safeEqual, verifyMetaSignature } from "@/lib/whatsapp/webhook";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;

// Meta calls this once to check the URL when the webhook is saved in the app
// dashboard: it sends a token we chose and expects its challenge echoed back.
export async function GET(request: NextRequest) {
  const expected = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!expected) return NextResponse.json({ error: "Webhook não configurado." }, { status: 503 });
  const params = request.nextUrl.searchParams;
  const challenge = params.get("hub.challenge");
  if (params.get("hub.mode") !== "subscribe" || !challenge || !safeEqual(params.get("hub.verify_token") ?? "", expected)) {
    return NextResponse.json({ error: "Verificação recusada." }, { status: 403 });
  }
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}

// Delivery statuses (sent / delivered / read / failed). Every request must carry
// Meta's HMAC signature of the raw body; without it nobody can forge a status.
export async function POST(request: NextRequest) {
  const secret = env.WHATSAPP_APP_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook não configurado." }, { status: 503 });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Corpo grande demais." }, { status: 413 });
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const statuses = parseDeliveryStatuses(payload);
  if (!statuses.length) return NextResponse.json({ ok: true, received: 0, stored: 0 });
  const admin = getSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Serviço indisponível." }, { status: 503 });
  try {
    const result = await recordDeliveryStatuses(admin, statuses);
    // Only ids, statuses and error codes are logged: no numbers, no message text.
    console.info(JSON.stringify({ scope: "report-automations", event: "delivery.webhook", ...result, failed: statuses.filter((item) => item.status === "failed").map((item) => item.errorCode) }));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error(JSON.stringify({ scope: "report-automations", event: "delivery.webhook.error", error: error instanceof Error ? error.message.slice(0, 200) : "erro" }));
    // 5xx makes Meta redeliver, which is what we want when storing failed.
    return NextResponse.json({ error: "Falha ao registrar o status." }, { status: 500 });
  }
}
