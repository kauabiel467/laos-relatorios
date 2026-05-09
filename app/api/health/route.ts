import { NextResponse } from "next/server";
import { hasServerSupabaseEnv, hasSupabaseEnv } from "@/lib/env";
import { appConfig } from "@/lib/config/app";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: appConfig.repositoryName,
    services: {
      supabaseClient: hasSupabaseEnv(),
      supabaseAdmin: hasServerSupabaseEnv()
    }
  });
}
