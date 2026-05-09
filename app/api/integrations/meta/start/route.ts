import { NextRequest, NextResponse } from "next/server";
import { buildMetaOAuthUrl, createMetaOAuthState, hasMetaOAuthConfig } from "@/lib/integrations/meta-oauth";

export async function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get("returnTo") || "/";

  if (!hasMetaOAuthConfig()) {
    return NextResponse.redirect(new URL(`${returnTo}?meta=error&reason=missing_config`, request.url));
  }

  const state = await createMetaOAuthState(returnTo);
  return NextResponse.redirect(buildMetaOAuthUrl(state));
}
