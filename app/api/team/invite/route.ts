import { NextRequest, NextResponse } from "next/server";
import { inviteTeamMember } from "@/lib/team/server";
import type { TeamRole } from "@/lib/team/types";
import { z } from "zod";
import { rateLimit, requestIp, tooManyRequestsResponse } from "@/lib/utils/rate-limit";

const validRoles = new Set<TeamRole>(["owner", "manager", "operator"]);

export async function POST(request: NextRequest) {
  const limit = rateLimit(`team-invite:${requestIp(request)}`, 10, 60_000);
  if (!limit.allowed) return tooManyRequestsResponse(limit);
  const body = (await request.json()) as { email?: string; role?: TeamRole; team_id?: string };
  const email = z
    .string()
    .trim()
    .email("Informe um e-mail válido.")
    .max(320, "O e-mail é muito longo.")
    .safeParse(body.email);
  const role = body.role && validRoles.has(body.role) ? body.role : null;

  const teamId = z.string().uuid().optional().safeParse(body.team_id);
  if (!email.success) {
    return NextResponse.json(
      { error: email.error.issues[0]?.message },
      { status: 400 },
    );
  }
  if (!role || !teamId.success) {
    return NextResponse.json({ error: "Informe email e papel do membro." }, { status: 400 });
  }

  try {
    const result = await inviteTeamMember(email.data, role, teamId.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel enviar o convite." }, { status: 500 });
  }
}
