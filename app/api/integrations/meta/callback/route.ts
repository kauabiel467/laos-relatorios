import { NextRequest, NextResponse } from "next/server";
import {
  META_OAUTH_STATE_COOKIE,
  META_RETURN_COOKIE,
  readMetaSessionToken,
  readMetaOAuthState,
  readMetaReturnTo,
  exchangeCodeForToken,
  fetchMetaAdAccounts,
  saveMetaDraft
} from "@/lib/integrations/meta-oauth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const errorReason = request.nextUrl.searchParams.get("error_reason");
  const errorDescription = request.nextUrl.searchParams.get("error_description");
  const returnTo = await readMetaReturnTo();

  if (errorReason || errorDescription) {
    const response = NextResponse.redirect(
      new URL(`${returnTo}${returnTo.includes("?") ? "&" : "?"}meta=error&reason=${encodeURIComponent(errorDescription || errorReason || "oauth_cancelled")}`, request.url)
    );
    response.cookies.delete(META_OAUTH_STATE_COOKIE);
    response.cookies.delete(META_RETURN_COOKIE);
    return response;
  }

  const expectedState = await readMetaOAuthState();
  if (!code || !state || !expectedState || state !== expectedState) {
    const response = NextResponse.redirect(new URL(`${returnTo}${returnTo.includes("?") ? "&" : "?"}meta=error&reason=invalid_state`, request.url));
    response.cookies.delete(META_OAUTH_STATE_COOKIE);
    response.cookies.delete(META_RETURN_COOKIE);
    return response;
  }

  try {
    const sessionToken = await readMetaSessionToken();
    if (!sessionToken) {
      const response = NextResponse.redirect(new URL(`${returnTo}${returnTo.includes("?") ? "&" : "?"}meta=error&reason=session_missing`, request.url));
      response.cookies.delete(META_OAUTH_STATE_COOKIE);
      response.cookies.delete(META_RETURN_COOKIE);
      return response;
    }

    const accessToken = await exchangeCodeForToken(code);
    const accounts = await fetchMetaAdAccounts(accessToken);

    const response = NextResponse.redirect(new URL(`${returnTo}${returnTo.includes("?") ? "&" : "?"}meta=select`, request.url));
    response.cookies.delete(META_OAUTH_STATE_COOKIE);
    response.cookies.delete(META_RETURN_COOKIE);
    await saveMetaDraft(sessionToken, {
      accessToken,
      accounts,
      connectedAt: new Date().toISOString()
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao concluir a autenticacao da Meta.";
    const response = NextResponse.redirect(new URL(`${returnTo}${returnTo.includes("?") ? "&" : "?"}meta=error&reason=${encodeURIComponent(message)}`, request.url));
    response.cookies.delete(META_OAUTH_STATE_COOKIE);
    response.cookies.delete(META_RETURN_COOKIE);
    return response;
  }
}
