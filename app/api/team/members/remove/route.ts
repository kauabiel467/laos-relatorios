import { NextRequest, NextResponse } from "next/server";
import { removeTeamMember } from "@/lib/team/server";
import { z } from "zod";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { memberId?: string; team_id?: string };
  const memberId = body.memberId?.trim();

  const teamId = z.string().uuid().optional().safeParse(body.team_id);
  if (!memberId || !teamId.success) {
    return NextResponse.json({ error: "Informe o membro que sera removido." }, { status: 400 });
  }

  try {
    await removeTeamMember(memberId, teamId.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel remover o membro." }, { status: 500 });
  }
}
