import { addDays, dateInTimeZone, daysInclusive, type DateRange } from "@/lib/metrics/dates";

// The three operational blocks LAOS reports on. They are exact weekday blocks,
// never "the last N days": a Monday-to-Thursday report always covers those four
// days, whichever day the automation happens to run.
export const AUTOMATION_PERIOD_PRESETS = ["monday_thursday", "friday_sunday", "monday_sunday"] as const;
export type AutomationPeriodPreset = (typeof AUTOMATION_PERIOD_PRESETS)[number];

// ISO weekdays: 1 = Monday ... 7 = Sunday.
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface PresetDefinition {
  label: string;
  // First day of the block and how many days it lasts.
  startDay: IsoWeekday;
  length: number;
}

export const AUTOMATION_PERIOD_DEFINITIONS: Record<AutomationPeriodPreset, PresetDefinition> = {
  monday_thursday: { label: "Segunda a quinta", startDay: 1, length: 4 },
  friday_sunday: { label: "Sexta a domingo", startDay: 5, length: 3 },
  monday_sunday: { label: "Segunda a domingo", startDay: 1, length: 7 },
};

export const DEFAULT_AUTOMATION_TIMEZONE = "America/Sao_Paulo";

export function isAutomationPeriodPreset(value: unknown): value is AutomationPeriodPreset {
  return typeof value === "string" && (AUTOMATION_PERIOD_PRESETS as readonly string[]).includes(value);
}

export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// Which timezone decides "what day is it" for an automation:
// 1. the project's own timezone, 2. the timezone of its integration (the Meta
// ad account), 3. America/Sao_Paulo. Anything that is not a real IANA zone is
// skipped rather than trusted.
export function resolveAutomationTimezone(sources: {
  projectTimezone?: string | null;
  integrationTimezone?: string | null;
}) {
  for (const candidate of [sources.projectTimezone, sources.integrationTimezone]) {
    if (isValidTimezone(candidate)) return candidate;
  }
  return DEFAULT_AUTOMATION_TIMEZONE;
}

// Day of the week of a calendar date (yyyy-mm-dd). Calendar dates carry no time
// zone, so this goes through UTC purely as arithmetic, never through "now".
export function isoWeekday(date: string): IsoWeekday {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (day === 0 ? 7 : day) as IsoWeekday;
}

// The equivalent block one week earlier. This is what "compare with the
// previous period" means for LAOS: the same weekdays of the week before
// (21/09-24/09 against 14/09-17/09), not the days immediately preceding.
export function equivalentPreviousWeek(range: DateRange): DateRange {
  return { since: addDays(range.since, -7), until: addDays(range.until, -7) };
}

export interface AutomationPeriod {
  preset: AutomationPeriodPreset;
  timezone: string;
  // The calendar date, in `timezone`, on which the run is happening.
  runDate: string;
  since: string;
  until: string;
  compareSince: string | null;
  compareUntil: string | null;
}

// The most recent COMPLETE block of the preset as of `now`. The block's last day
// must already be over on the run date (in the automation's timezone):
//   Friday    + monday_thursday -> Monday..Thursday of the same week
//   Monday    + friday_sunday   -> the Friday..Sunday that just ended
//   Monday    + monday_sunday   -> last week, Monday..Sunday
//   Thursday  + monday_thursday -> last week's block (today is not over yet)
export function resolveAutomationPeriod(
  preset: AutomationPeriodPreset,
  options: { now?: Date; timezone: string; comparisonEnabled?: boolean },
): AutomationPeriod {
  const definition = AUTOMATION_PERIOD_DEFINITIONS[preset];
  if (!definition) throw new Error("Preset de período inválido.");
  if (!isValidTimezone(options.timezone)) throw new Error("Fuso horário inválido.");
  const runDate = dateInTimeZone(options.now ?? new Date(), options.timezone);
  const endDay = (((definition.startDay + definition.length - 2) % 7) + 1) as IsoWeekday;
  // Days back to the latest end-of-block strictly before today (1..7).
  const daysBack = ((isoWeekday(runDate) - endDay + 7) % 7) || 7;
  const until = addDays(runDate, -daysBack);
  const since = addDays(until, -(definition.length - 1));
  const compare = options.comparisonEnabled === false ? null : equivalentPreviousWeek({ since, until });
  return {
    preset,
    timezone: options.timezone,
    runDate,
    since,
    until,
    compareSince: compare?.since ?? null,
    compareUntil: compare?.until ?? null,
  };
}

export function automationPeriodLength(period: Pick<AutomationPeriod, "since" | "until">) {
  return daysInclusive(period.since, period.until);
}
