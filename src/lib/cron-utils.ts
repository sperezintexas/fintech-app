import cronstrue from "cronstrue";
import { CronExpressionParser } from "cron-parser";
import { formatInTimezone } from "@/lib/date-format";

/**
 * Converts a cron expression to a human-readable schedule description.
 * Returns the raw cron on parse failure.
 */
export function cronToHuman(cron: string): string {
  try {
    return cronstrue.toString(cron.trim(), { throwExceptionOnParseError: true });
  } catch {
    return cron;
  }
}

const TZ_LABELS: Record<string, string> = {
  "America/Chicago": "CST",
  "America/New_York": "ET",
  "America/Denver": "Mountain",
  "America/Los_Angeles": "Pacific",
  UTC: "UTC",
};

/**
 * Human-readable schedule in a given timezone, matching the Next run column (same TZ and time format).
 * Cron is interpreted as UTC; the returned string shows when that translates to in the given TZ.
 */
export function cronToHumanInTimezone(
  cron: string,
  timeZone: string = "America/Chicago",
  tzLabel?: string
): string {
  const label = tzLabel ?? TZ_LABELS[timeZone] ?? timeZone;
  const trimmed = cron?.trim();
  if (!trimmed) return cron;

  const parts = trimmed.split(/\s+/);
  const is6 = parts.length >= 6;
  const [min, hour, dom, _month, dow] = is6 ? parts.slice(1, 6) : parts;

  const freq =
    dow === "0"
      ? "Sun"
      : dow === "1-5" || dow === "1,2,3,4,5"
        ? "Mon–Fri"
        : dow === "*" && dom === "*"
          ? "Daily"
          : dow === "*"
            ? "Daily"
            : null;

  const formatTimeUtc = (hourStr: string, minStr: string) => {
    const h = parseInt(hourStr, 10);
    const m = parseInt(minStr || "0", 10);
    const d = new Date(Date.UTC(2025, 0, 6, h, m, 0));
    return formatInTimezone(d, timeZone, { timeStyle: "short" });
  };

  try {
    if (hour?.includes(",") && !hour.includes("-")) {
      const times = hour.split(",").map((h) => formatTimeUtc(h.trim(), min ?? "0"));
      const timeStr = times.join(" & ");
      return freq ? `${freq} at ${timeStr} ${label}` : `At ${timeStr} ${label}`;
    }
    if (hour?.includes("-")) {
      const [h1, h2] = hour.split("-").map((h) => h.trim());
      const t1 = formatTimeUtc(h1, min ?? "0");
      const t2 = formatTimeUtc(h2, min ?? "0");
      const timeStr = `${t1}–${t2}`;
      return freq ? `${freq} at ${timeStr} ${label}` : `At ${timeStr} ${label}`;
    }
    const nextIso = getNextRunFromCron(trimmed);
    if (!nextIso) return cronToHuman(trimmed);
    const timeStr = formatInTimezone(nextIso, timeZone, { timeStyle: "short" });
    return freq ? `${freq} at ${timeStr} ${label}` : `At ${timeStr} ${label}`;
  } catch {
    return cronToHuman(trimmed);
  }
}

/**
 * Returns the next run time (ISO string) for a cron expression, or null if invalid.
 * Accepts 5-field (minute hour dom month dow) or 6-field (second minute hour dom month dow) cron.
 * Uses UTC.
 */
export function getNextRunFromCron(cron: string): string | null {
  const trimmed = cron?.trim();
  if (!trimmed) return null;
  try {
    const parts = trimmed.split(/\s+/);
    const expression = parts.length === 5 ? `0 ${trimmed}` : trimmed;
    const interval = CronExpressionParser.parse(expression, { tz: "UTC" });
    const next = interval.next();
    const date =
      typeof (next as { toDate?: () => Date }).toDate === "function"
        ? (next as { toDate: () => Date }).toDate()
        : next instanceof Date
          ? next
          : null;
    return date ? (date as Date).toISOString() : null;
  } catch {
    return null;
  }
}
