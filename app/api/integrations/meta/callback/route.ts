import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForToken,
  fetchMetaAdAccounts,
  getMetaCookieOptions,
  META_DRAFT_COOKIE,
  META_OAUTH_STATE_COOKIE,
  META_RETURN_COOKIE,
  readMetaOAuthState,
  readMetaReturnTo,
  serializeMetaDraft
} from "@/lib/integrations/meta-oauth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const errorReason = request.nextUrl.searchParams.get("error_reason");
  const errorDescription = request.nextUrl.searchParams.get("error_description");
  const returnTo = await readMetaReturnTo();

  if (errorReason || errorDescription) {
    const response = NextResponse.redirect(
      new URL(`${returnTo}?meta=error&reason=${encodeURIComponent(errorDescription || errorReason || "oauth_cancelled")}`, request.url)
    );
    response.cookies.delete(META_OAUTH_STATE_COOKIE);
    response.cookies.delete(META_RETURN_COOKIE);
    return response;
  }

  const expectedState = await readMetaOAuthState();
  if (!code || !state || !expectedState || state !== expectedState) {
    const response = NextResponse.redirect(new URL(`${returnTo}?meta=error&reason=invalid_state`, request.url));
    response.cookies.delete(META_OAUTH_STATE_COOKIE);
    response.cookies.delete(META_RETURN_COOKIE);
    return response;
  }

  try {
    const accessToken = await exchangeCodeForToken(code);
    const accounts = await fetchMetaAdAccounts(accessToken);

    const response = NextResponse.redirect(new URL(`${returnTo}?meta=select`, request.url));
    response.cookies.delete(META_OAUTH_STATE_COOKIE);
    response.cookies.delete(META_RETURN_COOKIE);
    response.cookies.set(
      META_DRAFT_COOKIE,
      serializeMetaDraft({
        accessToken,
        accounts,
        connectedAt: new Date().toISOString()
      }),
      getMetaCookieOptions(60 * 60 * 24 * 30)
    );

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao concluir a autenticacao da Meta.";
    const response = NextResponse.redirect(new URL(`${returnTo}?meta=error&reason=${encodeURIComponent(message)}`, request.url));
    response.cookies.delete(META_OAUTH_STATE_COOKIE);
    response.cookies.delete(META_RETURN_COOKIE);
    return response;
  }
}
