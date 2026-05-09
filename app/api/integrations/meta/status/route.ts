import { NextResponse } from "next/server";
import { getMetaStatus } from "@/lib/integrations/meta-oauth";

export async function GET() {
  const status = await getMetaStatus();
  return NextResponse.json(status);
}
