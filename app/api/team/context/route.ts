import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTeamContext } from "@/lib/team/server";

export async function GET(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("team_id");
  const parsed = z.string().uuid().optional().safeParse(value ?? undefined);
  if (!parsed.success) return NextResponse.json({ error: "Workspace inválido." }, { status: 400 });
  return NextResponse.json(await getTeamContext(parsed.data), { headers: { "Cache-Control": "private, no-store" } });
}
