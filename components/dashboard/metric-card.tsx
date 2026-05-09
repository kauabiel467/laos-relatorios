import clsx from "clsx";

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  tone?: "blue" | "green" | "orange" | "yellow" | "cyan" | "purple";
  clickable?: boolean;
  onClick?: () => void;
}

const tones = {
  blue: "before:bg-blue",
  green: "before:bg-green",
  orange: "before:bg-orange",
  yellow: "before:bg-yellow",
  cyan: "before:bg-cyan",
  purple: "before:bg-purple"
};

export function MetricCard({
  label,
  value,
  delta,
  tone = "blue",
  clickable,
  onClick
}: MetricCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "panel relative overflow-hidden p-5 text-left before:absolute before:left-0 before:top-0 before:h-0.5 before:w-full",
        tones[tone],
        clickable ? "transition hover:-translate-y-0.5 hover:border-white/10" : "cursor-default"
      )}
    >
      <div className="eyebrow mb-2">{label}</div>
      <div className="metric-value">{value}</div>
      {delta ? <div className="mt-2 font-mono text-[11px] text-muted">{delta}</div> : null}
    </button>
  );
}
