"use client";

import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import type { AgeAudiencePoint, DailyPoint, GenderAudiencePoint, HourlyPerformancePoint, ObjectiveDistributionItem } from "@/lib/types";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import { SectionTitle } from "./section-title";

interface MetaVisualsSectionProps {
  dailySeries: DailyPoint[];
  objectiveDistribution: ObjectiveDistributionItem[];
  hourlyPerformance: HourlyPerformancePoint[];
  ageAudience: AgeAudiencePoint[];
  genderAudience: GenderAudiencePoint[];
  resultLabel: string;
}

function buildPolyline(values: number[], width: number, height: number, padding: number) {
  if (!values.length) return "";
  const max = Math.max(...values, 1);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  return values
    .map((value, index) => {
      const x = padding + (index / Math.max(values.length - 1, 1)) * innerWidth;
      const y = height - padding - (value / max) * innerHeight;
      return `${x},${y}`;
    })
    .join(" ");
}

function buildArea(points: string, width: number, height: number, padding: number) {
  if (!points) return "";

  const entries = points.split(" ");
  const firstPoint = entries[0];
  const lastPoint = entries.at(-1);
  if (!firstPoint || !lastPoint) return "";

  return `${firstPoint} ${points} ${lastPoint.split(",")[0]},${height - padding} ${firstPoint.split(",")[0]},${height - padding}`;
}

function buildConicGradient(items: Array<{ percentage: number }>) {
  if (!items.length) {
    return "conic-gradient(#1e2230 0deg 360deg)";
  }

  const colors = ["#3b82f6", "#22c55e", "#a855f7", "#f97316", "#eab308", "#06b6d4"];
  let cursor = 0;

  return `conic-gradient(${items
    .map((item, index) => {
      const start = cursor;
      const sweep = (item.percentage / 100) * 360;
      cursor += sweep;
      return `${colors[index % colors.length]} ${start}deg ${cursor}deg`;
    })
    .join(", ")})`;
}

function highlightClass(highlight: HourlyPerformancePoint["highlight"]) {
  if (highlight === "high") return "bg-green";
  if (highlight === "medium") return "bg-yellow";
  return "bg-blue/75";
}

type ChartTooltip = {
  x: number;
  y: number;
  title: string;
  lines: string[];
};

