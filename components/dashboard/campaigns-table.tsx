"use client";

import clsx from "clsx";
import type { CampaignMetric } from "@/lib/types";
import { formatCompact, formatCurrency, formatPercent, formatRoas } from "@/lib/utils/format";

interface CampaignsTableProps {
  campaigns: CampaignMetric[];
  filter: "all" | "ACTIVE" | "PAUSED";
  onFilterChange: (value: "all" | "ACTIVE" | "PAUSED") => void;
  onSort: (column: keyof CampaignMetric) => void;
  sortColumn: keyof CampaignMetric;
  sortDirection: 1 | -1;
  onOpenCampaign: (campaign: CampaignMetric) => void;
}

const badgeStyles = {
  ACTIVE: "border-green/30 bg-green/10 text-green-200",
  PAUSED: "border-orange/30 bg-orange/10 text-orange-200"
};

export function CampaignsTable({
  campaigns,
  filter,
  onFilterChange,
  onSort,
  sortColumn,
  sortDirection,
  onOpenCampaign
}: CampaignsTableProps) {
  const maxSpend = Math.max(...campaigns.map((campaign) => campaign.spend), 1);

  return (
    <div className="panel mt-4 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2">
          {[
            { key: "all", label: "Todas" },
            { key: "ACTIVE", label: "Ativas" },
            { key: "PAUSED", label: "Pausadas" }
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onFilterChange(item.key as "all" | "ACTIVE" | "PAUSED")}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-sm transition",
                filter === item.key ? "bg-blue/15 text-blue" : "text-muted hover:bg-white/5 hover:text-text"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="font-mono text-xs text-muted">{campaigns.length} campanhas</div>
      </div>
      <div className="grid gap-3 p-4 md:hidden">
        {campaigns.length ? (
          campaigns.map((campaign) => (
            <button
              key={campaign.id}
              type="button"
              onClick={() => onOpenCampaign(campaign)}
              className="rounded-xl border border-border bg-card/70 p-4 text-left transition hover:border-blue hover:bg-blue/5"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-text">{campaign.name}</div>
                  <div className="mt-1 text-xs text-muted">{campaign.objective}</div>
                </div>
                <span className={clsx("shrink-0 rounded-md border px-2 py-1 font-mono text-[10px]", badgeStyles[campaign.status])}>
                  {campaign.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-muted">Investimento</div>
                  <div className="font-mono text-text">{formatCurrency(campaign.spend)}</div>
                </div>
                <div>
                  <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-muted">ROAS</div>
                  <div className="font-mono text-text">{formatRoas(campaign.roas)}</div>
                </div>
                <div>
                  <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-muted">Alcance</div>
                  <div className="font-mono text-text">{formatCompact(campaign.reach)}</div>
                </div>
                <div>
                  <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-muted">CTR</div>
                  <div className="font-mono text-text">{formatPercent(campaign.ctr)}</div>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-blue" style={{ width: `${(campaign.spend / maxSpend) * 100}%` }} />
              </div>
            </button>
          ))
        ) : (
          <div className="rounded-xl border border-border bg-bg px-4 py-8 text-center text-sm text-muted">
            Nenhuma campanha com dados disponiveis para este filtro e periodo.
          </div>
        )}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-left">
          <thead className="bg-border/40 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            <tr>
              {[
                ["name", "Campanha"],
                ["status", "Status"],
                ["objective", "Objetivo"],
                ["spend", "Investimento"],
                ["reach", "Alcance"],
                ["ctr", "CTR"],
                ["roas", "ROAS"]
              ].map(([key, label]) => (
                <th key={key} className="cursor-pointer px-4 py-3" onClick={() => onSort(key as keyof CampaignMetric)}>
                  <span className="inline-flex items-center gap-1.5">
                    {label}
                    <span className={clsx(key === sortColumn ? "text-blue opacity-100" : "text-muted opacity-40")}>
                      {key === sortColumn ? (sortDirection === 1 ? "↑" : "↓") : "↕"}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {campaigns.length ? (
              campaigns.map((campaign) => (
                <tr
                  key={campaign.id}
                  className="group cursor-pointer border-t border-border/80 text-sm transition hover:bg-blue/5"
                  onClick={() => onOpenCampaign(campaign)}
                >
                  <td className="px-4 py-4">
                    <div className="font-semibold">{campaign.name}</div>
                    <div className="text-xs text-blue opacity-0 transition-opacity group-hover:opacity-100">clique para detalhar</div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={clsx("rounded-md border px-2 py-1 font-mono text-[10px]", badgeStyles[campaign.status])}>
                      {campaign.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">{campaign.objective}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{formatCurrency(campaign.spend)}</span>
                      <div className="h-1 w-14 overflow-hidden rounded-full bg-border">
                        <div className="h-full rounded-full bg-blue" style={{ width: `${(campaign.spend / maxSpend) * 100}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 font-mono">{formatCompact(campaign.reach)}</td>
                  <td className="px-4 py-4 font-mono">{formatPercent(campaign.ctr)}</td>
                  <td className="px-4 py-4 font-mono">{formatRoas(campaign.roas)}</td>
                </tr>
              ))
            ) : (
              <tr className="border-t border-border/80 text-sm">
                <td colSpan={7} className="px-4 py-10 text-center text-muted">
                  Nenhuma campanha com dados disponiveis para este filtro e periodo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
