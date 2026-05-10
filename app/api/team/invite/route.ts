import { NextRequest, NextResponse } from "next/server";
import { inviteTeamMember } from "@/lib/team/server";
import type { TeamRole } from "@/lib/team/types";

const validRoles = new Set<TeamRole>(["owner", "manager", "operator"]);

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: string; role?: TeamRole };
  const email = body.email?.trim();
  const role = body.role && validRoles.has(body.role) ? body.role : null;

  if (!email || !role) {
    return NextResponse.json({ error: "Informe email e papel do membro." }, { status: 400 });
  }

  try {
    const result = await inviteTeamMember(email, role);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel enviar o convite." }, { status: 500 });
  }
}
