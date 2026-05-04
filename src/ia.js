// ─── EXTRAÇÃO DE DADOS VIA IA ────────────────────────────────────────────────

const CLAUDE_API = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_KEY = process.env.REACT_APP_ANTHROPIC_KEY

const HEADERS = {
  "Content-Type": "application/json",
  "x-api-key": ANTHROPIC_KEY,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",
}

export async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(",")[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

// ─── PARSE CSV NO NAVEGADOR (sem IA) ─────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n")
  if (lines.length < 2) return []
  
  // Parse headers respeitando aspas
  const parseRow = (line) => {
    const cols = []
    let current = ""
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        cols.push(current.trim())
        current = ""
      } else {
        current += ch
      }
    }
    cols.push(current.trim())
    return cols
  }

  const headers = parseRow(lines[0])
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseRow(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = vals[i] || "" })
    return obj
  })
}

function toNum(val) {
  if (!val || val === "") return null
  const n = parseFloat(String(val).replace(",", "."))
  return isNaN(n) ? null : n
}

function sumCol(rows, colName) {
  let total = 0
  let found = false
  rows.forEach(row => {
    const v = toNum(row[colName])
    if (v !== null) { total += v; found = true }
  })
  return found ? total : null
}

function avgCol(rows, colName) {
  const vals = rows.map(r => toNum(r[colName])).filter(v => v !== null)
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function weightedAvg(rows, valCol, weightCol) {
  let totalVal = 0, totalWeight = 0
  rows.forEach(row => {
    const v = toNum(row[valCol])
    const w = toNum(row[weightCol])
    if (v !== null && w !== null && w > 0) {
      totalVal += v * w
      totalWeight += w
    }
  })
  return totalWeight > 0 ? totalVal / totalWeight : null
}

// ─── EXTRAI DADOS DO CSV DO META ADS SEM IA ──────────────────────────────────
export async function extrairDadosMetaAds(csvText) {
  const rows = parseCSV(csvText)
  if (!rows.length) return { camposEncontrados: [], observacoes: "CSV vazio ou inválido" }

  // Mapeamento de colunas conhecidas do Meta Ads Brasil
  const COLS = {
    investimento: ["Valor usado (BRL)", "Amount spent (BRL)", "Valor gasto (BRL)"],
    alcance: ["Alcance", "Reach"],
    impressoes: ["Impressões", "Impressions"],
    cliques: ["Cliques no link", "Link clicks"],
    cpc: ["CPC (custo por clique no link) (BRL)", "CPC (cost per link click) (BRL)"],
    ctr: ["CTR (taxa de cliques no link)", "CTR (link click-through rate)"],
    frequencia: ["Frequência", "Frequency"],
    vendas: ["Compras", "Purchases", "Resultados", "Results"],
    valorVendas: ["Valor de conversão da compra", "Purchase conversion value"],
    roas: ["ROAS (retorno sobre o investimento em publicidade) das compras", "Purchase ROAS (return on ad spend)"],
    cpp: ["Custo por compra (BRL)", "Cost per purchase (BRL)"],
    nomeCampanha: ["Nome da campanha", "Campaign name"],
  }

  // Encontra o nome real da coluna no CSV
  const headers = Object.keys(rows[0])
  function findCol(candidates) {
    for (const c of candidates) {
      if (headers.includes(c)) return c
    }
    return null
  }

  const camposEncontrados = []
  const resultado = {}

  // Investimento
  const colInvest = findCol(COLS.investimento)
  if (colInvest) { resultado.investimento = sumCol(rows, colInvest); camposEncontrados.push("Investimento") }

  // Alcance
  const colAlcance = findCol(COLS.alcance)
  if (colAlcance) { resultado.alcance = sumCol(rows, colAlcance); camposEncontrados.push("Alcance") }

  // Impressões
  const colImp = findCol(COLS.impressoes)
  if (colImp) { resultado.impressoes = sumCol(rows, colImp); camposEncontrados.push("Impressões") }

  // Cliques
  const colCliques = findCol(COLS.cliques)
  if (colCliques) { resultado.cliques = sumCol(rows, colCliques); camposEncontrados.push("Cliques") }

  // CPC — média ponderada por cliques
  const colCPC = findCol(COLS.cpc)
  if (colCPC && colCliques) { resultado.cpc = weightedAvg(rows, colCPC, findCol(COLS.cliques)); camposEncontrados.push("CPC") }

  // CTR — em decimal no Meta, converte pra %
  const colCTR = findCol(COLS.ctr)
  if (colCTR) {
    const ctrRaw = avgCol(rows, colCTR)
    resultado.ctr = ctrRaw !== null ? parseFloat((ctrRaw * 100).toFixed(2)) : null
    if (resultado.ctr !== null) camposEncontrados.push("CTR")
  }

  // Frequência
  const colFreq = findCol(COLS.frequencia)
  if (colFreq) { resultado.frequencia = parseFloat((avgCol(rows, colFreq) || 0).toFixed(2)); camposEncontrados.push("Frequência") }

  // Vendas
  const colVendas = findCol(COLS.vendas)
  if (colVendas) { resultado.vendas = sumCol(rows, colVendas); camposEncontrados.push("Vendas") }

  // Valor vendas
  const colValorVendas = findCol(COLS.valorVendas)
  if (colValorVendas) { resultado.valorVendas = sumCol(rows, colValorVendas); camposEncontrados.push("Valor em Vendas") }

  // ROAS — média ponderada por investimento
  const colROAS = findCol(COLS.roas)
  if (colROAS && colInvest) {
    resultado.roas = parseFloat((weightedAvg(rows, colROAS, findCol(COLS.investimento)) || 0).toFixed(2))
    camposEncontrados.push("ROAS")
  }

  // CPP
  const colCPP = findCol(COLS.cpp)
  if (colCPP && colInvest) { resultado.cpp = weightedAvg(rows, colCPP, findCol(COLS.investimento)); camposEncontrados.push("CPP") }

  // Ticket médio calculado
  if (resultado.valorVendas && resultado.vendas && resultado.vendas > 0) {
    resultado.ticketMedio = parseFloat((resultado.valorVendas / resultado.vendas).toFixed(2))
    camposEncontrados.push("Ticket Médio (calculado)")
  }

  // Tipo de campanha pelo nome
  const colNome = findCol(COLS.nomeCampanha)
  if (colNome) {
    const nomes = rows.map(r => (r[colNome] || "").toLowerCase()).join(" ")
    if (nomes.includes("whatsapp")) resultado.tipoCampanha = "whatsapp"
    else if (nomes.includes("seguidores") || nomes.includes("engajamento")) resultado.tipoCampanha = "engajamento"
    else if (nomes.includes("tráfego") || nomes.includes("trafego")) resultado.tipoCampanha = "tráfego"
    else resultado.tipoCampanha = "vendas"
  }

  resultado.camposEncontrados = camposEncontrados
  resultado.observacoes = `${rows.length} campanhas encontradas. ${camposEncontrados.length} campos extraídos.`
  resultado.vendasSemana = null
  resultado.criativosTopo = null

  return resultado
}

// ─── EXTRAI DADOS DO PDF/IMAGEM DO CARDÁPIO (ainda usa IA) ───────────────────
export async function extrairDadosCardapio(file) {
  const base64 = await fileToBase64(file)
  const isPDF = file.type === "application/pdf"
  const mediaType = isPDF ? "application/pdf" : file.type

  const prompt = `Analise este relatório/print de cardápio digital e extraia todos os números disponíveis.

Mapeie para estes campos (null se não encontrar):
- acessos, addCart, finalizacoes, vendas, faturamento, ticketMedio, novosClientes
- produtosMaisVendidos: [{nome, quantidade}]
- plataforma, periodo

Responda SOMENTE em JSON válido sem markdown:
{"acessos":null,"addCart":null,"finalizacoes":null,"vendas":null,"faturamento":null,"ticketMedio":null,"novosClientes":null,"produtosMaisVendidos":null,"plataforma":null,"periodo":null,"camposEncontrados":[],"observacoes":""}`

  const response = await fetch(CLAUDE_API, {
    method: "POST",
    headers: HEADERS,
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

// ─── GERA ANÁLISE E PLANO DE AÇÃO (usa IA) ───────────────────────────────────
export async function gerarAnaliseIA(dados) {
  const prompt = `Você é um especialista em tráfego pago para restaurantes e delivery no Brasil.
Analise os dados e gere uma análise personalizada para o cliente "${dados.cliente}".

DADOS:
- Tipo de campanha: ${dados.tipoCampanha || "vendas"}
- Investimento: R$${dados.investimento || 0}
- Valor em vendas: R$${dados.valorVendas || 0}
- ROAS: ${dados.roas || 0}
- CPP: R$${dados.cpp || 0}
- Ticket médio: R$${dados.ticketMedio || 0}
- Vendas: ${dados.vendas || 0}
- Alcance: ${dados.alcance || 0}
- Cliques: ${dados.cliques || 0}
- CTR: ${dados.ctr || 0}%
- CPC: R$${dados.cpc || 0}
- Frequência: ${dados.frequencia || 0}
- Faturamento cardápio: R$${dados.faturamento || 0}
- Novos clientes: ${dados.novosClientes || 0}
- Mês anterior ROAS: ${dados.prevRoas || "N/A"}
- Mês anterior investimento: R$${dados.prevInvestimento || "N/A"}

Responda SOMENTE em JSON válido sem markdown:
{"analise":"","destaques":["",""],"atencao":["",""],"plano":{"manter":"","otimizar":"","pausar":"","testes":""},"meta":0}`

  const response = await fetch(CLAUDE_API, {
    method: "POST",
    headers: HEADERS,
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
