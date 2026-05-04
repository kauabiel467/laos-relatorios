import { useState, useEffect, useCallback } from "react"
import { supabase } from "./supabase"
import { extrairDadosMetaAds, extrairDadosCardapio, gerarAnaliseIA, fileToText } from "./ia"

// ─── PALETA ──────────────────────────────────────────────────────────────────
const C = {
  bg: "#060D1F", card: "#0B1628", cardBorder: "#1A2540",
  accent: "#00C6FF", accentDim: "rgba(0,198,255,0.10)", accentBorder: "rgba(0,198,255,0.25)",
  text: "#E8EDF5", muted: "#5A6A85", green: "#00E5A0", red: "#FF4D6A", yellow: "#FFD166",
  grad: "linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)",
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (v, pre = "R$") => v == null || isNaN(v) ? "—" : pre + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtN = v => v == null || isNaN(v) ? "—" : Number(v).toLocaleString("pt-BR")
const pct = (a, b) => b && b !== 0 ? (((a - b) / b) * 100).toFixed(1) : null

function Badge({ value }) {
  if (value == null) return null
  const up = value >= 0
  return <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: up ? "rgba(0,229,160,0.15)" : "rgba(255,77,106,0.15)", color: up ? C.green : C.red, marginLeft: 6 }}>{up ? "▲" : "▼"} {Math.abs(value)}%</span>
}

// ─── MINI CHART ──────────────────────────────────────────────────────────────
function MiniChart({ data, color = C.accent }) {
  if (!data || data.filter(Boolean).length < 2) return null
  const max = Math.max(...data, 1), min = Math.min(...data), range = max - min || 1
  const W = 100, H = 32
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * (H - 6)}`).join(" ")
  return <svg width={W} height={H}><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" /><circle cx={pts.split(" ").pop().split(",")[0]} cy={pts.split(" ").pop().split(",")[1]} r="3" fill={color} /></svg>
}

// ─── CARD MÉTRICA ─────────────────────────────────────────────────────────────
function MetCard({ label, value, prev, chart, pre = "", suf = "" }) {
  const d = prev != null ? pct(parseFloat(value), parseFloat(prev)) : null
  return (
    <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{pre}{value != null ? fmtN(value) : "—"}{suf}</span>
        <Badge value={d} />
      </div>
      {prev != null && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Ant: {pre}{fmtN(prev)}{suf}</div>}
      {chart && <div style={{ marginTop: 8 }}><MiniChart data={chart} /></div>}
    </div>
  )
}

// ─── FUNIL ────────────────────────────────────────────────────────────────────
function Funil({ steps }) {
  const base = steps[0]?.value || 1
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {steps.map((s, i) => {
        const p = ((s.value / base) * 100).toFixed(1)
        return (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: C.muted }}>{s.label}</span>
              <span style={{ fontSize: 12, color: C.accent, fontWeight: 700 }}>{p}%</span>
            </div>
            <div style={{ height: 7, background: C.cardBorder, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${p}%`, background: C.grad, borderRadius: 4 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── BARRA PRODUTOS ───────────────────────────────────────────────────────────
