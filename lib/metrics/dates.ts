export interface DateRange {
  since: string;
  until: string;
}

export interface ResolvedPeriod extends DateRange {
  compare_since?: string;
  compare_until?: string;
  timezone: string;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function parts(value: string) {
  if (!datePattern.test(value)) throw new Error("Data inválida.");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) throw new Error("Data inválida.");
  return { year, month, day, date };
}

export function dateInTimeZone(now: Date, timezone: string) {
  const values = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    values.find((item) => item.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(value: string, amount: number) {
  const { date } = parts(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function daysInclusive(since: string, until: string) {
  const start = parts(since).date.getTime();
  const end = parts(until).date.getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

export function validateDateRange(range: DateRange, today: string, label = "Período") {
  const length = daysInclusive(range.since, range.until);
  if (length < 1) throw new Error(`${label}: a data inicial deve ser anterior ou igual à final.`);
  if (length > 366) throw new Error(`${label}: selecione no máximo 366 dias.`);
  if (range.until > today) throw new Error(`${label}: datas futuras não são permitidas.`);
  return length;
}

export function validateComparisonRanges(current: DateRange, compared: DateRange, today: string, requireSameDuration = true) {
  const currentLength = validateDateRange(current, today, "Período atual");
  const comparedLength = validateDateRange(compared, today, "Período de comparação");
  const overlaps = current.since <= compared.until && compared.since <= current.until;
  if (overlaps) throw new Error("O período de comparação não pode sobrepor o período atual.");
  if (requireSameDuration && currentLength !== comparedLength)
    throw new Error("O período de comparação deve ter a mesma duração do período atual.");
}

export function previousDateRange(since: string, until: string): DateRange {
  const length = daysInclusive(since, until);
  if (length < 1) throw new Error("Período inválido.");
  const previousUntil = addDays(since, -1);
  return { since: addDays(previousUntil, -(length - 1)), until: previousUntil };
}

export function rollingDateRange(
  days: number,
  timezone: string,
  now = new Date(),
): DateRange {
  const until = dateInTimeZone(now, timezone);
  return { since: addDays(until, -(days - 1)), until };
}

export function lastMonthDateRange(timezone: string, now = new Date()): DateRange {
  const current = parts(dateInTimeZone(now, timezone));
  const lastDay = new Date(Date.UTC(current.year, current.month - 1, 0));
  const until = lastDay.toISOString().slice(0, 10);
  return { since: until.slice(0, 8) + "01", until };
}

export function previousCalendarMonth(since: string): DateRange {
  const current = parts(since);
  const lastDay = new Date(Date.UTC(current.year, current.month - 1, 0));
  const until = lastDay.toISOString().slice(0, 10);
  return { since: until.slice(0, 8) + "01", until };
}

export function resolvePeriod(
  preset: "last_7d" | "last_30d" | "last_90d" | "last_month" | "custom",
  timezone: string,
  range: DateRange,
  comparison: "previous" | "none" | "custom" = "previous",
  compare?: Partial<DateRange>,
  now = new Date(),
): ResolvedPeriod {
  const current = preset === "custom"
    ? range
    : preset === "last_month"
      ? lastMonthDateRange(timezone, now)
      : rollingDateRange(preset === "last_7d" ? 7 : preset === "last_90d" ? 90 : 30, timezone, now);
  const today = dateInTimeZone(now, timezone);
  validateDateRange(current, today, "Período atual");
  if (comparison === "none") return { ...current, timezone };
  const compared = comparison === "custom"
    ? { since: compare?.since ?? "", until: compare?.until ?? "" }
    : preset === "last_month"
      ? previousCalendarMonth(current.since)
      : previousDateRange(current.since, current.until);
  validateComparisonRanges(current, compared, today, comparison === "custom");
  return {
    ...current,
    compare_since: compared.since,
    compare_until: compared.until,
    timezone,
  };
}
