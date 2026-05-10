import { NextRequest, NextResponse } from "next/server";
import { createTeam } from "@/lib/team/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: "Informe o nome da equipe." }, { status: 400 });
  }

  try {
    await createTeam(name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel criar a equipe." }, { status: 500 });
  }
}
