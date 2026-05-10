import { NextResponse } from "next/server";
import { env, hasServerSupabaseEnv, hasSupabaseEnv } from "@/lib/env";
import { hasMetaOAuthConfig } from "@/lib/integrations/meta-oauth";

export async function GET() {
  return NextResponse.json({
    appUrl: env.NEXT_PUBLIC_APP_URL,
    integrations: {
      supabase: {
        browserReady: hasSupabaseEnv(),
        serverReady: hasServerSupabaseEnv()
      },
      ai: Boolean(env.ANTHROPIC_API_KEY),
      metaAds: {
        oauthReady: hasMetaOAuthConfig(),
        systemUserReady: Boolean(env.META_SYSTEM_USER_TOKEN)
      },
      cardapio: Boolean(env.CARDAPIO_API_URL && env.CARDAPIO_API_TOKEN)
    }
  });
}
