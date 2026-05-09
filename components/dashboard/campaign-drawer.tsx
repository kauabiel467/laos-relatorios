"use client";

import clsx from "clsx";
import type { AdItem, CampaignMetric } from "@/lib/types";
import { formatCompact, formatCurrency, formatPercent, formatRoas } from "@/lib/utils/format";

interface CampaignDrawerProps {
  campaign: CampaignMetric | null;
  ads: AdItem[];
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
}

export function CampaignDrawer({ campaign, ads, loading, error, onClose }: CampaignDrawerProps) {
  const isOpen = Boolean(campaign);

  return (
    <div
      className={clsx(
        "fixed inset-0 z-[70] bg-black/50 transition-opacity duration-300",
        isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      )}
      onClick={onClose}
    >
      <aside
        className={clsx(
          "absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-border bg-card p-5 transition-transform duration-[350ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-bold">{campaign?.name}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={clsx("rounded-md border px-2 py-1 font-mono text-[10px]", campaign?.status === "ACTIVE" ? "border-green/30 bg-green/10 text-green-200" : "border-orange/30 bg-orange/10 text-orange-200")}>
                {campaign?.status}
              </span>
              <span className="rounded-md border border-blue/30 bg-blue/10 px-2 py-1 font-mono text-[10px] text-blue-200">{campaign?.objective}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-muted transition hover:border-red hover:bg-red hover:text-white">Fechar</button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-bg p-3 text-center"><div className="eyebrow mb-1">Spend</div><div className="font-mono text-lg font-bold">{formatCurrency(campaign?.spend ?? 0)}</div></div>
          <div className="rounded-xl border border-border bg-bg p-3 text-center"><div className="eyebrow mb-1">Reach</div><div className="font-mono text-lg font-bold">{formatCompact(campaign?.reach ?? 0)}</div></div>
          <div className="rounded-xl border border-border bg-bg p-3 text-center"><div className="eyebrow mb-1">CTR</div><div className="font-mono text-lg font-bold">{formatPercent(campaign?.ctr ?? 0)}</div></div>
          <div className="rounded-xl border border-border bg-bg p-3 text-center"><div className="eyebrow mb-1">ROAS</div><div className="font-mono text-lg font-bold">{formatRoas(campaign?.roas ?? 0)}</div></div>
        </div>

        <div className="eyebrow mb-3">Anuncios da campanha</div>
        <div className="space-y-3">
          {loading ? <div className="rounded-xl border border-border bg-bg p-4 text-sm text-muted">Carregando anuncios desta campanha...</div> : null}
          {!loading && error ? <div className="rounded-xl border border-red/30 bg-red/10 p-4 text-sm text-red-100">{error}</div> : null}
          {!loading && !error && !ads.length ? (
            <div className="rounded-xl border border-border bg-bg p-4 text-sm text-muted">
              Sem anuncios com dados disponiveis neste periodo.
            </div>
          ) : null}
          {!loading && !error
            ? ads.map((ad: AdItem) => (
                <div key={ad.id} className="rounded-xl border border-border bg-bg p-4 transition hover:border-blue">
                  <div className="flex gap-4">
                    <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-panel text-xs text-muted">
                      {ad.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ad.thumbnailUrl} alt={ad.name} className="h-full w-full object-cover" />
                      ) : (
                        "Sem preview"
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={clsx("rounded-md px-2 py-1 font-mono text-[10px]", ad.type === "video" ? "border-red/30 bg-red/10 text-red-200" : ad.type === "carousel" ? "border-purple/30 bg-purple/10 text-purple-200" : "border-blue/30 bg-blue/10 text-blue-200")}>
                          {ad.type}
                        </span>
                        {ad.top ? <span className="rounded-md border border-yellow/30 bg-yellow/10 px-2 py-1 font-mono text-[10px] text-yellow-200">Top performer</span> : null}
                        {ad.lowPerformer ? <span className="rounded-md border border-orange/30 bg-orange/10 px-2 py-1 font-mono text-[10px] text-orange-200">Baixa perf.</span> : null}
                      </div>
                      <div className="mb-2 truncate text-sm font-semibold">{ad.name}</div>
                      <div className="flex flex-wrap gap-4 font-mono text-[11px] text-muted">
                        <span>CTR <strong className="font-medium text-text">{formatPercent(ad.ctr)}</strong></span>
                        <span>CPC <strong className="font-medium text-text">{formatCurrency(ad.cpc)}</strong></span>
                        <span>Invest <strong className="font-medium text-text">{formatCurrency(ad.spend)}</strong></span>
                        <span>Impres <strong className="font-medium text-text">{formatCompact(ad.impressions || 0)}</strong></span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            : null}
        </div>
      </aside>
    </div>
  );
}
