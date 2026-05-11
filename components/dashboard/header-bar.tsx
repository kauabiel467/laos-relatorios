"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import type { Client, PeriodKey } from "@/lib/types";

interface HeaderBarProps {
  filteredClients: Client[];
  search: string;
  selectedClient: Client;
  period: PeriodKey;
  customStartDate: string;
  customEndDate: string;
  onSearchChange: (value: string) => void;
  onSelectClient: (client: Client) => void;
  onPeriodChange: (period: PeriodKey) => void;
  onCustomRangeChange: (startDate: string, endDate: string) => void;
  onOpenTeam: () => void;
  onOpenConfig: () => void;
  onExport: () => void;
}

const periodOptions: Array<{ key: PeriodKey; label: string }> = [
  { key: "last_7d", label: "7D" },
  { key: "last_30d", label: "30D" },
  { key: "last_90d", label: "90D" },
  { key: "custom", label: "Personalizado" }
];

const statusStyles = {
  ACTIVE: "border-green/30 bg-green/10 text-green-200",
  PAUSED: "border-orange/30 bg-orange/10 text-orange-200"
};

function formatDateLabel(value: string) {
  if (!value) return "--/--";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}`;
}

export function HeaderBar({
  filteredClients,
  search,
  selectedClient,
  period,
  customStartDate,
  customEndDate,
  onSearchChange,
  onSelectClient,
  onPeriodChange,
  onCustomRangeChange,
  onOpenTeam,
  onOpenConfig,
  onExport
}: HeaderBarProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState(customStartDate);
  const [draftEndDate, setDraftEndDate] = useState(customEndDate);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const periodRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);

  const currentPeriodLabel =
    period === "custom"
      ? `${formatDateLabel(customStartDate)} a ${formatDateLabel(customEndDate)}`
      : periodOptions.find((option) => option.key === period)?.label ?? "30D";

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!searchRef.current?.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
      if (!periodRef.current?.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
      if (!actionsRef.current?.contains(event.target as Node)) {
        setIsActionsOpen(false);
      }
    }

    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    setDraftStartDate(customStartDate);
    setDraftEndDate(customEndDate);
  }, [customStartDate, customEndDate]);

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:px-6">
        <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.16em] text-white/90 sm:text-sm sm:tracking-[0.18em]">
          <span className="animate-pulse-dot inline-flex size-2.5 rounded-full bg-blue shadow-[0_0_0_6px_rgba(59,130,246,0.12)]" />
          LAOS | Meta Ads
        </div>

        <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:justify-center">
          <div ref={searchRef} className="panel-soft relative flex min-h-12 flex-1 items-center gap-2 px-3 py-2 lg:max-w-xl">
            <div className="hidden text-xs font-medium text-muted sm:block">Buscar</div>
            <div className="relative flex-1">
              <input
                value={search}
                type="search"
                onChange={(event) => {
                  onSearchChange(event.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setIsSearchOpen(false);
                  }

                  if (event.key === "Enter" && filteredClients[0]) {
                    onSelectClient(filteredClients[0]);
                    setIsSearchOpen(false);
                  }
                }}
                placeholder="Buscar cliente..."
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 pr-10 text-sm text-text outline-none transition focus:border-blue"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted">▼</span>
              {isSearchOpen && (
                <div className="panel absolute left-0 right-0 top-[calc(100%+8px)] max-h-64 overflow-auto p-1">
                  {filteredClients.length ? (
                    filteredClients.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => {
                          onSelectClient(client);
                          setIsSearchOpen(false);
                        }}
                        className="w-full rounded-lg px-3 py-2 text-left transition hover:bg-blue/10"
                      >
                        <div className="text-sm font-semibold text-text">{client.name}</div>
                        <div className="font-mono text-[11px] text-muted">{client.id}</div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-3 text-sm text-muted">Nenhum cliente encontrado.</div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-text">{selectedClient.name}</div>
              <div className="mt-0.5 font-mono text-[11px] text-muted">{currentPeriodLabel}</div>
            </div>
            <span className={clsx("w-fit shrink-0 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]", statusStyles[selectedClient.status])}>
              {selectedClient.status === "ACTIVE" ? "ATIVO" : "PAUSADO"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] items-start gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <div ref={periodRef} className="panel-soft relative flex min-w-0 items-center gap-1 overflow-x-auto p-1">
            {periodOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  if (option.key === "custom") {
                    setDraftStartDate(customStartDate);
                    setDraftEndDate(customEndDate);
                    setIsCalendarOpen((value) => !value);
                    return;
                  }

                  onPeriodChange(option.key);
                  setIsCalendarOpen(false);
                }}
                className={clsx(
                  "shrink-0 rounded-md px-3 py-1.5 font-mono text-[11px] transition",
                  period === option.key || (option.key === "custom" && isCalendarOpen) ? "bg-blue text-white" : "text-muted hover:bg-white/5 hover:text-text"
                )}
              >
                {option.label}
              </button>
            ))}
            <div
              className={clsx(
                "panel absolute left-0 top-[calc(100%+10px)] z-[70] w-[min(20rem,calc(100vw-2rem))] p-4 shadow-panel transition duration-200 sm:left-auto sm:right-0",
                isCalendarOpen ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-1 scale-95 opacity-0"
              )}
            >
              <div className="eyebrow mb-3">Periodo personalizado</div>
              <div className="grid gap-3">
                <label className="grid gap-1 text-xs text-muted">
                  Inicio
                  <input
                    type="date"
                    value={draftStartDate}
                    onChange={(event) => setDraftStartDate(event.target.value)}
                    className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-blue"
                  />
                </label>
                <label className="grid gap-1 text-xs text-muted">
                  Fim
                  <input
                    type="date"
                    value={draftEndDate}
                    onChange={(event) => setDraftEndDate(event.target.value)}
                    className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-blue"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    onCustomRangeChange(draftStartDate, draftEndDate);
                    onPeriodChange("custom");
                    setIsCalendarOpen(false);
                  }}
                  className="rounded-lg bg-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue/90"
                >
                  Aplicar periodo
                </button>
              </div>
            </div>
          </div>
          <div ref={actionsRef} className="relative">
            <button
              type="button"
              onClick={() => setIsActionsOpen((value) => !value)}
              className="panel-soft grid h-11 w-11 place-items-center px-0 text-muted transition hover:border-blue hover:text-text"
              aria-label="Abrir configuracoes"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3.25" />
                <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6Z" />
              </svg>
            </button>
            <div
              className={clsx(
                "panel absolute right-0 top-[calc(100%+10px)] z-[65] min-w-52 p-2 shadow-panel transition duration-200",
                isActionsOpen ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-1 scale-95 opacity-0"
              )}
            >
              <button
                type="button"
                onClick={() => {
                  onExport();
                  setIsActionsOpen(false);
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-blue/10 hover:text-text"
              >
                Exportar
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenTeam();
                  setIsActionsOpen(false);
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-blue/10 hover:text-text"
              >
                Equipe
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenConfig();
                  setIsActionsOpen(false);
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-blue/10 hover:text-text"
              >
                Integracoes
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
