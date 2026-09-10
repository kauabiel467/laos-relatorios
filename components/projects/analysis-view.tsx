/* eslint-disable @next/next/no-img-element */
"use client";
import { useEffect, useState, useRef } from "react";
import {
  METRICS,
  SECTIONS,
  formatMetric,
  metricChange,
  periodDates,
  comparisonDates,
  type AnalysisConfig,
  type ProjectDocument,
  type InsightItem,
  type SectionKey,
  type MetricKey,
} from "@/lib/projects/model";
import { Dialog, MetaMark, shortDate } from "./ui";
export function AnalysisView({
  document: doc,
  clientName,
  logo,
  staff,
  busy,
  onBack,
  onAction,
  initialPreview = false,
}: {
  document: ProjectDocument;
  clientName: string;
  logo?: string;
  staff: boolean;
  busy: boolean;
  initialPreview?: boolean;
  onBack: () => void;
  onAction: (action: string, extra?: Record<string, unknown>) => Promise<void>;
}) {
  const [auto, setAuto] = useState(false);
  const [config, setConfig] = useState(doc.config),
    [title, setTitle] = useState(doc.title),
    [preview, setPreview] = useState(!staff || initialPreview),
    [editor, setEditor] = useState(doc.kind === "template"),
    [dates, setDates] = useState(false),
    [share, setShare] = useState(false),
    [menu, setMenu] = useState(false),
    [copied, setCopied] = useState(false),
    [link, setLink] = useState("");
  useEffect(() => {
    setConfig(doc.config);
    setTitle(doc.title);
  }, [doc]);
  useEffect(
    () =>
      setLink(
        window.location.origin +
          "/?project=" +
          doc.client_id +
          "&document=" +
          doc.id +
          "&preview=1",
      ),
    [doc.id, doc.client_id],
  );
  const editable =
    staff && !(doc.kind === "report" && doc.status === "published");
  const data = doc.data,
    currency = data?.currency ?? "BRL";
  const dirty =
    JSON.stringify(config) !== JSON.stringify(doc.config) ||
    title !== doc.title;
  const patch = (value: Partial<AnalysisConfig>) =>
    setConfig((c) => ({ ...c, ...value }));
  const action = async (a: string) => {
    setMenu(false);
    await onAction(
      a,
      a === "save" || a === "refresh"
        ? {
            config:
              a === "refresh" && config.preset !== "custom"
                ? { ...config, ...periodDates(config.preset) }
                : config,
            title,
          }
        : {},
    );
  };
  const refreshRef = useRef(() => {});
  refreshRef.current = () => {
    if (!busy && !dirty && documentVisibility()) void action("refresh");
  };
  useEffect(() => {
    if (!auto || !editable || doc.kind !== "dashboard") return;
    const timer = setInterval(() => refreshRef.current(), 300000);
    return () => clearInterval(timer);
  }, [auto, editable, doc.kind]);
  function documentVisibility() {
    return window.document.visibilityState === "visible";
  }
  const move = (index: number, direction: number) => {
    const sections = [...config.sections];
    const to = index + direction;
    if (to < 0 || to >= sections.length) return;
    [sections[index], sections[to]] = [sections[to], sections[index]];
    patch({ sections });
  };
  const compare =
    doc.config.comparison === "previous"
      ? comparisonDates(doc.config)
      : doc.config;
  const row = (items: InsightItem[], name: string) => (
    <div className="pj-table-scroll">
      <table>
        <thead>
          <tr>
            <th>{name}</th>
            <th>Investimento</th>
            {doc.config.metrics
              .filter((k) => !["spend", "reach", "impressions"].includes(k))
              .slice(0, 4)
              .map((k) => (
                <th key={k}>{METRICS[k].label}</th>
              ))}
            <th>Impressões</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                {item.thumbnail && (
                  <img
                    className="pj-thumb"
                    src={item.thumbnail}
                    alt={"Criativo de " + item.name}
                    referrerPolicy="no-referrer"
                  />
                )}
                <strong>{item.name}</strong>
                {name === "Anúncio" && !item.thumbnail && (
                  <small>Prévia indisponível</small>
                )}
              </td>
              <td>{formatMetric("spend", item.metrics.spend, currency)}</td>
              {doc.config.metrics
                .filter((k) => !["spend", "reach", "impressions"].includes(k))
                .slice(0, 4)
                .map((k) => (
                  <td key={k}>{formatMetric(k, item.metrics[k], currency)}</td>
                ))}
              <td>
                {formatMetric(
                  "impressions",
                  item.metrics.impressions,
                  currency,
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && (
        <p className="pj-no-data">
          Sem dados disponíveis para este período e filtro.
        </p>
      )}
    </div>
  );
  function renderSection(section: SectionKey) {
    if (!data) return null;
    switch (section) {
      case "metrics":
        return (
          <div className="pj-metric-grid">
            {doc.config.metrics.map((k) => {
              const m = METRICS[k],
                v = data.current[k],
                p = data.previous?.[k],
                delta = metricChange(v, p);
              return (
                <article className="pj-metric" key={k}>
                  <span>
                    {m.label} <abbr title={m.description}>ⓘ</abbr>
                  </span>
                  <div>
                    <strong>{formatMetric(k, v, currency)}</strong>
                    {delta != null && (
                      <small
                        className={
                          (m.lower ? delta < 0 : delta > 0)
                            ? "positive"
                            : delta === 0
                              ? "neutral"
                              : "negative"
                        }
                      >
                        {delta > 0 ? "↑" : "↓"}{" "}
                        {Math.abs(delta).toFixed(1).replace(".", ",")}%
                      </small>
                    )}
                  </div>
                  {data.previous && (
                    <p>{formatMetric(k, p, currency)} no período anterior</p>
                  )}
                </article>
              );
            })}
          </div>
        );
      case "daily": {
        const vals = data.daily.map((d) => d.metrics.spend ?? 0),
          max = Math.max(...vals, 1);
        return (
          <section className="pj-block">
            <h3>Investimento ao longo do período</h3>
            {vals.length ? (
              <>
                <svg
                  viewBox="0 0 900 200"
                  role="img"
                  aria-label="Gráfico do investimento diário"
                >
                  <line x1="20" y1="175" x2="880" y2="175" stroke="#d9e1e9" />
                  <line x1="20" y1="90" x2="880" y2="90" stroke="#edf1f6" />
                  <polyline
                    points={vals
                      .map(
                        (v, i) =>
                          `${20 + (i * 860) / Math.max(vals.length - 1, 1)},${175 - (v / max) * 150}`,
                      )
                      .join(" ")}
                    fill="none"
                    stroke="#1fb06d"
                    strokeWidth="3"
                    strokeLinejoin="round"
                  />
                  {vals.map((v, i) => (
                    <circle
                      key={i}
                      cx={20 + (i * 860) / Math.max(vals.length - 1, 1)}
                      cy={175 - (v / max) * 150}
                      r="4"
                      fill="#1fb06d"
                    >
                      <title>
                        {shortDate(data!.daily[i].date)}:{" "}
                        {formatMetric("spend", v, currency)}
                      </title>
                    </circle>
                  ))}
                </svg>
                <div className="pj-chart-axis">
                  <span>{shortDate(data.daily[0].date)}</span>
                  <span>{shortDate(data.daily.at(-1)!.date)}</span>
                </div>
                <details>
                  <summary>Ver valores por dia</summary>
                  {row(
                    data.daily.map((d) => ({
                      id: d.date,
                      name: shortDate(d.date),
                      metrics: d.metrics,
                    })),
                    "Dia",
                  )}
                </details>
              </>
            ) : (
              <p>Sem dados diários neste período.</p>
            )}
          </section>
        );
      }
      case "funnel": {
        const keys: MetricKey[] = doc.config.metrics.includes("purchases")
          ? ["link_clicks", "landing_views", "checkouts", "purchases"]
          : doc.config.metrics.includes("messages")
            ? ["impressions", "link_clicks", "messages"]
            : ["impressions", "link_clicks", "leads"];
        return (
          <section className="pj-block">
            <h3>Etapas de resultado</h3>
            <div className="pj-funnel">
              {keys.map((k, i) => (
                <div
                  key={k}
                  style={{
                    width: 100 - i * 13 + "%",
                    background: ["#e4edff", "#b2cbf6", "#719de2", "#2457aa"][i],
                    color: i > 1 ? "white" : "#1a3967",
                  }}
                >
                  <span>{METRICS[k].label}</span>
                  <strong>{formatMetric(k, data.current[k], currency)}</strong>
                </div>
              ))}
            </div>
            <p className="pj-footnote">
              Eventos reportados pela Meta. As etapas não comprovam que as
              mesmas pessoas percorreram todo o caminho.
            </p>
          </section>
        );
      }
      case "campaigns":
        return (
          <section className="pj-block">
            <h3>Campanhas em destaque</h3>
            {row(data.campaigns, "Campanha")}
          </section>
        );
      case "adsets":
        return (
          <section className="pj-block">
            <h3>Conjuntos de anúncios</h3>
            {row(data.adsets, "Conjunto")}
          </section>
        );
      case "ads":
        return (
          <section className="pj-block">
            <h3>Criativos e anúncios</h3>
            {row(data.ads, "Anúncio")}
            <p className="pj-footnote">
              Prévias disponíveis para até 12 anúncios com maior investimento. A
              disponibilidade depende da Meta.
            </p>
          </section>
        );
      case "platforms":
        return (
          <section className="pj-block">
            <h3>Desempenho por plataforma</h3>
            {row(data.platforms, "Plataforma")}
          </section>
        );
      case "audience":
        return (
          <section className="pj-block">
            <h3>Público por idade e gênero</h3>
            {row(data.audience, "Público")}
          </section>
        );
      case "analysis":
        return (
          <section className="pj-block">
            <h3>Análise e próximos passos</h3>
            <p className="pj-prose">
              {doc.config.analysis || "Nenhuma análise adicionada pelo gestor."}
            </p>
          </section>
        );
    }
  }
  return (
    <div
      className={
        "pj-analysis " +
        (preview ? "client-preview" : "") +
        (doc.kind === "report" ? " is-report" : "")
      }
    >
      <div className="pj-analysis-toolbar">
        <button onClick={onBack}>
          ← {preview ? clientName : "Voltar ao projeto"}
        </button>
        <strong>{doc.title}</strong>
        <span className="pj-badge">
          {doc.status === "published" ? "Publicado" : "Rascunho"}
        </span>
        <div className="pj-toolbar-right">
          {staff && (
            <button onClick={() => setPreview(!preview)}>
              {preview ? "Voltar à edição" : "Ver como cliente"}
            </button>
          )}
          <button onClick={() => setShare(true)}>Compartilhar ↗</button>
          {staff && !preview && (
            <button aria-label="Mais ações" onClick={() => setMenu(!menu)}>
              •••
            </button>
          )}
        </div>
        {menu && (
          <div className="pj-menu">
            {editable && (
              <button
                onClick={() => {
                  setEditor(true);
                  setMenu(false);
                }}
              >
                Configurações e blocos
              </button>
            )}
            <button disabled={busy} onClick={() => void action("template")}>
              Salvar como template
            </button>
            <button disabled={busy} onClick={() => void action("duplicate")}>
              Duplicar {doc.kind === "dashboard" ? "dashboard" : "relatório"}
            </button>
            {doc.kind === "dashboard" && (
              <button disabled={busy} onClick={() => void action("convert")}>
                Converter em relatório
              </button>
            )}
            <button disabled={busy} onClick={() => void action("timeline")}>
              Adicionar à linha do tempo
            </button>
            {doc.kind === "dashboard" && doc.status === "published" && (
              <button disabled={busy} onClick={() => void action("unpublish")}>
                Restringir ao gestor
              </button>
            )}
            {doc.status === "draft" && (
              <button
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Excluir este rascunho?"))
                    void action("delete");
                }}
              >
                Excluir rascunho
              </button>
            )}
          </div>
        )}
      </div>
      <div className="pj-analysis-subbar">
        <button disabled={!editable || preview} onClick={() => setDates(true)}>
          ▣ {shortDate(doc.config.since)} — {shortDate(doc.config.until)}
          <small>
            {data?.previous
              ? `Comparação: ${shortDate(compare.compare_since!)} a ${shortDate(compare.compare_until!)}`
              : "Sem comparação"}
          </small>
        </button>
        <span>
          Meta Ads · {data?.timezone ?? "Conta do projeto"}
          <small>
            {data
              ? "Atualizado em " +
                new Date(data.updated_at).toLocaleString("pt-BR")
              : "Nenhuma atualização salva"}
          </small>
        </span>
        {staff && !preview && (
          <div className="pj-inline-actions">
            {doc.kind === "dashboard" && editable && (
              <label className="pj-check">
                <input
                  type="checkbox"
                  checked={auto}
                  onChange={(e) => setAuto(e.target.checked)}
                />
                Atualizar a cada 5 min
              </label>
            )}
            {editable && (
              <>
                <button disabled={busy} onClick={() => void action("refresh")}>
                  {busy ? "Atualizando…" : "↻ Atualizar dados"}
                </button>
                <button onClick={() => setEditor(!editor)}>
                  ✎ Editar blocos
                </button>
                <button
                  className="primary"
                  disabled={busy || !dirty}
                  onClick={() => void action("save")}
                >
                  Salvar
                </button>
              </>
            )}
            {doc.status === "draft" && (
              <button
                className="accent"
                disabled={busy || !data || dirty}
                onClick={() => void action("publish")}
              >
                Publicar para cliente
              </button>
            )}
          </div>
        )}
      </div>
      {dirty && (
        <div className="pj-notice">
          Há alterações não salvas. Salve os blocos ou use “Atualizar dados”
          para aplicar datas e filtros.
        </div>
      )}
      <div
        className={
          "pj-analysis-layout " + (editor && !preview ? "editing" : "")
        }
      >
        {editor && !preview && (
          <aside className="pj-editor">
            <h3>Personalizar apresentação</h3>
            <label>
              Título
              <input
                value={title}
                maxLength={180}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Subtítulo
              <input
                value={config.subtitle}
                onChange={(e) => patch({ subtitle: e.target.value })}
              />
            </label>
            <h4>Indicadores</h4>
            {(Object.keys(METRICS) as MetricKey[]).map((k) => (
              <label key={k} className="pj-check">
                <input
                  type="checkbox"
                  checked={config.metrics.includes(k)}
                  onChange={(e) =>
                    patch({
                      metrics: e.target.checked
                        ? [...config.metrics, k]
                        : config.metrics.filter((x) => x !== k),
                    })
                  }
                />
                {METRICS[k].label}
              </label>
            ))}
            <h4>Blocos e ordem</h4>
            {config.sections.map((k, i) => (
              <div className="pj-block-order" key={k}>
                <span>{SECTIONS[k]}</span>
                <button
                  aria-label={"Mover " + SECTIONS[k] + " acima"}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label={"Mover " + SECTIONS[k] + " abaixo"}
                  disabled={i === config.sections.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  aria-label={"Remover " + SECTIONS[k]}
                  onClick={() =>
                    patch({ sections: config.sections.filter((x) => x !== k) })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <select
              aria-label="Adicionar bloco"
              value=""
              onChange={(e) =>
                patch({
                  sections: [...config.sections, e.target.value as SectionKey],
                })
              }
            >
              <option value="">+ Adicionar bloco</option>
              {(Object.keys(SECTIONS) as SectionKey[])
                .filter((k) => !config.sections.includes(k))
                .map((k) => (
                  <option key={k} value={k}>
                    {SECTIONS[k]}
                  </option>
                ))}
            </select>
            <label>
              Análise do gestor
              <textarea
                rows={7}
                value={config.analysis}
                onChange={(e) => patch({ analysis: e.target.value })}
              />
            </label>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void action("save")}
            >
              Salvar alterações
            </button>
          </aside>
        )}
        <article className="pj-document">
          {doc.kind === "report" && (
            <header className="pj-report-cover">
              {logo ? (
                <img src={logo} alt={"Logo de " + clientName} />
              ) : (
                <span className="pj-project-avatar">
                  {clientName.slice(0, 1)}
                </span>
              )}
              <h1>{doc.title}</h1>
              <h2>{doc.config.subtitle}</h2>
              <p>
                Relatório de {clientName}
                <br />
                {shortDate(doc.config.since)} a {shortDate(doc.config.until)}
              </p>
              <span>LAOS · Resultados com contexto</span>
            </header>
          )}
          <div className="pj-document-heading">
            <MetaMark />
            <div>
              <h2>{doc.kind === "report" ? "Meta Ads" : doc.title}</h2>
              <p>
                {clientName} ·{" "}
                {doc.config.campaign_ids.length
                  ? doc.config.campaign_ids.length + " campanhas selecionadas"
                  : "Toda a conta"}
              </p>
            </div>
          </div>
          {data?.warnings.map((w) => (
            <p className="pj-warning" key={w}>
              {w}
            </p>
          ))}
          {data ? (
            doc.config.sections.map((s) => (
              <div className={"pj-section pj-section-" + s} key={s}>
                {renderSection(s)}
              </div>
            ))
          ) : (
            <div className="pj-empty">
              <h3>Atualize os dados para continuar</h3>
              <p>
                As datas ou os filtros foram alterados. Importe os resultados
                antes de publicar.
              </p>
            </div>
          )}
          <footer className="pj-document-footer">
            Fonte: Meta Ads. Receita e conversões atribuídas pela plataforma;
            não somar automaticamente a outros canais. Valores em {currency}.
          </footer>
        </article>
      </div>
      {dates && (
        <Dialog title="Período da análise" close={() => setDates(false)}>
          <label>
            Período
            <select
              value={config.preset}
              onChange={(e) => {
                const p = e.target.value as AnalysisConfig["preset"];
                patch({ preset: p, ...(p === "custom" ? {} : periodDates(p)) });
              }}
            >
              <option value="last_7d">Últimos 7 dias</option>
              <option value="last_30d">Últimos 30 dias</option>
              <option value="last_month">Último mês</option>
              <option value="custom">Personalizado</option>
            </select>
          </label>
          <div className="pj-form-row">
            <label>
              De
              <input
                type="date"
                value={config.since}
                onChange={(e) =>
                  patch({ preset: "custom", since: e.target.value })
                }
              />
            </label>
            <label>
              Até
              <input
                type="date"
                value={config.until}
                onChange={(e) =>
                  patch({ preset: "custom", until: e.target.value })
                }
              />
            </label>
          </div>
          <label>
            Comparação
            <select
              value={config.comparison}
              onChange={(e) =>
                patch({
                  comparison: e.target.value as AnalysisConfig["comparison"],
                  ...comparisonDates(config),
                })
              }
            >
              <option value="previous">
                Período anterior
              </option>
              <option value="none">Não comparar</option>
              <option value="custom">Período personalizado</option>
            </select>
          </label>
          {config.comparison === "custom" && (
            <div className="pj-form-row">
              <label>
                Comparar de
                <input
                  type="date"
                  value={config.compare_since ?? ""}
                  onChange={(e) => patch({ compare_since: e.target.value })}
                />
              </label>
              <label>
                Até
                <input
                  type="date"
                  value={config.compare_until ?? ""}
                  onChange={(e) => patch({ compare_until: e.target.value })}
                />
              </label>
            </div>
          )}
          <div className="pj-actions">
            <button onClick={() => setDates(false)}>Fechar</button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                await action("refresh");
                setDates(false);
              }}
            >
              Aplicar e atualizar
            </button>
          </div>
        </Dialog>
      )}
      {share && (
        <Dialog title="Compartilhar análise" close={() => setShare(false)}>
          <p>
            O link exige login e acesso autorizado ao projeto. Apenas documentos
            publicados ficam disponíveis para o cliente.
          </p>
          <input readOnly value={link} aria-label="Link do documento" />
          <div className="pj-share-grid">
            <button
              disabled={doc.status !== "published"}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Link copiado ✓" : "Copiar link"}
            </button>
            <button
              onClick={() => {
                setShare(false);
                setTimeout(() => window.print(), 100);
              }}
            >
              Salvar PDF / imprimir
            </button>
            {doc.status === "published" && (
              <>
                <a
                  className="pj-button"
                  target="_blank"
                  rel="noreferrer"
                  href={
                    "https://wa.me/?text=" +
                    encodeURIComponent(doc.title + "\n" + link)
                  }
                >
                  Abrir WhatsApp
                </a>
                <a
                  className="pj-button"
                  href={
                    "mailto:?subject=" +
                    encodeURIComponent(doc.title) +
                    "&body=" +
                    encodeURIComponent("Confira a análise:\n" + link)
                  }
                >
                  Preparar e-mail
                </a>
              </>
            )}
          </div>
          <p className="pj-muted">
            WhatsApp e e-mail abrem uma mensagem para você revisar e enviar. O
            acesso é controlado nas configurações do projeto.
          </p>
        </Dialog>
      )}
    </div>
  );
}
