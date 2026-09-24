import { z } from "zod";

const optionalString = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, z.string().min(1).optional());

const optionalUrl = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, z.string().url().optional());

const sharedSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString
});

const serverSchema = sharedSchema.extend({
  SUPABASE_SECRET_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: optionalString,
  META_APP_ID: optionalString,
  META_APP_SECRET: optionalString,
  META_SYSTEM_USER_TOKEN: optionalString,
  IFOOD_CLIENT_ID: optionalString,
  IFOOD_CLIENT_SECRET: optionalString,
  IFOOD_OAUTH_STATE_SECRET: optionalString,
  IFOOD_TOKEN_ENCRYPTION_KEY: optionalString,
  IFOOD_API_BASE_URL: optionalUrl,
  CARDAPIO_API_URL: optionalUrl,
  CARDAPIO_API_TOKEN: optionalString,
  // Report automations: shared secret for the internal scheduler endpoint and
  // the WhatsApp Cloud API credentials. Server-only; never NEXT_PUBLIC_.
  CRON_SECRET: optionalString,
  WHATSAPP_CLOUD_ACCESS_TOKEN: optionalString,
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: optionalString,
  WHATSAPP_CLOUD_API_VERSION: optionalString,
  // Webhook de status de entrega do WhatsApp: token de verificação (GET) e segredo
  // do app Meta que assina cada POST (X-Hub-Signature-256).
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: optionalString,
  WHATSAPP_APP_SECRET: optionalString
});

export const env = serverSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  META_APP_ID: process.env.META_APP_ID,
  META_APP_SECRET: process.env.META_APP_SECRET,
  META_SYSTEM_USER_TOKEN: process.env.META_SYSTEM_USER_TOKEN,
  IFOOD_CLIENT_ID: process.env.IFOOD_CLIENT_ID,
  IFOOD_CLIENT_SECRET: process.env.IFOOD_CLIENT_SECRET,
  IFOOD_OAUTH_STATE_SECRET: process.env.IFOOD_OAUTH_STATE_SECRET,
  IFOOD_TOKEN_ENCRYPTION_KEY: process.env.IFOOD_TOKEN_ENCRYPTION_KEY,
  IFOOD_API_BASE_URL: process.env.IFOOD_API_BASE_URL,
  CARDAPIO_API_URL: process.env.CARDAPIO_API_URL,
  CARDAPIO_API_TOKEN: process.env.CARDAPIO_API_TOKEN,
  CRON_SECRET: process.env.CRON_SECRET,
  WHATSAPP_CLOUD_ACCESS_TOKEN: process.env.WHATSAPP_CLOUD_ACCESS_TOKEN,
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID,
  WHATSAPP_CLOUD_API_VERSION: process.env.WHATSAPP_CLOUD_API_VERSION,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET
});

export function getSupabaseBrowserKey() {
  return env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function getSupabaseServerKey() {
  return env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
}

export function hasSupabaseEnv() {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && getSupabaseBrowserKey());
}

export function hasServerSupabaseEnv() {
  return Boolean(hasSupabaseEnv() && getSupabaseServerKey());
}
