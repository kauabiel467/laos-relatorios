import clsx from "clsx";
import type { AlertItem, DashboardSnapshot } from "@/lib/types";

const dotStyle: Record<AlertItem["tone"], string> = {
  good: "bg-green",
  high: "bg-red",
  warning: "bg-yellow",
  neutral: "bg-blue"
};

interface QuickInsightsSectionProps {
  snapshot: DashboardSnapshot;
}

export function QuickInsightsSection({ snapshot }: QuickInsightsSectionProps) {
  const toneColor: Record<string, string> = {
    green: "#22c55e",
    yellow: "#eab308",
    red: "#ef4444",
    blue: "#3b82f6"
  };
  const scoreColor = toneColor[snapshot.healthTone] ?? "#eab308";

  return (
    <section className="grid gap-4 xl:grid-cols-[1.2fr_0.9fr_1fr]">
      <div className="grid gap-4 md:grid-cols-3">
        {snapshot.quickInsights.map((insight) => (
          <div key={insight.label} className="panel relative overflow-hidden p-5 before:absolute before:left-0 before:top-0 before:h-0.5 before:w-full before:bg-blue">
            <div className="eyebrow mb-3">{insight.label}</div>
            <div className="mb-2 text-lg font-bold leading-tight">{insight.title}</div>
            <p className="text-sm leading-6 text-muted">{insight.description}</p>
          </div>
        ))}
      </div>

      <div className="panel p-5">
        <div className="eyebrow mb-4">Saude do Cliente</div>
        <div className="mb-5 flex items-center gap-4">
          <div
            className="relative grid size-20 place-items-center rounded-full"
            style={{ background: `conic-gradient(${scoreColor} ${snapshot.healthScore}%, #1e2230 0)` }}
          >
            <div className="absolute inset-2 rounded-full bg-card" />
            <span className="relative z-10 font-mono text-xl font-bold">{snapshot.healthScore}</span>
          </div>
          <div>
            <div className="text-lg font-bold">{snapshot.healthLabel}</div>
            <p className="max-w-xs text-sm leading-6 text-muted">
              Nota calculada por eficiencia, tendencia, CPA, ROAS e gargalos do funil.
            </p>
          </div>
        </div>
        <div className="space-y-3 font-mono text-[11px] text-muted">
          <div className="flex items-center justify-between border-t border-border pt-3"><span>Eficiencia</span><strong className="font-medium text-text">{snapshot.roas.toFixed(2)}x</strong></div>
          <div className="flex items-center justify-between border-t border-border pt-3"><span>Tendencia</span><strong className="font-medium text-text">{snapshot.resultDelta.toFixed(1)}%</strong></div>
          <div className="flex items-center justify-between border-t border-border pt-3"><span>CPA</span><strong className="font-medium text-text">R$ {snapshot.cpa.toFixed(2)}</strong></div>
        </div>
      </div>

      <div className="panel p-5">
        <div className="eyebrow mb-4">Alertas & Gargalos</div>
        <div className="space-y-3">
          {snapshot.alerts.map((alert) => (
            <div key={alert.id} className="rounded-xl border border-border bg-bg p-3">
              <div className="mb-1 flex items-start gap-3">
                <span className={clsx("mt-1 inline-flex h-2.5 w-2.5 rounded-full", dotStyle[alert.tone])} />
                <div>
                  <div className="text-sm font-semibold">{alert.title}</div>
                  <p className="mt-1 text-xs leading-5 text-muted">{alert.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
