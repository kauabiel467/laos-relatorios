"use client";

import clsx from "clsx";
import type { DashboardTab } from "@/lib/types";

interface TabsNavProps {
  activeTab: DashboardTab;
  onChange: (tab: DashboardTab) => void;
}

export function TabsNav({ activeTab, onChange }: TabsNavProps) {
  return (
    <div className="border-t border-border/60">
      <div className="mx-auto flex max-w-[1600px] gap-2 px-4 py-2 lg:px-6">
        {[
          { key: "meta", label: "Meta Ads" },
          { key: "cardapio", label: "Cardapio & Pedidos" }
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key as DashboardTab)}
            className={clsx(
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              activeTab === tab.key ? "bg-blue/15 text-blue" : "text-muted hover:bg-white/5 hover:text-text"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