function BarChart({ items }) {
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: C.muted, width: 130, textAlign: "right", flexShrink: 0 }}>{item.label}</span>
          <div style={{ flex: 1, height: 9, background: C.cardBorder, borderRadius: 5, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(item.value / max) * 100}%`, background: C.grad, borderRadius: 5 }} />
          </div>
          <span style={{ fontSize: 12, color: C.text, width: 45, flexShrink: 0 }}>{fmtN(item.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── SLIDE VIEWER ─────────────────────────────────────────────────────────────
function SlideViewer({ rel, onClose }) {
  const [cur, setCur] = useState(0)
  if (!rel) return null
  const { dados, analise } = rel
  const d = dados || {}
  const a = analise || {}

  const SLIDES = [
    // 1 — Capa
    {
      gradient: true,
      content: (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", gap: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Laos × {rel.cliente}</div>
          <div style={{ fontSize: 44, fontWeight: 900, color: "#fff", lineHeight: 1.1 }}>Relatório<br />{rel.mes}</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Acompanhamento de resultados mensal</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 10 }}>
            {[
              { l: "Investimento", v: fmt(d.investimento) },
              { l: "Faturamento", v: fmt(d.faturamento) },
              { l: "ROAS", v: d.roas || "—" },
              { l: "Novos clientes", v: fmtN(d.novosClientes) },
            ].map((m, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px 18px" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>{m.l}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{m.v}</div>
              </div>
            ))}
          </div>
        </div>
      )
    },
    // 2 — Métricas de Vendas
    {
      dark: true,
      tag: "Meta Ads",
      title: "Métricas de Vendas",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <MetCard label="Vendas" value={d.vendas} prev={d.prevVendas} />
            <MetCard label="Custo/pedido" value={d.cpp} prev={d.prevCpp} pre="R$" />
            <MetCard label="Ticket médio" value={d.ticketMedio} pre="R$" />
            <MetCard label="ROAS" value={d.roas} prev={d.prevRoas} />
            <MetCard label="Investimento" value={d.investimento} prev={d.prevInvestimento} pre="R$" />
            <MetCard label="Valor vendas" value={d.valorVendas} pre="R$" />
          </div>
          {d.vendasSemana?.filter(Boolean).length > 1 && (
            <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Vendas por semana</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 60 }}>
                {d.vendasSemana.map((v, i) => {
                  const max = Math.max(...d.vendasSemana, 1)
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>{v}</span>
                      <div style={{ width: "100%", height: `${(v / max) * 48}px`, background: C.grad, borderRadius: "4px 4px 0 0" }} />
                      <span style={{ fontSize: 10, color: C.muted }}>S{i + 1}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )
    },
    // 3 — Cardápio Digital
    {
      tag: "Cardápio Digital",
      title: "Resultados do Cardápio",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <MetCard label="Acessos" value={d.acessos} />
            <MetCard label="Add carrinho" value={d.addCart} />
            <MetCard label="Finalizações" value={d.finalizacoes} />
            <MetCard label="Vendas" value={d.vendasCardapio} />
            <MetCard label="Novos clientes" value={d.novosClientes} />
            <MetCard label="Faturamento" value={d.faturamento} pre="R$" />
            <MetCard label="Ticket médio" value={d.ticketCardapio} pre="R$" />
          </div>
          {d.acessos && d.vendasCardapio && (
            <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Funil de conversão</div>
              <Funil steps={[
                { label: "Acessos", value: d.acessos },
                { label: "Add carrinho", value: d.addCart || 0 },
                { label: "Finalizações", value: d.finalizacoes || 0 },
                { label: "Vendas", value: d.vendasCardapio },
              ].filter(s => s.value > 0)} />
            </div>
          )}
        </div>
      )
    },
    // 4 — Tráfego
    {
      dark: true,
      tag: "Tráfego",
      title: "Métricas de Tráfego",
      content: (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <MetCard label="Alcance" value={d.alcance} />
          <MetCard label="Cliques" value={d.cliques} />
          <MetCard label="CPC" value={d.cpc} pre="R$" />
          <MetCard label="CTR" value={d.ctr} suf="%" />
          <MetCard label="Frequência" value={d.frequencia} />
          {d.impressoes && <MetCard label="Impressões" value={d.impressoes} />}
        </div>
      )
    },
    // 5 — Produtos
    ...(d.produtosMaisVendidos?.length > 0 ? [{
      tag: "Produtos",
      title: "Mais Vendidos",
      content: (
        <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: 20 }}>
          <BarChart items={d.produtosMaisVendidos.map(p => ({ label: p.nome, value: p.quantidade }))} />
        </div>
      )
    }] : []),
    // 6 — Análise IA
    {
      gradient: true,
      tag: "Análise",
      title: "Visão Geral do Mês",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.7, margin: 0 }}>{a.analise}</p>
          {a.destaques?.length > 0 && (
            <div style={{ background: "rgba(0,229,160,0.08)", border: "1px solid rgba(0,229,160,0.2)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, color: C.green, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>✅ Destaques positivos</div>
              {a.destaques.map((d, i) => <div key={i} style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 6 }}>· {d}</div>)}
            </div>
          )}
          {a.atencao?.length > 0 && (
            <div style={{ background: "rgba(255,209,102,0.08)", border: "1px solid rgba(255,209,102,0.2)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, color: C.yellow, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>⚠️ Pontos de atenção</div>
              {a.atencao.map((d, i) => <div key={i} style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 6 }}>· {d}</div>)}
            </div>
          )}
        </div>
      )
    },
    // 7 — Plano de Ação
    {
      dark: true,
      tag: "Plano de Ação",
      title: "O Que Fazemos Agora",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { icon: "✅", label: "Manter", key: "manter", color: C.green },
            { icon: "⚡", label: "Otimizar", key: "otimizar", color: C.accent },
            { icon: "🚫", label: "Pausar / Cortar", key: "pausar", color: C.red },
            { icon: "🧪", label: "Próximos testes", key: "testes", color: C.yellow },
          ].map((item, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: "14px 16px", display: "flex", gap: 14 }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: item.color, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>{a.plano?.[item.key] || "—"}</div>
              </div>
            </div>
          ))}
        </div>
      )
    },
    // 8 — Meta
    {
      gradient: true,
      tag: "Próximos Meses",
      title: `Meta: ${fmt(a.meta)}`,
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { icon: "📊", title: "Otimização", desc: "Manter CPA abaixo de 10% do ticket médio" },
            { icon: "📈", title: "Crescimento", desc: "2× pedidos com ROAS acima de 7" },
            { icon: "🚀", title: "Expansão", desc: "Aumentar ticket médio +7% via combos/upsell" },
          ].map((item, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px", display: "flex", gap: 14 }}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{item.title}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )
    },
  ]

  const total = SLIDES.length
  const s = SLIDES[cur]

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.93)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", width: 860, maxWidth: "95vw" }}>
        <button onClick={onClose} style={{ position: "absolute", top: -44, right: 0, background: "none", border: "none", color: C.muted, fontSize: 26, cursor: "pointer" }}>✕</button>

        <div style={{
          borderRadius: 20, padding: "36px 44px", minHeight: 420,
          background: s.gradient
            ? "linear-gradient(135deg, #002D5A 0%, #004F99 50%, #0080BB 100%)"
            : s.dark ? "#060D1F" : C.card,
          border: `1px solid ${s.gradient ? "transparent" : C.cardBorder}`,
          overflowY: "auto", maxHeight: "75vh",
        }}>
          {s.tag && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: s.gradient ? "rgba(255,255,255,0.45)" : C.accent, textTransform: "uppercase", marginBottom: 10 }}>{s.tag}</div>}
          {s.title && <h2 style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: "0 0 20px", lineHeight: 1.15 }}>{s.title}</h2>}
          {s.content}
        </div>

        {/* Navegação */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <button onClick={() => setCur(c => Math.max(0, c - 1))} disabled={cur === 0}
            style={{ background: C.card, border: `1px solid ${C.cardBorder}`, color: C.text, padding: "8px 20px", borderRadius: 8, cursor: "pointer", opacity: cur === 0 ? 0.3 : 1 }}>←</button>
          <div style={{ flex: 1, height: 4, background: C.cardBorder, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${((cur + 1) / total) * 100}%`, background: C.grad, transition: "width 0.3s" }} />
          </div>
          <span style={{ fontSize: 12, color: C.muted, minWidth: 36, textAlign: "center" }}>{cur + 1}/{total}</span>
          <button onClick={() => setCur(c => Math.min(total - 1, c + 1))} disabled={cur === total - 1}
            style={{ background: C.card, border: `1px solid ${C.cardBorder}`, color: C.text, padding: "8px 20px", borderRadius: 8, cursor: "pointer", opacity: cur === total - 1 ? 0.3 : 1 }}>→</button>
        </div>
      </div>
    </div>
  )
}

