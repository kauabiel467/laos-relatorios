"use client";

import type { ChartView } from "./metric-chart";
import styles from "./progress-metric-card.module.css";

export interface PeriodOption {
  label: string;
  points?: number;
}

function CurveIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2.5 14.5c2.8 0 3.1-8.4 6.2-8.4 2.7 0 2.8 5.5 5.2 5.5 1.6 0 2.6-2 3.6-4.2" />
    </svg>
  );
}

function BarsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 16V9m6 7V4m6 12v-5" />
    </svg>
  );
}

export function ViewToggle({ value, onChange }: { value: ChartView; onChange: (view: ChartView) => void }) {
  return (
    <div className={styles.viewToggle} role="group" aria-label="Formato do gráfico">
      <button
        type="button"
        className={value === "curve" ? styles.viewActive : ""}
        aria-label="Exibir gráfico em linha"
        aria-pressed={value === "curve"}
        onClick={() => onChange("curve")}
      >
        <CurveIcon />
      </button>
      <button
        type="button"
        className={value === "bars" ? styles.viewActive : ""}
        aria-label="Exibir gráfico em barras"
        aria-pressed={value === "bars"}
        onClick={() => onChange("bars")}
      >
        <BarsIcon />
      </button>
    </div>
  );
}

export function PeriodSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options?: PeriodOption[];
  onChange?: (option: PeriodOption) => void;
}) {
  if (!options?.length || !onChange) {
    return <span className={styles.periodLabel}>{value}</span>;
  }

  return (
    <label className={styles.periodSelect}>
      <span className="sr-only">Período visível no gráfico</span>
      <select
        value={value}
        onChange={(event) => {
          const option = options.find((item) => item.label === event.target.value);
          if (option) onChange(option);
        }}
      >
        {options.map((option) => (
          <option value={option.label} key={option.label}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
