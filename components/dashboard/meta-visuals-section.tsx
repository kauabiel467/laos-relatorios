"use client";

import type { AgeAudiencePoint, DailyPoint, GenderAudiencePoint, HourlyPerformancePoint, ObjectiveDistributionItem } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
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

  const firstPoint = points.split(" ")[0];
  const lastPoint = points.split(" ").at(-1);
  if (!firstPoint || !lastPoint) return "";

  return `${firstPoint} ${points} ${lastPoint.split(",")[0]},${height - padding} ${firstPoint.split(",")[0]},${height - padding}`;
}

function buildConicGradient(items: ObjectiveDistributionItem[]) {
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

export function MetaVisualsSection({
  dailySeries,
  objectiveDistribution,
  hourlyPerformance,
  ageAudience,
  genderAudience,
  resultLabel
}: MetaVisualsSectionProps) {
  const width = 760;
  const height = 280;
  const padding = 24;
  const spendPoints = buildPolyline(
    dailySeries.map((item) => item.spend),
    width,
    height,
    padding
  );
  const resultPoints = buildPolyline(
    dailySeries.map((item) => item.result),
    width,
    height,
    padding
  );
  const spendArea = buildArea(spendPoints, width, height, padding);
  const totalObjectiveSpend = objectiveDistribution.reduce((sum, item) => sum + item.spend, 0);
  const hourlyMax = Math.max(...hourlyPerformance.map((item) => item.value), 1);
  const ageMax = Math.max(...ageAudience.map((item) => item.value), 1);

  return (
    <section className="space-y-4">
      <SectionTitle>Evolucao Temporal</SectionTitle>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="panel p-5">
          <div className="mb-4">
            <div className="text-lg font-bold">Investimento vs Resultado</div>
            <p className="text-xs leading-5 text-muted">Linha azul = investimento. Linha verde = {resultLabel.toLowerCase()}.</p>
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
                {spendArea ? <polygon points={spendArea} fill="url(#line-spend-fill)" /> : null}
                <polyline points={spendPoints} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                <polyline points={resultPoints} fill="none" stroke="#22c55e" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                {dailySeries.map((item, index) => {
                  const x = padding + (index / Math.max(dailySeries.length - 1, 1)) * (width - padding * 2);
                  return (
                    <text key={`${item.label}-${index}`} x={x} y={height - 2} fill="#64748b" fontSize="10" textAnchor="middle">
                      {item.label}
                    </text>
                  );
                })}
              </svg>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-bg p-4 text-sm text-muted">
              Ainda nao ha serie diaria suficiente para desenhar a evolucao temporal.
            </div>
          )}
        </div>

        <div className="panel p-5">
          <div className="mb-4">
            <div className="text-lg font-bold">Distribuicao por Objetivo</div>
            <p className="text-xs leading-5 text-muted">% de investimento por tipo de campanha.</p>
          </div>
          {objectiveDistribution.length ? (
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div
                className="relative mx-auto h-52 w-52 rounded-full"
                style={{ backgroundImage: buildConicGradient(objectiveDistribution) }}
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
                  <div key={item.label} className="flex items-start gap-3">
                    <span
                      className="mt-1 inline-flex h-3 w-3 rounded-sm"
                      style={{ backgroundColor: ["#3b82f6", "#22c55e", "#a855f7", "#f97316", "#eab308", "#06b6d4"][index % 6] }}
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
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div className="panel p-5">
          <div className="mb-4">
            <div className="text-lg font-bold">Audiencia por Idade</div>
            <p className="text-xs leading-5 text-muted">Alcance agregado por faixa etaria da conta selecionada.</p>
          </div>
          {ageAudience.length ? (
            <div className="grid gap-3">
              {ageAudience.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-sm text-muted">
                    <span>{item.label}</span>
                    <strong className="font-mono text-text">{item.value.toLocaleString("pt-BR")}</strong>
                  </div>
                  <div className="h-7 rounded-lg bg-border/90">
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
        </div>

        <div className="panel p-5">
          <div className="mb-4">
            <div className="text-lg font-bold">Audiencia por Genero</div>
            <p className="text-xs leading-5 text-muted">Distribuicao de alcance por genero retornada pela Meta.</p>
          </div>
          {genderAudience.some((item) => item.value > 0) ? (
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div
                className="relative mx-auto h-48 w-48 rounded-full"
                style={{
                  backgroundImage: buildConicGradient(
                    genderAudience.map((item) => ({
                      label: item.label,
                      spend: item.value,
                      percentage: item.percentage
                    }))
                  )
                }}
              >
                <div className="absolute inset-8 rounded-full bg-card" />
              </div>
              <div className="flex-1 space-y-3">
                {genderAudience.map((item, index) => (
                  <div key={item.label} className="flex items-start gap-3">
                    <span
                      className="mt-1 inline-flex h-3 w-3 rounded-full"
                      style={{ backgroundColor: ["#3b82f6", "#a855f7", "#64748b"][index % 3] }}
                    />
                    <div>
                      <div className="text-sm font-semibold">{item.label}</div>
                      <div className="font-mono text-[11px] text-muted">
                        {item.value.toLocaleString("pt-BR")} · {formatPercent(item.percentage)}
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
        </div>
      </div>

      <div className="panel p-5">
        <div className="mb-4">
          <div className="text-lg font-bold">Pico de Vendas por Horario</div>
          <p className="text-xs leading-5 text-muted">Resultado principal agrupado por hora do dia, priorizando vendas quando houver compras.</p>
        </div>
        {hourlyPerformance.some((item) => item.value > 0) ? (
          <div className="grid h-72 grid-cols-12 gap-2 sm:grid-cols-24">
            {hourlyPerformance.map((item) => (
              <div key={item.label} className="flex h-full flex-col items-center justify-end gap-2">
                <div className="relative flex h-full w-full items-end">
                  <div
                    className={`w-full rounded-t-md ${highlightClass(item.highlight)}`}
                    style={{ height: `${Math.max(4, (item.value / hourlyMax) * 100)}%` }}
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
      </div>
    </section>
  );
}
