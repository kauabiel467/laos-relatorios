"use client";
import { useEffect, useState } from "react";
import {
  TEMPLATES,
  defaultConfig,
  periodDates,
  comparisonDates,
  type AnalysisConfig,
  type ProjectDocument,
} from "@/lib/projects/model";
import { MetaMark, shortDate } from "./ui";
export function AnalysisWizard({
  cid,
  clientName,
  kind,
  templates,
  busy,
  onCancel,
  onCreate,
}: {
  cid: string;
  clientName: string;
  kind: "dashboard" | "report";
  templates: ProjectDocument[];
  busy: boolean;
  onCancel: () => void;
  onCreate: (title: string, config: AnalysisConfig) => void;
}) {
  const [step, setStep] = useState(1),
    [search, setSearch] = useState(""),
    [config, setConfig] = useState(defaultConfig()),
    [title, setTitle] = useState(
      (kind === "dashboard" ? "Dashboard" : "Relatório") + " de " + clientName,
    ),
    [scope, setScope] = useState("all"),
    [campaigns, setCampaigns] = useState<
      { id: string; name: string; status: string }[]
    >([]),
    [campaignSearch, setCampaignSearch] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (scope !== "selected") return;
    let alive = true;
    setLoading(true);
    fetch("/api/projects?campaigns=" + cid)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (alive) setCampaigns(d.campaigns);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [scope, cid]);
  const change = (patch: Partial<AnalysisConfig>) =>
    setConfig((c) => ({ ...c, ...patch }));
  const comparison =
    config.comparison === "previous"
      ? comparisonDates(config)
      : config;
  return (
    <div className="pj-wizard">
      <aside>
        <div className="pj-step">{step}/2</div>
        <h2>{step === 1 ? "Escolha o template" : "Configure sua análise"}</h2>
        <p>
          {step === 1
            ? "Comece com um modelo LAOS ou reutilize um template da sua equipe."
            : "Defina as datas, a comparação e as campanhas que entram neste documento."}
        </p>
        <small>PROJETO</small>
        <strong>{clientName}</strong>
      </aside>
      <section>
        {step === 1 ? (
          <>
            <h2>Templates</h2>
            <input
              className="pj-search"
              aria-label="Buscar template"
              placeholder="Buscar template…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="pj-section-label">MODELOS LAOS</div>
            <div className="pj-template-grid">
              {TEMPLATES.filter((t) =>
                (t.name + " " + t.description)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              ).map((t) => (
                <button
                  key={t.id}
                  className={
                    "pj-template " +
                    (config.template === t.id ? "selected" : "")
                  }
                  onClick={() => setConfig(defaultConfig(t.id))}
                >
                  <span>{t.icon}</span>
                  <div>
                    <strong>{t.name}</strong>
                    <p>{t.description}</p>
                    <small>
                      {t.metrics.length} indicadores · {t.sections.length}{" "}
                      blocos
                    </small>
                  </div>
                  {config.template === t.id && <b>✓</b>}
                </button>
              ))}
            </div>
            <div className="pj-section-label">TEMPLATES DA EQUIPE</div>
            {templates.length ? (
              <div className="pj-template-grid">
                {templates
                  .filter((t) =>
                    t.title.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((t) => (
                    <button
                      className={
                        "pj-template " +
                        (config.template === t.id ? "selected" : "")
                      }
                      key={t.id}
                      onClick={() =>
                        setConfig({
                          ...t.config,
                          ...periodDates("last_month"),
                          preset: "last_month",
                          campaign_ids: [],
                          analysis: "",
                          template: t.id,
                        })
                      }
                    >
                      <span>▦</span>
                      <div>
                        <strong>{t.title}</strong>
                        <p>
                          {t.config.metrics.length} indicadores personalizados
                        </p>
                      </div>
                    </button>
                  ))}
              </div>
            ) : (
              <div className="pj-hint">
                Depois de montar uma análise, use “Salvar como template” para
                reutilizar a apresentação em outros projetos.
              </div>
            )}
            <div className="pj-actions">
              <button onClick={onCancel}>Cancelar</button>
              <button className="primary" onClick={() => setStep(2)}>
                Continuar →
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onCreate(title, config);
            }}
          >
            <label>
              Nome do {kind === "dashboard" ? "dashboard" : "relatório"}
              <input
                value={title}
                maxLength={180}
                required
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <h2>Período de análise</h2>
            <label>
              Período
              <select
                value={config.preset}
                onChange={(e) => {
                  const p = e.target.value as AnalysisConfig["preset"];
                  change({
                    preset: p,
                    ...(p === "custom" ? {} : periodDates(p)),
                  });
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
                  required
                  value={config.since}
                  onChange={(e) =>
                    change({ preset: "custom", since: e.target.value })
                  }
                />
              </label>
              <label>
                Até
                <input
                  type="date"
                  required
                  min={config.since}
                  value={config.until}
                  onChange={(e) =>
                    change({ preset: "custom", until: e.target.value })
                  }
                />
              </label>
            </div>
            <h2>Período de comparação</h2>
            <label className="pj-radio">
              <input
                type="radio"
                checked={config.comparison === "previous"}
                onChange={() => change({ comparison: "previous" })}
              />
              Comparar com o período anterior
            </label>
            <label className="pj-radio">
              <input
                type="radio"
                checked={config.comparison === "none"}
                onChange={() => change({ comparison: "none" })}
              />
              Não comparar
            </label>
            <label className="pj-radio">
              <input
                type="radio"
                checked={config.comparison === "custom"}
                onChange={() =>
                  change({
                    comparison: "custom",
                    ...comparisonDates(config),
                  })
                }
              />
              Comparar com um período personalizado
            </label>
            {config.comparison === "custom" ? (
              <div className="pj-form-row">
                <label>
                  Comparar de
                  <input
                    type="date"
                    required
                    value={config.compare_since ?? ""}
                    onChange={(e) => change({ compare_since: e.target.value })}
                  />
                </label>
                <label>
                  Até
                  <input
                    type="date"
                    required
                    min={config.compare_since}
                    value={config.compare_until ?? ""}
                    onChange={(e) => change({ compare_until: e.target.value })}
                  />
                </label>
              </div>
            ) : (
              config.comparison === "previous" && (
                <p className="pj-muted">
                  Comparação: {shortDate(comparison.compare_since!)} a{" "}
                  {shortDate(comparison.compare_until!)}
                </p>
              )
            )}
            <h2>Integrações</h2>
            <div className="pj-source selected">
              <MetaMark />
              <div>
                <strong>Meta Ads</strong>
                <p>{clientName}</p>
              </div>
              <span>✓</span>
            </div>
            <h2>Escolher detalhes</h2>
            <p className="pj-muted">
              Analise toda a conta ou apenas as campanhas relevantes para esta
              entrega.
            </p>
            <label className="pj-radio">
              <input
                type="radio"
                checked={scope === "all"}
                onChange={() => {
                  setScope("all");
                  change({ campaign_ids: [] });
                }}
              />
              Toda a conta de anúncios
            </label>
            <label className="pj-radio">
              <input
                type="radio"
                checked={scope === "selected"}
                onChange={() => setScope("selected")}
              />
              Selecionar campanhas
            </label>
            {scope === "selected" && (
              <div className="pj-campaign-picker">
                <input
                  placeholder="Buscar campanha…"
                  aria-label="Buscar campanha"
                  value={campaignSearch}
                  onChange={(e) => setCampaignSearch(e.target.value)}
                />
                {loading ? (
                  <p>Carregando campanhas…</p>
                ) : error ? (
                  <p role="alert">{error}</p>
                ) : (
                  campaigns
                    .filter((c) =>
                      c.name
                        .toLowerCase()
                        .includes(campaignSearch.toLowerCase()),
                    )
                    .map((c) => (
                      <label className="pj-check" key={c.id}>
                        <input
                          type="checkbox"
                          checked={config.campaign_ids.includes(c.id)}
                          onChange={(e) =>
                            change({
                              campaign_ids: e.target.checked
                                ? [...config.campaign_ids, c.id]
                                : config.campaign_ids.filter(
                                    (id) => id !== c.id,
                                  ),
                            })
                          }
                        />
                        <span>
                          {c.name}
                          <small>
                            {c.id} · {c.status}
                          </small>
                        </span>
                      </label>
                    ))
                )}
              </div>
            )}
            <div className="pj-actions">
              <button type="button" disabled={busy} onClick={() => setStep(1)}>
                ← Voltar
              </button>
              <button
                className="primary"
                disabled={
                  busy || (scope === "selected" && !config.campaign_ids.length)
                }
              >
                {busy
                  ? "Importando resultados…"
                  : "Concluir e gerar " +
                    (kind === "dashboard" ? "dashboard" : "relatório")}
              </button>
            </div>
            <p className="pj-muted">
              Serão consultados os dados reais da conta vinculada ao projeto.
            </p>
          </form>
        )}
      </section>
    </div>
  );
}
