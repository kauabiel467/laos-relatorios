import { NextResponse } from "next/server";
import { env, hasServerSupabaseEnv, hasSupabaseEnv } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    appUrl: env.NEXT_PUBLIC_APP_URL,
    integrations: {
      supabase: {
        browserReady: hasSupabaseEnv(),
        serverReady: hasServerSupabaseEnv()
      },
      openai: Boolean(env.OPENAI_API_KEY),
      metaAds: Boolean(env.META_SYSTEM_USER_TOKEN),
      cardapio: Boolean(env.CARDAPIO_API_URL && env.CARDAPIO_API_TOKEN)
    }
  });
}