// ─── UPLOAD ZONE ──────────────────────────────────────────────────────────────
function UploadZone({ label, accept, onFile, file, loading, extracted }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8 }}>{label}</label>
      <label style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 8, padding: "24px", border: `2px dashed ${file ? C.accent : C.cardBorder}`,
        borderRadius: 12, cursor: "pointer", background: file ? C.accentDim : "transparent",
        transition: "all 0.2s",
      }}>
        <input type="file" accept={accept} onChange={e => onFile(e.target.files[0])} style={{ display: "none" }} />
        {loading ? (
          <span style={{ color: C.accent, fontSize: 13 }}>⏳ Lendo com IA...</span>
        ) : file ? (
          <>
            <span style={{ color: C.green, fontSize: 20 }}>✓</span>
            <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{file.name}</span>
            {extracted && <span style={{ color: C.muted, fontSize: 11 }}>{extracted} campos extraídos</span>}
          </>
        ) : (
          <>
            <span style={{ fontSize: 28 }}>📁</span>
            <span style={{ color: C.muted, fontSize: 13 }}>Clique para fazer upload</span>
            <span style={{ color: C.muted, fontSize: 11 }}>{accept}</span>
          </>
        )}
      </label>
    </div>
  )
}

// ─── CAMPO MANUAL ─────────────────────────────────────────────────────────────
function Campo({ label, k, dados, setDados, type = "number", placeholder = "" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>{label}</label>
      <input
        type={type} value={dados[k] ?? ""} placeholder={placeholder}
        onChange={e => setDados(d => ({ ...d, [k]: type === "number" ? parseFloat(e.target.value) || "" : e.target.value }))}
        style={{ background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 14, outline: "none" }}
      />
    </div>
  )
}

