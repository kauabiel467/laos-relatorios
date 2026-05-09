import { NextResponse } from "next/server";
import { disconnectMetaIntegration } from "@/lib/integrations/meta-oauth";

export async function POST() {
  const cookieNames = await disconnectMetaIntegration();
  const response = NextResponse.json({ ok: true });

  cookieNames.forEach((cookieName) => {
    response.cookies.delete(cookieName);
  });

  return response;
}
