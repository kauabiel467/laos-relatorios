import { NextRequest, NextResponse } from "next/server";
import { createTeam } from "@/lib/team/server";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Nao foi possivel criar a equipe.";
}

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
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
