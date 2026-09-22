"use client";

import type { ChartView } from "./metric-chart";
import styles from "./progress-metric-card.module.css";
import { IconChartBar, IconChartLine } from "@tabler/icons-react";

export interface PeriodOption {
  label: string;
  points?: number;
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
        <IconChartLine size={20} stroke={1.8} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={value === "bars" ? styles.viewActive : ""}
        aria-label="Exibir gráfico em barras"
        aria-pressed={value === "bars"}
        onClick={() => onChange("bars")}
      >
        <IconChartBar size={20} stroke={1.8} aria-hidden="true" />
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
