import { env } from "@/lib/env";

export async function askOpenAI() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY nao configurada.");
  }

  throw new Error("Integracao OpenAI preparada, mas a chamada real deve ser implementada em rota server-side.");
}
