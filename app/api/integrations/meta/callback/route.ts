import { NextRequest, NextResponse } from "next/server";
import {
  consumeMetaOAuthState,
  consumeMetaReturnTo,
  exchangeCodeForToken,
  fetchMetaAdAccounts,
  saveMetaDraft
} from "@/lib/integrations/meta-oauth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const errorReason = request.nextUrl.searchParams.get("error_reason");
  const errorDescription = request.nextUrl.searchParams.get("error_description");
  const returnTo = await consumeMetaReturnTo();

  if (errorReason || errorDescription) {
    return NextResponse.redirect(
      new URL(`${returnTo}?meta=error&reason=${encodeURIComponent(errorDescription || errorReason || "oauth_cancelled")}`, request.url)
    );
  }

  const expectedState = await consumeMetaOAuthState();
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL(`${returnTo}?meta=error&reason=invalid_state`, request.url));
  }

  try {
    const accessToken = await exchangeCodeForToken(code);
    const accounts = await fetchMetaAdAccounts(accessToken);

    await saveMetaDraft({
      accessToken,
      accounts,
      connectedAt: new Date().toISOString()
    });

    return NextResponse.redirect(new URL(`${returnTo}?meta=select`, request.url));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao concluir a autenticacao da Meta.";
    return NextResponse.redirect(new URL(`${returnTo}?meta=error&reason=${encodeURIComponent(message)}`, request.url));
  }
}
