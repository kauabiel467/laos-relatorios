/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect } from "react";
import type { AnalysisConfig, AnalysisData, SectionKey } from "@/lib/projects/model";
import type { ClientReport } from "@/lib/projects/public-report";
import ProgressMetricCard, { type CardSize } from "@/components/ui/progress-metric-card";
import { deriveMetricCard, resolveMetricOrder } from "./metric-cards";
import { ReportBlock, SectionHeading } from "./report-blocks";
import { shortDate } from "./ui";
import "./projects.css";

// Formatted in the account's own time zone, never the viewer's or the server's:
// the page is rendered on the server and hydrated in the browser, and both must
// print the same text (and the client should read the same clock as the manager).
const formatUpdatedAt = (value: string, timeZone: string) =>
  new Date(value).toLocaleString("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function MetricCards({ config, data, currency }: { config: AnalysisConfig; data: AnalysisData; currency: string }) {
  return (
    <div className="pj-metric-grid">
      {resolveMetricOrder(config).map((id) => {
        const model = deriveMetricCard(id, config, data, currency);
        if (!model) return null;
        const cardSize: CardSize = model.savedSize === "full" ? "lg" : model.savedSize === "wide" ? "md" : "sm";
        return (
          <div
            key={id}
            className={`pj-progress-metric-item size-${model.savedSize} ${id === config.primary_metric ? "is-primary" : ""}`}
          >
            <ProgressMetricCard {...model.props} size={cardSize} />
          </div>
        );
      })}
    </div>
  );
}

function Section({ section, config, data, currency }: { section: SectionKey; config: AnalysisConfig; data: AnalysisData; currency: string }) {
  if (section === "metrics") return <MetricCards config={config} data={data} currency={currency} />;
  if (section === "analysis") {
    // The editor shows a placeholder here; a client should never see it.
    if (!config.analysis.trim()) return null;
    return (
      <section className="pj-block pj-inline-analysis">
        <SectionHeading title="Análise e próximos passos" description="Contexto, pontos de atenção e recomendações registrados pelo gestor." />
        <div className="pj-prose">{config.analysis}</div>
      </section>
    );
  }
  return <ReportBlock section={section} config={config} data={data} currency={currency} />;
}

// The read-only report a client sees. Used by both the public share link
// (last published snapshot) and the manager's private "ver como cliente"
// preview (current saved version), so the two are guaranteed to look the same.
export function ClientReportView({
  report,
  mode,
  autoPrint = false,
}: {
  report: ClientReport;
  mode: "public" | "preview";
  autoPrint?: boolean;
}) {
  const { config, data, clientName, clientLogoUrl } = report;
  const currency = data.currency || "BRL";
  const since = data.effective_period?.since ?? config.since;
  const until = data.effective_period?.until ?? config.until;
  const compareSince = data.effective_period?.compare_since ?? config.compare_since;
  const compareUntil = data.effective_period?.compare_until ?? config.compare_until;
  const showComparison = config.comparison !== "none" && Boolean(data.previous) && Boolean(compareSince && compareUntil);
  const sections: SectionKey[] = config.sections.length ? config.sections : ["metrics"];

  // The browser proposes the page title as the PDF file name.
  useEffect(() => {
    document.title = `Relatório de ${clientName} — ${shortDate(since)} a ${shortDate(until)}`;
  }, [clientName, since, until]);

  useEffect(() => {
    if (!autoPrint) return;
    // Give charts and fonts a moment to settle before the print dialog freezes the layout.
    const timer = window.setTimeout(() => window.print(), 900);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

  return (
    <div className="projects theme-light">
      {mode === "preview" ? (
        <div className="pj-client-preview-note" role="note">
          Pré-visualização privada da versão atual. Só você vê esta página; o cliente vê a última versão publicada.
        </div>
      ) : null}
      <div className="pj-public-page">
        <div className="pj-client-periods">
          <div>
            <span>Período de análise</span>
            <strong>{shortDate(since)} — {shortDate(until)}</strong>
          </div>
          {showComparison ? (
            <div>
              <span>Período de comparação</span>
              <strong>{shortDate(compareSince!)} — {shortDate(compareUntil!)}</strong>
            </div>
          ) : null}
        </div>
        <header className="pj-client-cover">
          {clientLogoUrl ? (
            <img src={clientLogoUrl} alt={`Logo de ${clientName}`} referrerPolicy="no-referrer" />
          ) : (
            <span className="pj-project-avatar" aria-hidden="true">{clientName.slice(0, 1).toUpperCase()}</span>
          )}
          <div>
            <h1>Relatório de {clientName}</h1>
            <h2>{config.subtitle || "Análise de desempenho"}</h2>
            <p>{report.title}</p>
          </div>
        </header>
        <article className="pj-document pj-client-sections">
          {sections.map((section) => (
            <Section key={section} section={section} config={config} data={data} currency={currency} />
          ))}
        </article>
        <footer className="pj-client-footer">
          <span>Atualizado em {formatUpdatedAt(report.updatedAt, data.timezone || "America/Sao_Paulo")}</span>
          <button type="button" className="pj-button" onClick={() => window.print()}>
            Salvar PDF / imprimir
          </button>
        </footer>
      </div>
    </div>
  );
}
