import { env } from "@/lib/env";
import { WhatsAppCloudProvider } from "./cloud-api";

// The single seam between report automations and a WhatsApp delivery service.
// Nothing else in the app talks to WhatsApp: swapping or adding a provider means
// implementing this interface, not touching the executor.

export interface WhatsAppMessage {
  // Canonical E.164 number, "+" included (see phone.ts).
  to: string;
  text: string;
}

export type WhatsAppSendResult =
  | { ok: true; messageId: string; providerStatus: string }
  | {
      ok: false;
      // Stable, provider-independent reason; drives retry behaviour and history.
      code:
        | "provider_not_configured"
        | "provider_auth"
        | "provider_rejected"
        | "recipient_unreachable"
        | "outside_window"
        | "rate_limited"
        | "provider_unavailable";
      // Worth trying again later (timeout, 429, 5xx). Permanent failures are not.
      transient: boolean;
      // Written for people (pt-BR); never contains credentials.
      message: string;
      providerStatus?: string;
    };

export interface WhatsAppProvider {
  readonly name: string;
  // Whether the credentials this provider needs are present.
  isConfigured(): boolean;
  // Whether the provider can deliver to WhatsApp groups. The official Cloud API cannot.
  readonly supportsGroups: boolean;
  send(message: WhatsAppMessage): Promise<WhatsAppSendResult>;
}

// Provider selected by WHATSAPP_PROVIDER. Only the official WhatsApp Cloud API
// exists today; an unset/unknown value yields a provider that reports itself as
// not configured, so runs fail with a readable error instead of sending nothing silently.
export function getWhatsAppProvider(): WhatsAppProvider {
  return new WhatsAppCloudProvider({
    accessToken: env.WHATSAPP_CLOUD_ACCESS_TOKEN,
    phoneNumberId: env.WHATSAPP_CLOUD_PHONE_NUMBER_ID,
    apiVersion: env.WHATSAPP_CLOUD_API_VERSION,
  });
}

// The one function the rest of the app calls.
export function sendWhatsAppMessage(message: WhatsAppMessage, provider: WhatsAppProvider = getWhatsAppProvider()) {
  return provider.send(message);
}
