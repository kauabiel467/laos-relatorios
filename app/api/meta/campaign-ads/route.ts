import { NextResponse } from "next/server";

// The account-only legacy API cannot establish a project authorization boundary.
export function GET() {
  return NextResponse.json(
    { error: "Esta consulta legada foi desativada. Abra o projeto e use seus documentos e integrações.", successor: "/api/projects" },
    { status: 410, headers: { "Cache-Control": "no-store", Link: '</api/projects>; rel="successor-version"' } },
  );
}
