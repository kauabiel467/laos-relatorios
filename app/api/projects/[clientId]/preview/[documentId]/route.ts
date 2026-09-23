import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeProject, ProjectAccessError } from "@/lib/projects/access";
import { getProjectDocument } from "@/lib/projects/documents";
import { rateLimit, requestIp, tooManyRequestsResponse } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();

// Authenticated equivalent of the public dashboard RPC, same response shape,
// so "ver como cliente" renders through the exact same DashboardSnapshotView
// as the actual public link - no share_token involved here, this is a staff
// preview gated by the normal project RLS, not the public share mechanism.
export async function GET(request: NextRequest, context: { params: Promise<{ clientId: string; documentId: string }> }) {
  const limit = rateLimit(`projects:preview:${requestIp(request)}`, 60, 60_000);
  if (!limit.allowed) return tooManyRequestsResponse(limit);

  try {
    const { clientId, documentId } = await context.params;
    const cid = uuid.parse(clientId);
    const did = uuid.parse(documentId);
    const { db, client } = await authorizeProject(cid);
    const document = await getProjectDocument(db, cid, did);
    if (document.kind !== "dashboard") {
      return NextResponse.json({ error: "Apenas dashboards têm essa pré-visualização." }, { status: 400 });
    }
    return NextResponse.json(
      {
        title: document.title,
        config: document.config,
        data: document.data,
        updated_at: document.updated_at,
        client_name: client.name,
        client_logo_url: client.logo_url ?? null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Projeto ou documento inválido." }, { status: 400 });
    }
    return NextResponse.json({ error: "Não foi possível carregar a pré-visualização." }, { status: 500 });
  }
}
