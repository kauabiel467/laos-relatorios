import { NextRequest, NextResponse } from "next/server";
import {
  finalizeMetaSelection,
  getMetaCookieOptions,
  getMetaDraft,
  META_CONNECTION_COOKIE,
  META_DRAFT_COOKIE
} from "@/lib/integrations/meta-oauth";

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as { accountIds?: string[] };
  const selectedAccountIds = Array.isArray(payload.accountIds) ? payload.accountIds : [];

  const draft = await getMetaDraft();
  if (!draft) {
    return NextResponse.json({ error: "Nao existe uma conexao pendente da Meta para finalizar." }, { status: 400 });
  }

  if (!selectedAccountIds.length) {
    return NextResponse.json({ error: "Selecione pelo menos uma conta para integrar." }, { status: 400 });
  }

  const validIds = new Set(draft.accounts.map((account) => account.id));
  const normalizedSelection = selectedAccountIds.filter((id) => validIds.has(id));

  if (!normalizedSelection.length) {
    return NextResponse.json({ error: "Nenhuma das contas selecionadas pertence a conexao atual." }, { status: 400 });
  }

  const connection = await finalizeMetaSelection(normalizedSelection);

  const response = NextResponse.json({
    ok: true,
    selectedCount: normalizedSelection.length
  });

  response.cookies.set(META_CONNECTION_COOKIE, connection.serialized, getMetaCookieOptions(60 * 60 * 24 * 30));
  response.cookies.delete(META_DRAFT_COOKIE);

  return response;
}
