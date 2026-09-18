export const META_GRAPH_VERSION = "v22.0";

export class MetaGraphError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly type?: string,
    public readonly transient = false,
  ) {
    super(message);
    this.name = "MetaGraphError";
  }
}

async function graphPayload(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new MetaGraphError(
      "A Meta respondeu em um formato inesperado. Tente novamente.",
    );
  }
}

// Transport only. Project authorization and credential selection belong to the
// project integration service, never to a second account-only dashboard engine.
export async function fetchGraph<T>(path: string, params: Record<string, string>, accessToken: string) {
  const searchParams = new URLSearchParams({ ...params, access_token: accessToken });
  const started = Date.now();
  let result: Record<string, unknown> | undefined;
  for (let page = 0; page < 50; page++) {
    const remaining = 25000 - (Date.now() - started);
    if (remaining <= 0) throw Error("A consulta excedeu o tempo disponível. Nenhum resultado parcial foi salvo.");
    const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path}?${searchParams.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(Math.min(15000, remaining)),
      headers: { Accept: "application/json" },
    });
    const payload = await graphPayload(response);
    if (!response.ok) {
      throw new MetaGraphError(
        typeof payload?.error?.message === "string"
          ? payload.error.message
          : "Falha ao buscar dados da Meta.",
        typeof payload?.error?.code === "number" ? payload.error.code : undefined,
        typeof payload?.error?.type === "string" ? payload.error.type : undefined,
        payload?.error?.is_transient === true,
      );
    }
    if (!result) result = payload;
    else if (Array.isArray(result.data) && Array.isArray(payload.data)) result.data.push(...payload.data);
    if (!payload.paging?.next) return result as T;
    if (!payload.paging?.cursors?.after) throw Error("A Meta não forneceu o cursor da próxima página. Nenhum resultado parcial foi salvo.");
    searchParams.set("after", payload.paging.cursors.after);
  }
  throw Error("Volume acima do limite desta consulta. Selecione um período menor.");
}
