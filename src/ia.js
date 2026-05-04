// ─── EXTRAÇÃO DE DADOS VIA IA ────────────────────────────────────────────────

const CLAUDE_API = "https://api.anthropic.com/v1/messages"

// Converte arquivo para base64
export async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(",")[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Lê CSV como texto
export async function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

// ─── EXTRAI DADOS DO CSV DO META ADS ─────────────────────────────────────────
export async function extrairDadosMetaAds(csvText) {
  const prompt = `Você é um especialista em Meta Ads. Analise este CSV exportado do Meta Ads e extraia os dados disponíveis.

O CSV pode ter colunas variadas dependendo do tipo de campanha (vendas, tráfego, WhatsApp, seguidores, etc).

Mapeie o que encontrar para estes campos (deixe null se não existir):
- investimento: valor total gasto (Valor usado, Amount spent, Custo)
- alcance: pessoas alcançadas (Alcance, Reach)
- impressoes: total de impressões
- cliques: cliques no link (Cliques no link, Link clicks)
- cpc: custo por clique (CPC)
- ctr: taxa de clique em % (CTR)
- frequencia: frequência média (Frequência, Frequency)
- vendas: quantidade de compras/pedidos (Compras, Purchases, Resultados)
- valorVendas: valor total em vendas (Valor de conversão, Purchase value)
- roas: retorno sobre investimento (ROAS)
- cpp: custo por resultado/pedido (CPP, Custo por resultado)
- ticketMedio: ticket médio (calcule se tiver vendas e valorVendas)
- tipoCampanha: identifique o tipo (vendas, tráfego, whatsapp, seguidores, outro)
- vendasSemana: array com vendas por semana se disponível, senão null
- criativosTopo: array com nomes/ids dos top criativos se disponível

CSV:
${csvText.substring(0, 8000)}

Responda SOMENTE em JSON válido, sem comentários:
{
  "investimento": number|null,
  "alcance": number|null,
  "impressoes": number|null,
  "cliques": number|null,
  "cpc": number|null,
  "ctr": number|null,
  "frequencia": number|null,
  "vendas": number|null,
  "valorVendas": number|null,
  "roas": number|null,
  "cpp": number|null,
  "ticketMedio": number|null,
  "tipoCampanha": string,
  "vendasSemana": [number,number,number,number]|null,
  "criativosTopo": string[]|null,
  "camposEncontrados": string[],
  "observacoes": string
}`

  const response = await fetch(CLAUDE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  })
  const data = await response.json()
  const text = data.content?.map(b => b.text || "").join("") || "{}"
  const clean = text.replace(/```json|```/g, "").trim()
  return JSON.parse(clean)
}

// ─── EXTRAI DADOS DO PDF/IMAGEM DO CARDÁPIO ──────────────────────────────────
export async function extrairDadosCardapio(file) {
  const base64 = await fileToBase64(file)
  const isPDF = file.type === "application/pdf"
  const mediaType = isPDF ? "application/pdf" : file.type

  const content = isPDF
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
        { type: "text", text: "Extraia os dados de desempenho do cardápio digital deste relatório." }
      ]
    : [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: "Extraia os dados de desempenho do cardápio digital desta imagem." }
      ]

  const prompt = `Analise este relatório/print de cardápio digital (pode ser iFood, Cardápio Web, Goomer, etc) e extraia todos os números disponíveis.

Mapeie para estes campos (null se não encontrar):
- acessos: visitas/acessos ao cardápio
- addCart: adições ao carrinho
- finalizacoes: checkouts/finalizações
- vendas: pedidos realizados/compras
- faturamento: valor total faturado
- ticketMedio: ticket médio por pedido
- novosClientes: novos clientes no período
- produtosMaisVendidos: array com [{nome, quantidade}] dos top produtos
- plataforma: nome da plataforma (iFood, Cardápio Web, Goomer, etc)
- periodo: período do relatório se visível

Responda SOMENTE em JSON válido:
{
  "acessos": number|null,
  "addCart": number|null,
  "finalizacoes": number|null,
  "vendas": number|null,
  "faturamento": number|null,
  "ticketMedio": number|null,
  "novosClientes": number|null,
  "produtosMaisVendidos": [{"nome": string, "quantidade": number}]|null,
  "plataforma": string|null,
  "periodo": string|null,
  "camposEncontrados": string[],
  "observacoes": string
}`

  const response = await fetch(CLAUDE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: isPDF
        ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }, { type: "text", text: prompt }]
        : [{ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }, { type: "text", text: prompt }]
      }],
    }),
  })
  const data = await response.json()
  const text = data.content?.map(b => b.text || "").join("") || "{}"
  const clean = text.replace(/```json|```/g, "").trim()
  return JSON.parse(clean)
}

// ─── GERA ANÁLISE E PLANO DE AÇÃO ────────────────────────────────────────────
export async function gerarAnaliseIA(dados) {
  const prompt = `Você é um especialista em tráfego pago para restaurantes e delivery no Brasil.
Analise os dados abaixo e gere uma análise personalizada para o cliente "${dados.cliente}".

DADOS DO MÊS ATUAL:
- Tipo de campanha: ${dados.tipoCampanha || "vendas"}
- Investimento: R$${dados.investimento || 0}
- Valor em vendas (Meta): R$${dados.valorVendas || 0}
- ROAS: ${dados.roas || 0}
- Custo por pedido (CPP): R$${dados.cpp || 0}
- Ticket médio Meta: R$${dados.ticketMedio || 0}
- Vendas Meta: ${dados.vendas || 0}
- Alcance: ${dados.alcance || 0}
- Cliques: ${dados.cliques || 0}
- CTR: ${dados.ctr || 0}%
- CPC: R$${dados.cpc || 0}
- Frequência: ${dados.frequencia || 0}

CARDÁPIO DIGITAL:
- Acessos: ${dados.acessos || 0}
- Adições ao carrinho: ${dados.addCart || 0}
- Finalizações: ${dados.finalizacoes || 0}
- Vendas: ${dados.vendasCardapio || 0}
- Faturamento: R$${dados.faturamento || 0}
- Ticket médio: R$${dados.ticketCardapio || 0}
- Novos clientes: ${dados.novosClientes || 0}

MÊS ANTERIOR (se disponível):
- Investimento: R$${dados.prevInvestimento || "N/A"}
- Vendas: R$${dados.prevVendas || "N/A"}
- ROAS: ${dados.prevRoas || "N/A"}

META DO PRÓXIMO MÊS (definida pelo gestor): R$${dados.metaProximo || "a definir"}

Gere uma análise consultiva, direta e personalizada. Considere o tipo de campanha ao fazer recomendações.

Responda SOMENTE em JSON válido:
{
  "analise": "2-3 frases de análise geral personalizada para o cliente",
  "destaques": ["ponto positivo 1", "ponto positivo 2"],
  "atencao": ["ponto de atenção 1", "ponto de atenção 2"],
  "plano": {
    "manter": "o que está funcionando e deve continuar",
    "otimizar": "o que precisa de ajuste na estratégia",
    "pausar": "o que pausar ou cortar com critério claro",
    "testes": "próximos testes recomendados para este cliente"
  },
  "meta": number
}`

  const response = await fetch(CLAUDE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    }),
  })
  const data = await response.json()
  const text = data.content?.map(b => b.text || "").join("") || "{}"
  const clean = text.replace(/```json|```/g, "").trim()
  return JSON.parse(clean)
}
