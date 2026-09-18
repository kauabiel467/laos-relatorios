"use client";

import type { AgencyRecord } from "@/lib/agency/types";
import Link from "next/link";
import { projectHref } from "@/lib/projects/routes";
import { shortDate } from "./ui";

export function PreservedReport({
  record,
  clientName,
  onBack,
}: {
  record: AgencyRecord;
  clientName: string;
  onBack: () => void;
}) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `laos-relatorio-historico-${record.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className="pj-container pj-preserved-report">
      <nav className="pj-breadcrumbs" aria-label="Caminho atual">
        <Link href="/projects">Projetos</Link>
        <span aria-hidden="true">/</span>
        <Link href={projectHref(record.client_id)}>{clientName}</Link>
        <span aria-hidden="true">/</span>
        <button onClick={onBack}>Relatórios</button>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{record.title}</span>
      </nav>
      <button onClick={onBack}>← Voltar aos relatórios</button>
      <article className="pj-panel">
        <span className="pj-section-label">RELATÓRIO HISTÓRICO · SOMENTE LEITURA</span>
        <h1>{record.title}</h1>
        <p>{clientName} · {shortDate(record.created_at)} · {record.status === "published" ? "Publicado" : "Rascunho preservado"}</p>
        {record.payload.source ? <p>Origem: {record.payload.source}</p> : null}
        {record.payload.period ? <p>Período original: {record.payload.period}</p> : null}
        <p className="pj-muted">
          Este registro mantém o conteúdo original. Seus dados não são recalculados, convertidos em KPIs atuais nem substituídos por uma nova consulta.
        </p>
        {record.payload.description ? <p className="pj-preserved-analysis">{record.payload.description}</p> : null}
        <details>
          <summary>Consultar dados e contexto originais</summary>
          <pre tabIndex={0} aria-label="Conteúdo original do relatório">{JSON.stringify(record.payload, null, 2)}</pre>
        </details>
        <button onClick={download}>Baixar registro original (JSON)</button>
      </article>
    </main>
  );
}
