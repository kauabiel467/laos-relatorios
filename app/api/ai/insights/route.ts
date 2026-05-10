import { NextRequest, NextResponse } from "next/server";

type AiInsightRequest = {
  question?: string;
  context?: unknown;
};

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const outputText = (payload as { output_text?: unknown }).output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText;
  }

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";

  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) return [];
      return content.map((part) => {
        if (!part || typeof part !== "object") return "";
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      });
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";

  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY ainda nao esta configurada no servidor." }, { status: 500 });
  }

  const body = (await request.json()) as AiInsightRequest;
  const question = body.question?.trim();

  if (!question) {
    return NextResponse.json({ error: "Envie uma pergunta para a IA." }, { status: 400 });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      instructions:
        "Voce e uma analista senior de Meta Ads da Laos Assessoria. Responda em portugues brasileiro, de forma direta, acionavel e curta. Use apenas os dados enviados no contexto. Quando houver incerteza ou dado faltando, diga isso claramente. Priorize diagnostico, causa provavel e proxima acao.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Pergunta do usuario: ${question}\n\nContexto do dashboard em JSON:\n${JSON.stringify(body.context ?? {}, null, 2)}`
            }
          ]
        }
      ],
      max_output_tokens: 700
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
