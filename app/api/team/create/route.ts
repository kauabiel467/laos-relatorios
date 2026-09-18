import { NextRequest, NextResponse } from "next/server";
import { createTeam } from "@/lib/team/server";
import { z } from "zod";

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
  const parsed = z
    .string()
    .trim()
    .min(2, "Informe um nome com pelo menos 2 caracteres.")
    .max(120, "O nome da equipe pode ter no máximo 120 caracteres.")
    .safeParse(body.name);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  try {
    await createTeam(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