// ─── FORM NOVO RELATÓRIO ──────────────────────────────────────────────────────
const GESTORES_PADRAO = ["Kauã", "Gestor 2", "Gestor 3"]
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"]

function FormNovo({ onSave }) {
  const [step, setStep] = useState(1)
  const [info, setInfo] = useState({ cliente: "", gestor: GESTORES_PADRAO[0], mes: "" })
  const [dados, setDados] = useState({})
  const [analise, setAnalise] = useState(null)

  // upload state
  const [metaFile, setMetaFile] = useState(null)
  const [cardapioFile, setCardapioFile] = useState(null)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [loadingCardapio, setLoadingCardapio] = useState(false)
  const [loadingIA, setLoadingIA] = useState(false)
  const [metaExtraidos, setMetaExtraidos] = useState(null)
  const [cardapioExtraidos, setCardapioExtraidos] = useState(null)

  async function handleMetaUpload(file) {
    if (!file) return
    setMetaFile(file)
    setLoadingMeta(true)
    try {
      const text = await fileToText(file)
      const extraido = await extrairDadosMetaAds(text)
      setMetaExtraidos(extraido.camposEncontrados?.length || 0)
      setDados(d => ({ ...d, ...extraido }))
    } catch (e) { alert("Erro ao ler CSV: " + e.message) }
    setLoadingMeta(false)
  }

  async function handleCardapioUpload(file) {
    if (!file) return
    setCardapioFile(file)
    setLoadingCardapio(true)
    try {
      const extraido = await extrairDadosCardapio(file)
      setCardapioExtraidos(extraido.camposEncontrados?.length || 0)
      setDados(d => ({
        ...d,
        acessos: extraido.acessos,
        addCart: extraido.addCart,
        finalizacoes: extraido.finalizacoes,
        vendasCardapio: extraido.vendas,
        faturamento: extraido.faturamento,
        ticketCardapio: extraido.ticketMedio,
        novosClientes: extraido.novosClientes,
        produtosMaisVendidos: extraido.produtosMaisVendidos,
      }))
    } catch (e) { alert("Erro ao ler arquivo: " + e.message) }
    setLoadingCardapio(false)
  }

  async function gerarAnalise() {
    setLoadingIA(true)
    try {
      const payload = { ...info, ...dados }
      const a = await gerarAnaliseIA(payload)
      setAnalise(a)
      setStep(4)
    } catch (e) { alert("Erro IA: " + e.message) }
    setLoadingIA(false)
  }

  async function finalizar() {
    const relatorio = {
      cliente: info.cliente, mes: info.mes, gestor: info.gestor,
      dados, analise, criado_em: new Date().toISOString(),
    }
    const { data, error } = await supabase.from("relatorios").insert([relatorio]).select()
    if (error) { alert("Erro ao salvar: " + error.message); return }
    onSave(data[0])
  }

  const inp = (label, k, type = "number", ph = "") =>
    <Campo label={label} k={k} dados={dados} setDados={setDados} type={type} placeholder={ph} />

  const btnNext = (fn, disabled) => (
    <button onClick={fn} disabled={disabled}
      style={{ width: "100%", background: disabled ? C.cardBorder : C.grad, border: "none", borderRadius: 10, padding: "13px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", marginTop: 8 }}>
      Próximo →
    </button>
  )

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      {/* Steps */}
      <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
        {["Identificação", "Meta Ads", "Cardápio", "Análise IA"].map((s, i) => (
          <div key={i} style={{ flex: 1 }}>
            <div style={{ height: 3, background: step > i ? C.accent : C.cardBorder, borderRadius: 2, marginBottom: 5 }} />
            <span style={{ fontSize: 10, color: step > i ? C.accent : C.muted, fontWeight: 600 }}>{s}</span>
          </div>
        ))}
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: 0 }}>Identificação</h2>
          {[
            { label: "Nome do cliente", k: "cliente", type: "text", ph: "Ex: Rocket Açaí" },
          ].map(f => (
            <div key={f.k} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{f.label}</label>
              <input type={f.type} value={info[f.k]} onChange={e => setInfo(i => ({ ...i, [f.k]: e.target.value }))} placeholder={f.ph}
                style={{ background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14, outline: "none" }} />
            </div>
          ))}
          {[
            { label: "Gestor responsável", k: "gestor", opts: GESTORES_PADRAO },
            { label: "Mês de referência", k: "mes", opts: MESES },
          ].map(f => (
            <div key={f.k} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{f.label}</label>
              <select value={info[f.k]} onChange={e => setInfo(i => ({ ...i, [f.k]: e.target.value }))}
                style={{ background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14, outline: "none" }}>
                {f.k === "mes" && <option value="">Selecione o mês</option>}
                {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          {btnNext(() => setStep(2), !info.cliente || !info.mes)}
        </div>
      )}

      {/* STEP 2 — Meta Ads */}
      {step === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: 0 }}>Meta Ads</h2>
          <UploadZone
            label="CSV do Meta Ads (qualquer tipo de campanha)"
            accept=".csv"
            onFile={handleMetaUpload}
            file={metaFile}
            loading={loadingMeta}
            extracted={metaExtraidos}
          />
          {metaFile && !loadingMeta && (
            <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: 20 }}>
              <p style={{ color: C.accent, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", margin: "0 0 14px" }}>
                Complemente ou corrija os dados extraídos
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {inp("Investimento (R$)", "investimento")}
                {inp("Valor vendas (R$)", "valorVendas")}
                {inp("ROAS", "roas")}
                {inp("Custo/pedido (R$)", "cpp")}
                {inp("Ticket médio (R$)", "ticketMedio")}
                {inp("Qtd. vendas", "vendas")}
                {inp("Alcance", "alcance")}
                {inp("Cliques", "cliques")}
                {inp("CPC (R$)", "cpc")}
                {inp("CTR (%)", "ctr")}
                {inp("Frequência", "frequencia")}
              </div>
              <p style={{ color: C.muted, fontSize: 11, margin: "14px 0 10px", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Mês anterior (para comparação)</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                {inp("Investimento ant.", "prevInvestimento")}
                {inp("Vendas ant. (R$)", "prevVendas")}
                {inp("ROAS ant.", "prevRoas")}
              </div>
              <p style={{ color: C.muted, fontSize: 11, margin: "14px 0 10px", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Vendas por semana</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
                {["semana1","semana2","semana3","semana4"].map((k,i) => inp(`Semana ${i+1}`, k))}
              </div>
            </div>
          )}
          {!metaFile && (
            <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: 20 }}>
              <p style={{ color: C.muted, fontSize: 12, margin: "0 0 14px" }}>Ou preencha manualmente:</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {inp("Investimento (R$)", "investimento")}
                {inp("Valor vendas (R$)", "valorVendas")}
                {inp("ROAS", "roas")}
                {inp("Custo/pedido (R$)", "cpp")}
                {inp("Ticket médio (R$)", "ticketMedio")}
                {inp("Qtd. vendas", "vendas")}
                {inp("Alcance", "alcance")}
                {inp("Cliques", "cliques")}
                {inp("CPC (R$)", "cpc")}
                {inp("CTR (%)", "ctr")}
                {inp("Frequência", "frequencia")}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setStep(1)} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, padding: "13px 20px", color: C.text, cursor: "pointer" }}>←</button>
            <button onClick={() => setStep(3)} style={{ flex: 1, background: C.grad, border: "none", borderRadius: 10, padding: "13px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Próximo →</button>
          </div>
        </div>
      )}

      {/* STEP 3 — Cardápio */}
      {step === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: 0 }}>Cardápio Digital</h2>
          <UploadZone
            label="Print ou PDF do cardápio (iFood, Cardápio Web, Goomer…)"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onFile={handleCardapioUpload}
            file={cardapioFile}
            loading={loadingCardapio}
            extracted={cardapioExtraidos}
          />
          <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: 20 }}>
            <p style={{ color: C.accent, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", margin: "0 0 14px" }}>
              {cardapioFile ? "Complemente se necessário" : "Preencha manualmente"}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {inp("Acessos", "acessos")}
              {inp("Add ao carrinho", "addCart")}
              {inp("Finalizações", "finalizacoes")}
              {inp("Vendas", "vendasCardapio")}
              {inp("Novos clientes", "novosClientes")}
              {inp("Faturamento (R$)", "faturamento")}
              {inp("Ticket médio (R$)", "ticketCardapio")}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setStep(2)} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, padding: "13px 20px", color: C.text, cursor: "pointer" }}>←</button>
            <button onClick={gerarAnalise} disabled={loadingIA}
              style={{ flex: 1, background: loadingIA ? C.cardBorder : C.grad, border: "none", borderRadius: 10, padding: "13px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: loadingIA ? "not-allowed" : "pointer" }}>
              {loadingIA ? "⏳ Gerando análise IA..." : "🤖 Gerar Análise IA →"}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4 — Revisão */}
      {step === 4 && analise && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: 0 }}>✅ Revisão Final</h2>
          <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Edite o que precisar antes de salvar.</p>

          <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: 20 }}>
            <p style={{ color: C.accent, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", margin: "0 0 10px" }}>Análise geral</p>
            <textarea value={analise.analise || ""} onChange={e => setAnalise(a => ({ ...a, analise: e.target.value }))} rows={4}
              style={{ width: "100%", background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 13, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
          </div>

          {[
            { k: "manter", label: "✅ Manter" },
            { k: "otimizar", label: "⚡ Otimizar" },
            { k: "pausar", label: "🚫 Pausar / Cortar" },
            { k: "testes", label: "🧪 Próximos testes" },
          ].map(item => (
            <div key={item.k} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: 20 }}>
              <p style={{ color: C.accent, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", margin: "0 0 10px" }}>{item.label}</p>
              <textarea value={analise.plano?.[item.k] || ""} onChange={e => setAnalise(a => ({ ...a, plano: { ...a.plano, [item.k]: e.target.value } }))} rows={2}
                style={{ width: "100%", background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 13, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            </div>
          ))}

          <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: 20 }}>
            <p style={{ color: C.accent, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", margin: "0 0 10px" }}>Meta próximo mês (R$)</p>
            <input type="number" value={analise.meta || ""} onChange={e => setAnalise(a => ({ ...a, meta: parseFloat(e.target.value) }))}
              style={{ width: "100%", background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
          </div>

          <button onClick={finalizar}
            style={{ background: C.grad, border: "none", borderRadius: 10, padding: "15px", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            🚀 Salvar Relatório
          </button>
        </div>
      )}
    </div>
  )
}

// ─── CARD RELATÓRIO ───────────────────────────────────────────────────────────
function RelCard({ rel, onView, onDelete }) {
  const d = rel.dados || {}
  return (
    <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{rel.cliente}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{rel.mes} · {rel.gestor}</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: C.accentDim, color: C.accent, letterSpacing: 1 }}>RELATÓRIO</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { l: "ROAS", v: d.roas || "—" },
          { l: "Faturamento", v: fmt(d.faturamento) },
          { l: "Investimento", v: fmt(d.investimento) },
        ].map((m, i) => (
          <div key={i} style={{ background: C.bg, borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{m.l}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.accent }}>{m.v}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onView(rel)} style={{ flex: 1, background: C.grad, border: "none", borderRadius: 8, padding: "10px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>▶ Ver Slides</button>
        <button onClick={() => onDelete(rel.id)} style={{ background: "rgba(255,77,106,0.1)", border: "1px solid rgba(255,77,106,0.2)", borderRadius: 8, padding: "10px 14px", color: C.red, fontSize: 13, cursor: "pointer" }}>✕</button>
      </div>
    </div>
  )
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("painel")
  const [relatorios, setRelatorios] = useState([])
  const [loading, setLoading] = useState(true)
  const [slideRel, setSlideRel] = useState(null)
  const [filtroGestor, setFiltroGestor] = useState("Todos")

  useEffect(() => {
    supabase.from("relatorios").select("*").order("criado_em", { ascending: false })
      .then(({ data }) => { setRelatorios(data || []); setLoading(false) })
  }, [])

  async function onSave(rel) {
    setRelatorios(r => [rel, ...r])
    setView("painel")
  }

  async function onDelete(id) {
    if (!window.confirm("Deletar este relatório?")) return
    await supabase.from("relatorios").delete().eq("id", id)
    setRelatorios(r => r.filter(x => x.id !== id))
  }

  const filtrados = filtroGestor === "Todos" ? relatorios : relatorios.filter(r => r.gestor === filtroGestor)
  const gestoresUnicos = [...new Set(relatorios.map(r => r.gestor))]

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Inter', system-ui, sans-serif", color: C.text }}>
      {/* HEADER */}
      <div style={{ borderBottom: `1px solid ${C.cardBorder}`, padding: "0 32px", display: "flex", alignItems: "center", gap: 20, height: 58, background: "rgba(11,22,40,0.97)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: C.grad, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "#fff" }}>L</div>
          <span style={{ fontWeight: 800, fontSize: 15 }}>Laos</span>
          <span style={{ color: C.muted, fontSize: 13 }}>/ Relatórios</span>
        </div>
        <div style={{ flex: 1 }} />
        {[
          { k: "painel", label: "📊 Painel" },
          { k: "novo", label: "+ Novo Relatório" },
        ].map(v => (
          <button key={v.k} onClick={() => setView(v.k)} style={{
            background: view === v.k ? C.accentDim : "none",
            border: `1px solid ${view === v.k ? C.accentBorder : "transparent"}`,
            borderRadius: 8, padding: "6px 16px", color: view === v.k ? C.accent : C.muted,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>{v.label}</button>
        ))}
      </div>

      <div style={{ padding: "32px", maxWidth: 1200, margin: "0 auto" }}>
        {/* PAINEL */}
        {view === "painel" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Painel de Relatórios</h1>
                <p style={{ color: C.muted, fontSize: 13, margin: "4px 0 0" }}>{relatorios.length} relatório(s) · todos os gestores</p>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Todos", ...gestoresUnicos].map(g => (
                  <button key={g} onClick={() => setFiltroGestor(g)} style={{
                    background: filtroGestor === g ? C.accentDim : C.card,
                    border: `1px solid ${filtroGestor === g ? C.accent : C.cardBorder}`,
                    borderRadius: 8, padding: "6px 14px", color: filtroGestor === g ? C.accent : C.muted,
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}>{g}</button>
                ))}
              </div>
            </div>

            {loading && <p style={{ color: C.muted }}>Carregando...</p>}
            {!loading && filtrados.length === 0 && (
              <div style={{ textAlign: "center", padding: "80px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                <p style={{ color: C.muted, fontSize: 16 }}>Nenhum relatório ainda.</p>
                <button onClick={() => setView("novo")} style={{ background: C.grad, border: "none", borderRadius: 10, padding: "12px 28px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 12 }}>
                  + Criar primeiro relatório
                </button>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px,1fr))", gap: 20 }}>
              {filtrados.map(rel => <RelCard key={rel.id} rel={rel} onView={setSlideRel} onDelete={onDelete} />)}
            </div>
          </div>
        )}

        {/* NOVO */}
        {view === "novo" && (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>Novo Relatório</h1>
            <p style={{ color: C.muted, fontSize: 13, marginBottom: 28 }}>Faça upload dos arquivos e a IA extrai e analisa automaticamente.</p>
            <FormNovo onSave={onSave} />
          </div>
        )}
      </div>

      {slideRel && <SlideViewer rel={slideRel} onClose={() => setSlideRel(null)} />}
    </div>
  )
}
