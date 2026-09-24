import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { describeDeliveryError, DELIVERY_STATUSES, type DeliveryStatus } from "@/lib/automations/delivery";

// Pure helpers for the WhatsApp Cloud API webhook: checking that a request really
// came from Meta, and reading delivery statuses out of it. No I/O here.

const digest = (value: string) => createHash("sha256").update(value).digest();

// Constant-time comparison of two strings (hashes first, so lengths never leak).
export function safeEqual(a: string, b: string) {
  return timingSafeEqual(digest(a), digest(b));
}

// Meta signs every POST with HMAC-SHA256 of the RAW body, keyed with the app
// secret, in `X-Hub-Signature-256: sha256=<hex>`.
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string) {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return safeEqual(header, expected);
}

export interface ParsedDeliveryStatus {
  providerMessageId: string;
  status: DeliveryStatus;
  occurredAt: string;
  errorCode: string | null;
  errorMessage: string | null;
}

interface RawStatus {
  id?: unknown;
  status?: unknown;
  timestamp?: unknown;
  errors?: { code?: unknown; title?: unknown }[];
}

// Every message status in a webhook payload. Incoming messages, unknown statuses
// and malformed entries are ignored; nothing here is trusted beyond its shape.
export function parseDeliveryStatuses(payload: unknown): ParsedDeliveryStatus[] {
  const out: ParsedDeliveryStatus[] = [];
  const entries = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const statuses = (change as { value?: { statuses?: unknown } })?.value?.statuses;
      if (!Array.isArray(statuses)) continue;
      for (const raw of statuses as RawStatus[]) {
        if (typeof raw?.id !== "string" || !raw.id) continue;
        if (!(DELIVERY_STATUSES as readonly unknown[]).includes(raw.status)) continue;
        const seconds = Number(raw.timestamp);
        const occurred = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
        const failed = raw.status === "failed";
        const first = failed ? raw.errors?.[0] : undefined;
        out.push({
          providerMessageId: raw.id.slice(0, 200),
          status: raw.status as DeliveryStatus,
          occurredAt: occurred.toISOString(),
          errorCode: first?.code != null ? String(first.code).slice(0, 40) : null,
          errorMessage: failed ? describeDeliveryError(first?.code as string | number | undefined, first?.title as string | undefined) : null,
        });
      }
    }
  }
  return out;
}
