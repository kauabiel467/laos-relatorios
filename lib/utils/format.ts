export function formatCurrency(value: number | null | undefined, currency = "BRL") {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value == null) return "—";
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}%`;
}

export function formatCompact(value: number | null | undefined) {
  if (value == null) return "—";
  if (value >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)}M`;
  if (value >= 1_000) return `${formatNumber(value / 1_000, 1)}K`;
  return formatNumber(value);
}

export function formatRoas(value: number | null | undefined) {
  if (value == null) return "—";
  return `${formatNumber(value, 2)}x`;
}
