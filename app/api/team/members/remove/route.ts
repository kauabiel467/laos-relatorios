import { NextRequest, NextResponse } from "next/server";
import { removeTeamMember } from "@/lib/team/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { memberId?: string };
  const memberId = body.memberId?.trim();

  if (!memberId) {
    return NextResponse.json({ error: "Informe o membro que sera removido." }, { status: 400 });
  }

  try {
    await removeTeamMember(memberId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel remover o membro." }, { status: 500 });
  }
}
