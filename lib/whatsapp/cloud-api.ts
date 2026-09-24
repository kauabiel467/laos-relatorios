import type { WhatsAppMessage, WhatsAppProvider, WhatsAppSendResult } from "./provider";

// WhatsApp Cloud API (Meta's official business API). Server-side only: the
// access token comes from the environment and never reaches the browser, a log
// line or the database.
//
// Important platform rule: a free-form text message is only delivered when the
// recipient wrote to the business number in the last 24 hours (customer service
// window). Outside the window WhatsApp requires an approved message template,
// which this provider does not send yet - it reports that case clearly instead.

const DEFAULT_API_VERSION = "v22.0";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_TEXT_LENGTH = 4096;

export interface CloudProviderConfig {
  accessToken?: string;
  phoneNumberId?: string;
  apiVersion?: string;
  // Injectable for tests.
  fetchImpl?: typeof fetch;
}

interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number; error_data?: { details?: string } };
}

// Meta error codes that need a person's action versus ones that clear up on their own.
// https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
function classify(status: number, body: GraphErrorBody): Extract<WhatsAppSendResult, { ok: false }> {
  const code = body.error?.code;
  const providerStatus = `http_${status}${code ? `:${code}` : ""}`;
  if (code === 190 || code === 102 || status === 401) {
    return { ok: false, code: "provider_auth", transient: false, providerStatus, message: "O acesso ao WhatsApp foi recusado. Renove o token da API do WhatsApp." };
  }
  if (code === 131047 || code === 131051) {
    return {
      ok: false, code: "outside_window", transient: false, providerStatus,
      message: "O WhatsApp só entrega mensagens livres se o cliente falou com o número da agência nas últimas 24 horas. Fora dessa janela é preciso um modelo de mensagem aprovado.",
    };
  }
  if (code === 131026 || code === 131030 || code === 133010 || code === 1013) {
    return { ok: false, code: "recipient_unreachable", transient: false, providerStatus, message: "O WhatsApp não conseguiu entregar a este número (inválido, sem WhatsApp ou fora da lista permitida)." };
  }
  if (code === 130429 || code === 131056 || code === 80007 || code === 4 || code === 17 || code === 32 || status === 429) {
    return { ok: false, code: "rate_limited", transient: true, providerStatus, message: "O WhatsApp limitou temporariamente os envios. Uma nova tentativa será feita." };
  }
  if (status >= 500 || code === 131000 || code === 131016 || code === 2) {
    return { ok: false, code: "provider_unavailable", transient: true, providerStatus, message: "O WhatsApp está temporariamente indisponível. Uma nova tentativa será feita." };
  }
  const detail = body.error?.error_data?.details ?? body.error?.message;
  return {
    ok: false, code: "provider_rejected", transient: false, providerStatus,
    message: `O WhatsApp recusou a mensagem${detail ? `: ${String(detail).slice(0, 200)}` : "."}`,
  };
}

export class WhatsAppCloudProvider implements WhatsAppProvider {
  readonly name = "whatsapp_cloud_api";
  readonly supportsGroups = false;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: CloudProviderConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  isConfigured() {
    return Boolean(this.config.accessToken && this.config.phoneNumberId);
  }

  async send(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    if (!this.isConfigured()) {
      return {
        ok: false, code: "provider_not_configured", transient: false,
        message: "O envio por WhatsApp ainda não foi configurado neste ambiente.",
      };
    }
    const to = message.to.replace(/\D/g, "");
    if (message.text.length > MAX_TEXT_LENGTH) {
      return { ok: false, code: "provider_rejected", transient: false, message: "A mensagem passa do limite de 4096 caracteres do WhatsApp." };
    }
    const version = this.config.apiVersion || DEFAULT_API_VERSION;
    let response: Response;
    try {
      response = await this.fetchImpl(`https://graph.facebook.com/${version}/${this.config.phoneNumberId}/messages`, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: true, body: message.text },
        }),
      });
    } catch {
      // Timeouts and network errors: the message may or may not have left, but
      // there is no provider id to prove it, so it is reported as a transient failure.
      return { ok: false, code: "provider_unavailable", transient: true, providerStatus: "network_error", message: "Não foi possível falar com o WhatsApp (tempo esgotado ou sem rede)." };
    }
    let body: GraphErrorBody & { messages?: { id?: string; message_status?: string }[] } = {};
    try {
      body = await response.json();
    } catch {
      /* A non-JSON body is handled through the status code below. */
    }
    if (!response.ok) return classify(response.status, body);
    const accepted = body.messages?.[0];
    if (!accepted?.id) {
      return { ok: false, code: "provider_rejected", transient: false, providerStatus: "no_message_id", message: "O WhatsApp não confirmou o envio da mensagem." };
    }
    return { ok: true, messageId: accepted.id, providerStatus: accepted.message_status ?? "accepted" };
  }
}
