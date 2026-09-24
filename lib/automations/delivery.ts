// What WhatsApp reports about a message AFTER it accepted it. Pure and safe for
// the browser: the history screen and the webhook share these definitions.

export const DELIVERY_STATUSES = ["sent", "delivered", "read", "failed"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export interface DeliveryEvent {
  status: DeliveryStatus;
  occurred_at: string;
  error_code: string | null;
  error_message: string | null;
}

export interface DeliverySummary {
  status: DeliveryStatus;
  occurred_at: string;
  error_code: string | null;
  // pt-BR explanation, only when the message failed.
  error_message: string | null;
}

export const DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  sent: "Enviada ao WhatsApp",
  delivered: "Entregue",
  read: "Lida",
  failed: "Não entregue",
};

// A message that failed is failed, whatever came before; otherwise the furthest
// it got (read > delivered > sent). Events can arrive out of order.
const RANK: Record<DeliveryStatus, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

export function summarizeDelivery(events: DeliveryEvent[]): DeliverySummary | null {
  let best: DeliveryEvent | null = null;
  for (const event of events) {
    if (!best || RANK[event.status] > RANK[best.status]) best = event;
  }
  if (!best) return null;
  return {
    status: best.status,
    occurred_at: best.occurred_at,
    error_code: best.error_code,
    error_message: best.status === "failed" ? best.error_message : null,
  };
}

// WhatsApp's error codes, said in words a person can act on. Unknown codes keep
// the provider's own title so nothing is hidden.
// https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
export function describeDeliveryError(code: string | number | null | undefined, title?: string | null) {
  switch (String(code ?? "")) {
    case "131047":
    case "131051":
      return "Fora da janela de 24 horas: o cliente não falou com o número da agência nas últimas 24 h. É preciso um modelo de mensagem aprovado.";
    case "131030":
      return "Este número não está na lista de destinatários permitidos do número de teste.";
    case "131026":
      return "O WhatsApp não conseguiu entregar a este número (inválido ou sem WhatsApp).";
    case "131042":
      return "Problema de pagamento na conta do WhatsApp Business. Confira a forma de pagamento na Meta.";
    case "131031":
      return "A conta do WhatsApp Business está bloqueada pela Meta.";
    case "131056":
    case "130429":
      return "O WhatsApp limitou temporariamente os envios.";
    case "131000":
      return "O WhatsApp não conseguiu entregar (erro genérico da Meta). Confira a configuração da conta e da cobrança.";
    default:
      return title ? `O WhatsApp não entregou a mensagem: ${String(title).slice(0, 200)}.` : "O WhatsApp não entregou a mensagem.";
  }
}
