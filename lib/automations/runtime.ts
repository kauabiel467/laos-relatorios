import { env } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { collectAnalysisForAutomation } from "@/lib/projects/meta";
import { getWhatsAppProvider } from "@/lib/whatsapp/provider";
import type { ExecutorDeps } from "./executor";
import { SupabaseRunStore } from "./run-store";

// Wires the executor to the real world: service-role database, the Meta
// collector, the WhatsApp provider and the public URL. Server-only. Everything
// the executor decides lives in executor.ts; this file only supplies the parts.

// Where the link of a run's detailed report points. In production it must be a
// real https address: a link to localhost would be sent to a client and be dead.
export function resolvePublicBaseUrl(): string | null {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    if (!base.startsWith("https://") || /\/\/(localhost|127\.|0\.0\.0\.0)/.test(base)) return null;
  }
  return base;
}

// Structured, secret-free logs: identifiers, states and error codes only. The
// message text, the recipient's number and any credential are never logged.
function logEvent(event: string, fields: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "report-automations", event, ...fields }));
}

export function createExecutorDeps(): ExecutorDeps {
  const admin = getSupabaseAdminClient();
  if (!admin) throw Error("Serviço indisponível.");
  return {
    store: new SupabaseRunStore(admin),
    collect: collectAnalysisForAutomation,
    provider: getWhatsAppProvider(),
    publicBaseUrl: resolvePublicBaseUrl(),
    log: logEvent,
  };
}
