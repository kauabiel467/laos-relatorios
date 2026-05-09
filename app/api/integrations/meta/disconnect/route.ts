import { NextResponse } from "next/server";
import { disconnectMetaIntegration } from "@/lib/integrations/meta-oauth";

export async function POST() {
  await disconnectMetaIntegration();
  return NextResponse.json({ ok: true });
}
