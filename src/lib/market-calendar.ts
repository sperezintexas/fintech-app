/**
 * US equity market calendar (NYSE/NASDAQ style, like Yahoo Finance).
 * Regular hours: 9:30 AM – 4:00 PM Eastern, Mon–Fri.
 * Excludes US market holidays and supports pre-market / after-hours state.
 */

const TZ = "America/New_York";

/** US market closed days (NYSE/NASDAQ). YYYY-MM-DD. Early closes (e.g. 1 PM ET) not included. */
const MARKET_HOLIDAYS: Record<string, string[]> = {
  "2025": [
    "2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26",
    "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
  ],
  "2026": [
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
    "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  ],
  "2027": [
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
    "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
  ],
};

export type MarketState = "open" | "closed" | "pre-market" | "after-hours";

const WEEKDAY_ET: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function toETDate(d: Date): { year: number; month: number; day: number; weekday: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const wdFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" });
  const weekday = WEEKDAY_ET[wdFmt.format(d)] ?? 0;
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    weekday,
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
  };
}

function toETDateString(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** True if the given date (in ET) is a known market holiday. */
export function isMarketHoliday(date: Date): boolean {
  const y = date.getFullYear();
  const key = String(y);
  const list = MARKET_HOLIDAYS[key];
  if (!list) return false;
  const ds = toETDateString(date);
  return list.includes(ds);
}

/** Get list of market holiday dates for a year (YYYY-MM-DD). */
export function getMarketHolidays(year: number): string[] {
  return MARKET_HOLIDAYS[String(year)] ?? [];
}

/**
 * Market state for a given time (default: now). Uses America/New_York.
 * Pre-market: 4:00 AM – 9:30 AM ET. Open: 9:30 AM – 4:00 PM ET. After-hours: 4:00 PM – 8:00 PM ET.
 */
export function getMarketState(date: Date = new Date()): MarketState {
  const et = toETDate(date);
  const { weekday, hour, minute } = et;

  if (weekday === 0 || weekday === 6) return "closed";
  if (isMarketHoliday(date)) return "closed";

  if (hour < 4) return "closed";
  if (hour < 9) return "pre-market";
  if (hour === 9 && minute < 30) return "pre-market";
  if (hour < 16) return "open";
  if (hour < 20) return "after-hours";
  return "closed";
}

/** True when state is "open" (regular session 9:30 AM – 4:00 PM ET, weekdays, non-holiday). */
export function isMarketOpen(date: Date = new Date()): boolean {
  return getMarketState(date) === "open";
}

/** Same as isMarketOpen; alias for drop-in replacement with existing isMarketHours(). */
export function isMarketHours(date: Date = new Date()): boolean {
  return isMarketOpen(date);
}

/** Build a Date for 9:30 AM ET on the given ET date (year, month 1-12, day). */
function dateAt930ET(year: number, month: number, day: number): Date {
  const s = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T09:30:00`;
  const est = new Date(`${s}-05:00`);
  const edt = new Date(`${s}-04:00`);
  const et = toETDate(est);
  if (et.hour === 9 && et.minute === 30) return est;
  return edt;
}

/** Build a Date for 4:00 PM ET on the given ET date. */
function dateAt4PMET(year: number, month: number, day: number): Date {
  const s = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T16:00:00`;
  const est = new Date(`${s}-05:00`);
  const edt = new Date(`${s}-04:00`);
  const et = toETDate(est);
  if (et.hour === 16 && et.minute === 0) return est;
  return edt;
}

/** Next regular session open (9:30 AM ET) on or after the given date. */
export function getNextOpen(after: Date = new Date()): Date {
  let et = toETDate(after);
  let cand = dateAt930ET(et.year, et.month, et.day);
  if (after.getTime() >= cand.getTime()) {
    const nextDay = new Date(cand.getTime() + 24 * 60 * 60 * 1000);
    et = toETDate(nextDay);
    cand = dateAt930ET(et.year, et.month, et.day);
  }
  while (et.weekday === 0 || et.weekday === 6 || isMarketHoliday(cand)) {
    const nextDay = new Date(cand.getTime() + 24 * 60 * 60 * 1000);
    et = toETDate(nextDay);
    cand = dateAt930ET(et.year, et.month, et.day);
  }
  return cand;
}

/** Next regular session close (4:00 PM ET) on or after the given date. */
export function getNextClose(after: Date = new Date()): Date {
  let et = toETDate(after);
  let cand = dateAt4PMET(et.year, et.month, et.day);
  if (after.getTime() >= cand.getTime()) {
    const nextDay = new Date(cand.getTime() + 24 * 60 * 60 * 1000);
    et = toETDate(nextDay);
    cand = dateAt4PMET(et.year, et.month, et.day);
  }
  while (et.weekday === 0 || et.weekday === 6 || isMarketHoliday(cand)) {
    const nextDay = new Date(cand.getTime() + 24 * 60 * 60 * 1000);
    et = toETDate(nextDay);
    cand = dateAt4PMET(et.year, et.month, et.day);
  }
  return cand;
}
