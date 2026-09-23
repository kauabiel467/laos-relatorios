import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { rateLimit, requestIp, tooManyRequestsResponse } from "@/lib/utils/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = NextResponse.json(
  { error: "Link não encontrado ou expirado." },
  { status: 404, headers: { "Cache-Control": "no-store" } },
);

type PublicDashboardRow = {
  title: string;
  config: unknown;
  data: unknown;
  updated_at: string;
  client_name: string;
  client_logo_url: string | null;
};

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const limit = rateLimit(`public-dashboard:${requestIp(request)}`, 30, 60_000);
  if (!limit.allowed) return tooManyRequestsResponse(limit);

  const { token } = await context.params;
  const parsedToken = z.string().uuid().safeParse(token);
  if (!parsedToken.success) {
    return NextResponse.json({ error: "Link inválido." }, { status: 400 });
  }

  const db = getSupabaseAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Serviço indisponível." }, { status: 503 });
  }

  // A wrong token, a despublicado document, or a non-dashboard kind all fall
  // through to the same empty result at the database level - the route just
  // turns "no row" into the same generic 404, never a 403 that would leak
  // whether a token exists but is unpublished.
  const { data, error } = await db
    .rpc("get_public_dashboard", { p_token: parsedToken.data })
    .maybeSingle<PublicDashboardRow>();
  if (error || !data) return NOT_FOUND;

  return NextResponse.json(
    {
      title: data.title,
      config: data.config,
      data: data.data,
      updated_at: data.updated_at,
      client_name: data.client_name,
      client_logo_url: data.client_logo_url,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
