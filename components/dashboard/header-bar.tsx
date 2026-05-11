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

function toDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function isSameDay(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  next.setHours(12, 0, 0, 0);
  return next;
}

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6);
}

function getPresetRange(key: string) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  if (key === "yesterday") {
    const yesterday = addDays(today, -1);
    return { start: yesterday, end: yesterday };
  }

  if (key === "today") {
    return { start: today, end: today };
  }

  if (key === "last_7") {
    return { start: addDays(today, -6), end: today };
  }

  if (key === "last_30") {
    return { start: addDays(today, -29), end: today };
  }

  if (key === "last_90") {
    return { start: addDays(today, -89), end: today };
  }

  if (key === "last_week") {
    const end = addDays(startOfWeek(today), -1);
    return { start: startOfWeek(end), end };
  }

  if (key === "this_week") {
    return { start: startOfWeek(today), end: endOfWeek(today) };
  }

  if (key === "last_month") {
    const base = new Date(today.getFullYear(), today.getMonth() - 1, 1, 12);
    return {
      start: base,
      end: new Date(base.getFullYear(), base.getMonth() + 1, 0, 12)
    };
  }

  if (key === "this_month") {
    return {
      start: new Date(today.getFullYear(), today.getMonth(), 1, 12),
      end: new Date(today.getFullYear(), today.getMonth() + 1, 0, 12)
    };
  }

  if (key === "last_3_months") {
    return { start: new Date(today.getFullYear(), today.getMonth() - 2, 1, 12), end: today };
  }

  return { start: new Date(today.getFullYear(), today.getMonth() - 3, 1, 12), end: today };
}

function buildCalendarDays(month: Date) {
  const firstDay = startOfMonth(month);
  const start = addDays(firstDay, -((firstDay.getDay() + 6) % 7));

  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

const presetOptions = [
  { key: "yesterday", label: "Ontem" },
  { key: "today", label: "Hoje" },
  { key: "last_7", label: "Ultimos 7 dias" },
  { key: "last_30", label: "Ultimos 30 dias" },
  { key: "last_90", label: "Ultimos 90 dias" },
  { key: "last_week", label: "Semana passada" },
  { key: "this_week", label: "Essa semana" },
  { key: "last_month", label: "Mes passado" },
  { key: "this_month", label: "Esse mes" },
  { key: "last_3_months", label: "Ultimos 3 meses" },
  { key: "last_4_months", label: "Ultimos 4 meses" }
] as const;

const weekLabels = ["se", "te", "qu", "qu", "se", "sa", "do"];
const monthLabels = ["Jan.", "Fev.", "Mar.", "Abr.", "Mai.", "Jun.", "Jul.", "Ago.", "Set.", "Out.", "Nov.", "Dez."];

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
  const [isSelectingRangeEnd, setIsSelectingRangeEnd] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState(customStartDate);
  const [draftEndDate, setDraftEndDate] = useState(customEndDate);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(toDate(customStartDate)));
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
    setCalendarMonth(startOfMonth(toDate(customStartDate)));
  }, [customStartDate, customEndDate]);

  const calendarDays = buildCalendarDays(calendarMonth);
  const draftStart = toDate(draftStartDate);
  const draftEnd = toDate(draftEndDate);

  function applyPreset(key: (typeof presetOptions)[number]["key"]) {
    const range = getPresetRange(key);
    setDraftStartDate(toDateInputValue(range.start));
    setDraftEndDate(toDateInputValue(range.end));
    setCalendarMonth(startOfMonth(range.start));
    setIsSelectingRangeEnd(false);
  }

  function selectCalendarDay(day: Date) {
    if (!isSelectingRangeEnd) {
      setDraftStartDate(toDateInputValue(day));
      setDraftEndDate(toDateInputValue(day));
      setIsSelectingRangeEnd(true);
      return;
    }

    const nextStart = day < draftStart ? day : draftStart;
    const nextEnd = day < draftStart ? draftStart : day;
    setDraftStartDate(toDateInputValue(nextStart));
    setDraftEndDate(toDateInputValue(nextEnd));
    setIsSelectingRangeEnd(false);
  }

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
          <div ref={periodRef} className="panel-soft relative min-w-0 p-1">
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
              {periodOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    if (option.key === "custom") {
                      setDraftStartDate(customStartDate);
                      setDraftEndDate(customEndDate);
                      setCalendarMonth(startOfMonth(toDate(customStartDate)));
                      setIsSelectingRangeEnd(false);
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
            </div>
            <div
              className={clsx(
                "panel absolute left-0 top-[calc(100%+10px)] z-[70] w-[min(44rem,calc(100vw-1rem))] p-0 shadow-panel transition duration-200 sm:left-auto sm:right-0",
                isCalendarOpen ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-1 scale-95 opacity-0"
              )}
            >
              <div className="border-b border-border/70 px-4 py-3">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-left text-sm text-text"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v4" />
                    <path d="M16 2v4" />
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M3 10h18" />
                  </svg>
                  {formatDateLabel(draftStartDate)} - {formatDateLabel(draftEndDate)}
                </button>
              </div>
              <div className="grid sm:grid-cols-[180px_1fr]">
                <div className="border-b border-border/70 p-3 sm:border-b-0 sm:border-r">
                  <div className="grid gap-1">
                    {presetOptions.map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => applyPreset(preset.key)}
                        className="rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-blue/10 hover:text-text"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setCalendarMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1, 12))}
                      className="grid h-8 w-8 place-items-center rounded-md text-muted transition hover:bg-white/5 hover:text-text"
                    >
                      ‹
                    </button>
                    <div className="font-medium text-text">
                      {monthLabels[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                    </div>
                    <button
                      type="button"
                      onClick={() => setCalendarMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1, 12))}
                      className="grid h-8 w-8 place-items-center rounded-md text-muted transition hover:bg-white/5 hover:text-text"
                    >
                      ›
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted">
                    {weekLabels.map((label, index) => (
                      <div key={`${label}-${index}`} className="py-1">
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-7 gap-1">
                    {calendarDays.map((day) => {
                      const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                      const isStart = isSameDay(day, draftStart);
                      const isEnd = isSameDay(day, draftEnd);
                      const isInRange = day >= draftStart && day <= draftEnd;

                      return (
                        <button
                          key={day.toISOString()}
                          type="button"
                          onClick={() => selectCalendarDay(day)}
                          className={clsx(
                            "relative h-10 rounded-lg text-sm transition",
                            isStart || isEnd
                              ? "bg-blue text-white"
                              : isInRange
                                ? "bg-blue/10 text-text"
                                : isCurrentMonth
                                  ? "text-text hover:bg-white/5"
                                  : "text-muted/50 hover:bg-white/5"
                          )}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border/70 px-4 py-3">
                <div className="font-mono text-[11px] text-muted">
                  {formatDateLabel(draftStartDate)} - {formatDateLabel(draftEndDate)}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSelectingRangeEnd(false);
                      setIsCalendarOpen(false);
                    }}
                    className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition hover:border-blue hover:text-text"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCustomRangeChange(draftStartDate, draftEndDate);
                      onPeriodChange("custom");
                      setIsSelectingRangeEnd(false);
                      setIsCalendarOpen(false);
                    }}
                    className="rounded-lg bg-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue/90"
                  >
                    Selecionar
                  </button>
                </div>
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
