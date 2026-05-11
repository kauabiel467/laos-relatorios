import clsx from "clsx";

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  tone?: "blue" | "green" | "orange" | "yellow" | "cyan" | "purple";
  clickable?: boolean;
  loading?: boolean;
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
  loading,
  onClick
}: MetricCardProps) {
  const deltaColor = delta?.startsWith("+") ? "text-green" : delta?.startsWith("-") ? "text-red" : "text-muted";

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "panel group relative overflow-hidden p-4 text-left transition hover:-translate-y-0.5 hover:border-white/10 before:absolute before:left-0 before:top-0 before:h-0.5 before:w-full sm:p-5",
        tones[tone],
        clickable ? "cursor-pointer" : "cursor-default"
      )}
    >
      <div className="eyebrow mb-2">{label}</div>
      {loading ? (
        <>
          <div className="skeleton h-8 w-28" />
          <div className="skeleton mt-2 h-3 w-16" />
        </>
      ) : (
        <>
          <div className="metric-value">{value}</div>
          {delta ? <div className={clsx("mt-2 font-mono text-[11px]", deltaColor)}>{delta}</div> : null}
        </>
      )}
      {clickable ? (
        <div className="mt-3 hidden text-xs text-blue opacity-0 transition-opacity group-hover:opacity-100 sm:block">
          clique para detalhar
        </div>
      ) : null}
    </button>
  );
}
