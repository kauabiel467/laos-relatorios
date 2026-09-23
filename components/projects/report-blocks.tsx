/* eslint-disable @next/next/no-img-element */
"use client";

import {
  METRICS,
  formatMetric,
  type AnalysisConfig,
  type AnalysisData,
  type InsightItem,
  type MetricKey,
  type SectionKey,
} from "@/lib/projects/model";
import { LineChart } from "./line-chart";
import { metricUnitLabel } from "./metric-cards";
import { shortDate } from "./ui";

export function SectionHeading({
  title,
  description,
  unit,
}: {
  title: string;
  description: string;
  unit?: string;
}) {
  return (
    <header className="pj-block-heading">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {unit ? <span className="pj-chart-unit">Unidade: {unit}</span> : null}
    </header>
  );
}

export function funnelMetricsFor(config: AnalysisConfig): MetricKey[] {
  return config.funnel_metrics?.length
    ? config.funnel_metrics
    : config.metrics.includes("purchases")
      ? ["link_clicks", "landing_views", "checkouts", "purchases"]
      : config.metrics.includes("messages")
        ? ["impressions", "link_clicks", "messages"]
        : ["impressions", "link_clicks", "leads"];
}

export function ReportTable({
  items,
  name,
  config,
  currency,
  busy = false,
}: {
  items: InsightItem[];
  name: string;
  config: AnalysisConfig;
  currency: string;
  busy?: boolean;
}) {
  if (!items.length) {
    return busy ? (
      <div className="pj-table-skeleton" role="status" aria-live="polite" aria-label={`Carregando ${name.toLowerCase()}`}>
        <span />
        <span />
        <span />
        <span />
      </div>
    ) : (
      <div className="pj-no-data" role="status">
        <strong>Nenhum dado encontrado</strong>
        <span>Não há resultados de {name.toLowerCase()} para este período e filtro.</span>
      </div>
    );
  }
  const extraMetrics = config.metrics
    .filter((k) => !["spend", "reach", "impressions"].includes(k))
    .slice(0, 4);
  return (
    <div
      className="pj-table-scroll"
      role="region"
      aria-label={`Tabela de desempenho por ${name.toLowerCase()}`}
      aria-busy={busy}
      tabIndex={0}
    >
      {busy ? (
        <div className="pj-table-loading" role="status" aria-live="polite">
          Atualizando dados…
        </div>
      ) : null}
      <p className="pj-table-hint" aria-hidden="true">
        Deslize horizontalmente para ver todas as métricas →
      </p>
      <table>
        <caption className="pj-sr-only">
          Desempenho detalhado por {name.toLowerCase()}, com investimento e métricas configuradas.
        </caption>
        <thead>
          <tr>
            <th>{name}</th>
            <th>Investimento</th>
            {extraMetrics.map((k) => (
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
                {name === "Anúncio" && !item.thumbnail && <small>Prévia indisponível</small>}
              </td>
              <td>{formatMetric("spend", item.metrics.spend, currency)}</td>
              {extraMetrics.map((k) => (
                <td key={k}>{formatMetric(k, item.metrics[k], currency)}</td>
              ))}
              <td>{formatMetric("impressions", item.metrics.impressions, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Every report section except the metric-card grid and the manager's analysis
// text (those two have editing behaviour in the editor and are rendered by each
// caller). Used by the editor and by the client-facing report so both draw the
// exact same charts and tables.
export function ReportBlock({
  section,
  config,
  data,
  currency,
  busy = false,
}: {
  section: Exclude<SectionKey, "metrics" | "analysis">;
  config: AnalysisConfig;
  data: AnalysisData;
  currency: string;
  busy?: boolean;
}) {
  const table = (items: InsightItem[], name: string) => (
    <ReportTable items={items} name={name} config={config} currency={currency} busy={busy} />
  );
  switch (section) {
    case "daily":
      return (
        <section className="pj-block">
          <SectionHeading
            title="Investimento ao longo do período"
            description="Evolução diária do valor registrado pela Meta para os filtros selecionados."
            unit={currency}
          />
          {data.daily.length ? (
            <>
              <div className="pj-chart-legend" aria-label={`Legenda: investimento em ${currency}`}>
                <span><i className="investment" aria-hidden="true" /> Investimento</span>
              </div>
              <LineChart
                daily={data.daily}
                metric="spend"
                currency={currency}
                color="var(--pj-primary)"
                label="Investimento"
                unitLabel={currency}
              />
              <details>
                <summary>Ver valores por dia</summary>
                {table(
                  data.daily.map((d) => ({ id: d.date, name: shortDate(d.date), metrics: d.metrics })),
                  "Dia",
                )}
              </details>
            </>
          ) : (
            <div className="pj-no-data" role="status">
              <strong>Sem evolução diária</strong>
              <span>Não há investimento diário para o período e os filtros selecionados.</span>
            </div>
          )}
        </section>
      );
    case "results": {
      const metric = config.primary_metric;
      return (
        <section className="pj-block">
          <SectionHeading
            title={`${METRICS[metric].label} ao longo do período`}
            description={`Evolução diária do KPI principal: ${METRICS[metric].description}`}
            unit={metricUnitLabel(METRICS[metric].unit, currency)}
          />
          {data.daily.length ? (
            <>
              <div className="pj-chart-legend" aria-label={`Legenda: ${METRICS[metric].label}`}>
                <span><i aria-hidden="true" /> {METRICS[metric].label}</span>
              </div>
              <LineChart
                daily={data.daily}
                metric={metric}
                currency={currency}
                color="var(--pj-primary)"
                label={METRICS[metric].label}
                unitLabel={metricUnitLabel(METRICS[metric].unit, currency)}
              />
              <details>
                <summary>Ver valores do KPI por dia</summary>
                {table(
                  data.daily.map((day) => ({ id: day.date, name: shortDate(day.date), metrics: day.metrics })),
                  "Dia",
                )}
              </details>
            </>
          ) : (
            <div className="pj-no-data" role="status">
              <strong>Sem evolução diária</strong>
              <span>Não há dados diários do KPI principal para este período.</span>
            </div>
          )}
        </section>
      );
    }
    case "funnel": {
      const funnelMetrics = funnelMetricsFor(config);
      return (
        <section className="pj-block">
          <SectionHeading
            title="Etapas de resultado"
            description="Leitura das etapas reportadas pela Meta, sem inferir uma jornada individual entre elas."
          />
          <div className="pj-funnel">
            {funnelMetrics.map((k, i) => (
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
            Eventos reportados pela Meta. As etapas não comprovam que as mesmas pessoas percorreram todo o caminho.
          </p>
        </section>
      );
    }
    case "campaigns":
      return (
        <section className="pj-block">
          <SectionHeading title="Campanhas em destaque" description="Onde investimento e resultados tiveram maior impacto no período." />
          {table(data.campaigns, "Campanha")}
        </section>
      );
    case "adsets":
      return (
        <section className="pj-block">
          <SectionHeading title="Conjuntos de anúncios" description="Detalhamento dos conjuntos que compõem o resultado da conta." />
          {table(data.adsets, "Conjunto")}
        </section>
      );
    case "ads":
      return (
        <section className="pj-block">
          <SectionHeading title="Criativos e anúncios" description="Desempenho dos anúncios e prévias disponibilizadas pela Meta." />
          {table(data.ads, "Anúncio")}
          <p className="pj-footnote">
            Prévias disponíveis para até 12 anúncios com maior investimento. A disponibilidade depende da Meta.
          </p>
        </section>
      );
    case "platforms":
      return (
        <section className="pj-block">
          <SectionHeading title="Desempenho por plataforma" description="Comparação dos resultados reportados em cada posicionamento de plataforma." />
          {table(data.platforms, "Plataforma")}
        </section>
      );
    case "audience":
      return (
        <section className="pj-block">
          <SectionHeading title="Público por idade e gênero" description="Distribuição dos resultados nos segmentos disponibilizados pela Meta." />
          {table(data.audience, "Público")}
        </section>
      );
  }
}
