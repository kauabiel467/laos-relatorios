import { addDays, dateInTimeZone } from "@/lib/metrics/dates";
import { isoWeekday, isValidTimezone, type IsoWeekday } from "./periods";

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function offsetMinutes(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const wallClockAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

// The instant at which the wall clock in `timezone` reads `date` + `time`.
// Resolved in two passes so it stays correct across daylight-saving changes.
// (A wall time that does not exist, inside a spring-forward gap, lands on the
// nearest valid instant.)
export function zonedDateTimeToUtc(date: string, time: string, timezone: string) {
  const match = timePattern.exec(time);
  if (!match) throw new Error("Horário inválido.");
  if (!isValidTimezone(timezone)) throw new Error("Fuso horário inválido.");
  const [year, month, day] = date.split("-").map(Number);
  const wallClock = Date.UTC(year, month - 1, day, Number(match[1]), Number(match[2]), Number(match[3] ?? 0));
  const first = wallClock - offsetMinutes(new Date(wallClock), timezone) * 60_000;
  return new Date(wallClock - offsetMinutes(new Date(first), timezone) * 60_000);
}

export interface AutomationSchedule {
  runWeekday: IsoWeekday;
  // "HH:MM" or "HH:MM:SS", read on the wall clock of `timezone`.
  runTime: string;
  timezone: string;
}

// The next moment a weekly automation is due, strictly after `after`. This is
// the value stored in next_run_at; nothing here executes anything.
export function nextRunAt(schedule: AutomationSchedule, after: Date = new Date()) {
  const today = dateInTimeZone(after, schedule.timezone);
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = addDays(today, offset);
    if (isoWeekday(day) !== schedule.runWeekday) continue;
    const candidate = zonedDateTimeToUtc(day, schedule.runTime, schedule.timezone);
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  throw new Error("Agenda inválida.");
}
