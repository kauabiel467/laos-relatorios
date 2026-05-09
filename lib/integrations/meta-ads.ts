import { env } from "@/lib/env";

export async function fetchMetaAccounts() {
  if (!env.META_SYSTEM_USER_TOKEN) {
    throw new Error("META_SYSTEM_USER_TOKEN nao configurado.");
  }

  throw new Error("Integracao Meta Ads preparada, mas a chamada real ainda depende do endpoint definitivo e do escopo da conta.");
}
