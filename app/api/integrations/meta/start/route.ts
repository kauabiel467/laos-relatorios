import { NextRequest, NextResponse } from "next/server";
import {
  buildMetaOAuthUrl,
  createMetaOAuthState,
  getMetaCookieOptions,
  hasMetaOAuthConfig,
  META_OAUTH_STATE_COOKIE,
  META_RETURN_COOKIE
} from "@/lib/integrations/meta-oauth";

export async function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get("returnTo") || "/";

  if (!hasMetaOAuthConfig()) {
    return NextResponse.redirect(new URL(`${returnTo}?meta=error&reason=missing_config`, request.url));
  }

  const { state, returnTo: normalizedReturnTo } = await createMetaOAuthState(returnTo);
  const response = NextResponse.redirect(buildMetaOAuthUrl(state));

  response.cookies.set(META_OAUTH_STATE_COOKIE, state, getMetaCookieOptions(60 * 15));
  response.cookies.set(META_RETURN_COOKIE, normalizedReturnTo, getMetaCookieOptions(60 * 15));

  return response;
}
