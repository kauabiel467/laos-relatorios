import { env } from "@/lib/env";

export async function fetchCardapioMetrics() {
  if (!env.CARDAPIO_API_URL || !env.CARDAPIO_API_TOKEN) {
    throw new Error("Credenciais do cardapio ainda nao configuradas.");
  }

  throw new Error("Integracao de cardapio preparada, mas a chamada real depende do contrato final da API.");
}