export function MetaVisualsSection({
  dailySeries,
  objectiveDistribution,
  hourlyPerformance,
  ageAudience,
  genderAudience,
  resultLabel
}: MetaVisualsSectionProps) {
  const [showSpend, setShowSpend] = useState(true);
  const [showResult, setShowResult] = useState(true);
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null);
  const width = 760;
  const height = 280;
  const padding = 24;

  const spendPoints = useMemo(
    () =>
      buildPolyline(
        dailySeries.map((item) => item.spend),
        width,
        height,
        padding
      ),
    [dailySeries]
  );
  const resultPoints = useMemo(
    () =>
      buildPolyline(
        dailySeries.map((item) => item.result),
        width,
        height,
        padding
      ),
    [dailySeries]
  );
  const spendArea = useMemo(() => buildArea(spendPoints, width, height, padding), [spendPoints]);
  const totalObjectiveSpend = objectiveDistribution.reduce((sum, item) => sum + item.spend, 0);
  const hourlyMax = Math.max(...hourlyPerformance.map((item) => item.value), 1);
  const ageMax = Math.max(...ageAudience.map((item) => item.value), 1);
  const objectiveColors = ["#3b82f6", "#22c55e", "#a855f7", "#f97316", "#eab308", "#06b6d4"];
  const genderColors = ["#3b82f6", "#a855f7", "#64748b"];

  function showTooltip(event: MouseEvent<Element>, title: string, lines: string[]) {
    const panel = event.currentTarget.closest("[data-chart-panel]") as HTMLElement | null;
    const rect = panel?.getBoundingClientRect();
    setTooltip({
      x: rect ? event.clientX - rect.left : 0,
      y: rect ? event.clientY - rect.top : 0,
      title,
      lines
    });
  }

  function renderTooltip() {
    if (!tooltip) return null;

    return (
      <div
        className="pointer-events-none absolute z-20 min-w-44 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-panel"
        style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
      >
        <div className="mb-1 font-semibold text-text">{tooltip.title}</div>
        <div className="space-y-0.5 font-mono text-[11px] text-muted">
          {tooltip.lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <SectionTitle>Evolucao Temporal</SectionTitle>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="panel relative p-5" data-chart-panel onMouseLeave={() => setTooltip(null)}>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-lg font-bold">Investimento vs Resultado</div>
              <p className="text-xs leading-5 text-muted">Passe o mouse nos pontos para ver os dados do dia e clique nas legendas para ativar ou ocultar as linhas.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowSpend((value) => !value)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${showSpend ? "border-blue bg-blue/10 text-blue-100" : "border-border bg-bg text-muted"}`}
              >
                Investimento
              </button>
              <button
                type="button"
                onClick={() => setShowResult((value) => !value)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${showResult ? "border-green bg-green/10 text-green-100" : "border-border bg-bg text-muted"}`}
              >
                {resultLabel}
              </button>
            </div>
          </div>
          {dailySeries.length ? (
            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${width} ${height}`} className="h-72 min-w-[640px]">
                <defs>
                  <linearGradient id="line-spend-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgba(59,130,246,0.28)" />
                    <stop offset="100%" stopColor="rgba(59,130,246,0.02)" />
                  </linearGradient>
                </defs>
                {Array.from({ length: 5 }).map((_, index) => {
                  const y = padding + (index / 4) * (height - padding * 2);
                  return <line key={y} x1={padding} x2={width - padding} y1={y} y2={y} stroke="rgba(30,34,48,0.8)" strokeWidth="1" />;
                })}
                {showSpend && spendArea ? <polygon points={spendArea} fill="url(#line-spend-fill)" /> : null}
                {showSpend ? <polyline points={spendPoints} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
                {showResult ? <polyline points={resultPoints} fill="none" stroke="#22c55e" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
                {dailySeries.map((item, index) => {
                  const x = padding + (index / Math.max(dailySeries.length - 1, 1)) * (width - padding * 2);
                  const spendY = height - padding - (item.spend / Math.max(...dailySeries.map((entry) => entry.spend), 1)) * (height - padding * 2);
                  const resultY = height - padding - (item.result / Math.max(...dailySeries.map((entry) => entry.result), 1)) * (height - padding * 2);

                  return (
                    <g key={`${item.label}-${index}`}>
                      <rect
                        x={x - 14}
                        y={padding}
                        width="28"
                        height={height - padding * 2}
                        fill="transparent"
                        onMouseEnter={(event) =>
                          showTooltip(event, item.label, [
                            `Investimento: ${formatCurrency(item.spend)}`,
                            `${resultLabel}: ${formatNumber(item.result)}`,
                            `Faturamento: ${formatCurrency(item.revenue ?? 0)}`
                          ])
                        }
                        onMouseMove={(event) =>
                          showTooltip(event, item.label, [
                            `Investimento: ${formatCurrency(item.spend)}`,
                            `${resultLabel}: ${formatNumber(item.result)}`,
                            `Faturamento: ${formatCurrency(item.revenue ?? 0)}`
                          ])
                        }
                      />
                      {showSpend ? (
                        <circle className="pointer-events-none" cx={x} cy={spendY} r="4" fill="#3b82f6">
                          <title>{`${item.label} — Investimento: ${formatCurrency(item.spend)}`}</title>
                        </circle>
                      ) : null}
                      {showResult ? (
                        <circle className="pointer-events-none" cx={x} cy={resultY} r="4" fill="#22c55e">
                          <title>{`${item.label} — ${resultLabel}: ${formatNumber(item.result)}`}</title>
                        </circle>
                      ) : null}
                      <text className="pointer-events-none" x={x} y={height - 2} fill="#64748b" fontSize="10" textAnchor="middle">
                        {item.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-bg p-4 text-sm text-muted">
              Ainda nao ha serie diaria suficiente para desenhar a evolucao temporal.
            </div>
          )}
          {renderTooltip()}
        </div>

        <div className="panel relative p-5" data-chart-panel onMouseLeave={() => setTooltip(null)}>
          <div className="mb-4">
            <div className="text-lg font-bold">Distribuicao por Objetivo</div>
            <p className="text-xs leading-5 text-muted">% de investimento por tipo de campanha.</p>
          </div>
          {objectiveDistribution.length ? (
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div
                className="relative mx-auto h-52 w-52 rounded-full"
                style={{ backgroundImage: buildConicGradient(objectiveDistribution) }}
                onMouseEnter={(event) =>
                  showTooltip(
                    event,
                    "Distribuicao por objetivo",
                    objectiveDistribution.map((item) => `${item.label}: ${formatCurrency(item.spend)} (${formatPercent(item.percentage)})`)
                  )
                }
                onMouseMove={(event) =>
                  showTooltip(
                    event,
                    "Distribuicao por objetivo",
                    objectiveDistribution.map((item) => `${item.label}: ${formatCurrency(item.spend)} (${formatPercent(item.percentage)})`)
                  )
                }
              >
                <div className="absolute inset-8 rounded-full bg-card" />
                <div className="absolute inset-0 grid place-items-center text-center">
                  <div>
                    <div className="font-mono text-xs text-muted">Total</div>
                    <div className="text-xl font-bold">{formatCurrency(totalObjectiveSpend)}</div>
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-3">
                {objectiveDistribution.map((item, index) => (
                  <div
                    key={item.label}
                    className="flex items-start gap-3 rounded-lg p-1 transition hover:bg-white/5"
                    onMouseEnter={(event) => showTooltip(event, item.label, [formatCurrency(item.spend), formatPercent(item.percentage)])}
                    onMouseMove={(event) => showTooltip(event, item.label, [formatCurrency(item.spend), formatPercent(item.percentage)])}
                  >
                    <span
                      className="mt-1 inline-flex h-3 w-3 rounded-sm"
                      style={{ backgroundColor: objectiveColors[index % objectiveColors.length] }}
                    />
                    <div>
                      <div className="text-sm font-semibold">{item.label}</div>
                      <div className="font-mono text-[11px] text-muted">
                        {formatCurrency(item.spend)} · {formatPercent(item.percentage)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-bg p-4 text-sm text-muted">
              Ainda nao ha campanhas suficientes para distribuir o investimento por objetivo.
            </div>
          )}
          {renderTooltip()}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div className="panel relative p-5" data-chart-panel onMouseLeave={() => setTooltip(null)}>
          <div className="mb-4">
            <div className="text-lg font-bold">Audiencia por Idade</div>
            <p className="text-xs leading-5 text-muted">{resultLabel} agrupado por faixa etaria da conta selecionada.</p>
          </div>
          {ageAudience.length ? (
            <div className="grid gap-3">
              {ageAudience.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-sm text-muted">
                    <span>{item.label}</span>
                    <strong className="font-mono text-text">{formatNumber(item.value)}</strong>
                  </div>
                  <div
                    className="h-7 rounded-lg bg-border/90"
                    onMouseEnter={(event) => showTooltip(event, item.label, [`${resultLabel}: ${formatNumber(item.value)}`])}
                    onMouseMove={(event) => showTooltip(event, item.label, [`${resultLabel}: ${formatNumber(item.value)}`])}
                  >
                    <div className="h-full rounded-lg bg-indigo-500/80" style={{ width: `${Math.max(6, (item.value / ageMax) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-bg p-4 text-sm text-muted">
              Ainda nao ha dados de audiencia por idade para esta conta no periodo atual.
            </div>
          )}
          {renderTooltip()}
        </div>

        <div className="panel relative p-5" data-chart-panel onMouseLeave={() => setTooltip(null)}>
          <div className="mb-4">
            <div className="text-lg font-bold">Audiencia por Genero</div>
            <p className="text-xs leading-5 text-muted">{resultLabel} distribuido por genero retornado pela Meta.</p>
          </div>
          {genderAudience.some((item) => item.value > 0) ? (
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div
                className="relative mx-auto h-48 w-48 rounded-full"
                style={{ backgroundImage: buildConicGradient(genderAudience) }}
                onMouseEnter={(event) =>
                  showTooltip(
                    event,
                    "Audiencia por genero",
                    genderAudience.map((item) => `${item.label}: ${formatNumber(item.value)} (${formatPercent(item.percentage)})`)
                  )
                }
                onMouseMove={(event) =>
                  showTooltip(
                    event,
                    "Audiencia por genero",
                    genderAudience.map((item) => `${item.label}: ${formatNumber(item.value)} (${formatPercent(item.percentage)})`)
                  )
                }
              >
                <div className="absolute inset-8 rounded-full bg-card" />
              </div>
              <div className="flex-1 space-y-3">
                {genderAudience.map((item, index) => (
                  <div
                    key={item.label}
                    className="flex items-start gap-3 rounded-lg p-1 transition hover:bg-white/5"
                    onMouseEnter={(event) => showTooltip(event, item.label, [formatNumber(item.value), formatPercent(item.percentage)])}
                    onMouseMove={(event) => showTooltip(event, item.label, [formatNumber(item.value), formatPercent(item.percentage)])}
                  >
                    <span
                      className="mt-1 inline-flex h-3 w-3 rounded-full"
                      style={{ backgroundColor: genderColors[index % genderColors.length] }}
                    />
                    <div>
                      <div className="text-sm font-semibold">{item.label}</div>
                      <div className="font-mono text-[11px] text-muted">
                        {formatNumber(item.value)} · {formatPercent(item.percentage)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-bg p-4 text-sm text-muted">
              Ainda nao ha dados de audiencia por genero para esta conta no periodo atual.
            </div>
          )}
          {renderTooltip()}
        </div>
      </div>

      <div className="panel relative p-5" data-chart-panel onMouseLeave={() => setTooltip(null)}>
        <div className="mb-4">
          <div className="text-lg font-bold">Pico por Horario</div>
          <p className="text-xs leading-5 text-muted">Passe o mouse nas barras para ver o volume de {resultLabel.toLowerCase()} por horario.</p>
        </div>
        {hourlyPerformance.some((item) => item.value > 0) ? (
          <div className="grid h-72 grid-cols-12 gap-2 sm:grid-cols-24">
            {hourlyPerformance.map((item) => (
              <div key={item.label} className="flex h-full flex-col items-center justify-end gap-2">
                <div className="relative flex h-full w-full items-end">
                  <div
                    className={`w-full rounded-t-md transition hover:opacity-90 ${highlightClass(item.highlight)}`}
                    style={{ height: `${Math.max(4, (item.value / hourlyMax) * 100)}%` }}
                    onMouseEnter={(event) => showTooltip(event, item.label, [`${resultLabel}: ${formatNumber(item.value)}`])}
                    onMouseMove={(event) => showTooltip(event, item.label, [`${resultLabel}: ${formatNumber(item.value)}`])}
                  />
                </div>
                <span className="font-mono text-[10px] text-muted">{item.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-bg p-4 text-sm text-muted">
          Ainda nao ha distribuicao por horario suficiente para esta conta no periodo atual.
        </div>
      )}
      {renderTooltip()}
      </div>
    </section>
  );
}
