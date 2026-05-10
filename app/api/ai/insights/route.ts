import { NextRequest, NextResponse } from "next/server";

type AiInsightRequest = {
  question?: string;
  context?: unknown;
};

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY ainda nao esta configurada no servidor." }, { status: 500 });
  }

  const body = (await request.json()) as AiInsightRequest;
  const question = body.question?.trim();

  if (!question) {
    return NextResponse.json({ error: "Envie uma pergunta para a IA." }, { status: 400 });
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      system:
        "Voce e uma analista senior de Meta Ads da Laos Assessoria. Responda em portugues brasileiro, de forma direta, acionavel e curta. Use apenas os dados enviados no contexto. Quando houver incerteza ou dado faltando, diga isso claramente. Priorize diagnostico, causa provavel e proxima acao.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Pergunta do usuario: ${question}\n\nContexto do dashboard em JSON:\n${JSON.stringify(body.context ?? {}, null, 2)}`
            }
          ]
        }
      ]
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    const message =
      typeof payload?.error?.message === "string" ? payload.error.message : "Nao foi possivel consultar a IA agora.";
    return NextResponse.json({ error: message }, { status: response.status });
  }

  const answer = extractOutputText(payload);
  return NextResponse.json({
    answer: answer || "Nao consegui gerar uma resposta com os dados atuais."
  });
}
