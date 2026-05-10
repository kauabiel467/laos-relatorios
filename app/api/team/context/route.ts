import { NextResponse } from "next/server";
import { getTeamContext } from "@/lib/team/server";

export async function GET() {
  return NextResponse.json(await getTeamContext());
}
