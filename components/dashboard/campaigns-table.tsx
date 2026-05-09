"use client";

import clsx from "clsx";
import type { CampaignMetric } from "@/lib/types";
import { formatCompact, formatCurrency, formatPercent, formatRoas } from "@/lib/utils/format";

interface CampaignsTableProps {
  campaigns: CampaignMetric[];
  filter: "all" | "ACTIVE" | "PAUSED";
  onFilterChange: (value: "all" | "ACTIVE" | "PAUSED") => void;
  onSort: (column: keyof CampaignMetric) => void;
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
  onOpenCampaign
}: CampaignsTableProps) {
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
      <div className="overflow-x-auto">
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
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr
                key={campaign.id}
                className="cursor-pointer border-t border-border/80 text-sm transition hover:bg-blue/5"
                onClick={() => onOpenCampaign(campaign)}
              >
                <td className="px-4 py-4">
                  <div className="font-semibold">{campaign.name}</div>
                  <div className="text-xs text-blue">clique para detalhar</div>
                </td>
                <td className="px-4 py-4">
                  <span className={clsx("rounded-md border px-2 py-1 font-mono text-[10px]", badgeStyles[campaign.status])}>
                    {campaign.status}
                  </span>
                </td>
                <td className="px-4 py-4">{campaign.objective}</td>
                <td className="px-4 py-4 font-mono">{formatCurrency(campaign.spend)}</td>
                <td className="px-4 py-4 font-mono">{formatCompact(campaign.reach)}</td>
                <td className="px-4 py-4 font-mono">{formatPercent(campaign.ctr)}</td>
                <td className="px-4 py-4 font-mono">{formatRoas(campaign.roas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
