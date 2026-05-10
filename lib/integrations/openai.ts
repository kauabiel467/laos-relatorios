import { env } from "@/lib/env";

export async function askAI() {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY nao configurada.");
  }

  throw new Error("Integracao Claude preparada, mas a chamada real deve ser implementada em rota server-side.");
}
