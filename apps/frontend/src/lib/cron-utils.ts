import cronstrue from "cronstrue";
import { CronExpressionParser } from "cron-parser";
import { formatInTimezone } from "@/lib/date-format";

/**
 * Converts a cron expression to a human-readable schedule description (English, cron is in UTC).
 * Returns the raw cron on parse failure.
 */
export function cronToHuman(cron: string): string {
  try {
    return cronstrue.toString(cron.trim(), { throwExceptionOnParseError: true });
  } catch {
    return cron;
  }
}

export type CronSchedulePreview = {
  description: string;
  error?: string;
};

/**
 * Eval a cron expression and return an English "Schedule to run" preview.
 * Shows cronstrue (UTC) plus local TZ translation when a display timezone is given.
 */
export function getCronSchedulePreview(
  cron: string,
  timeZone: string = "America/Chicago",
  tzLabel?: string
): CronSchedulePreview {
  const trimmed = cron?.trim();
  if (!trimmed) return { description: "" };

  let utcDesc: string;
  try {
    utcDesc = cronstrue.toString(trimmed, { throwExceptionOnParseError: true });
  } catch {
    return { description: "", error: "Invalid cron expression" };
  }

  const inTz = cronToHumanInTimezone(trimmed, timeZone, tzLabel);
  if (inTz === trimmed) return { description: utcDesc };
  return { description: `${utcDesc} → ${inTz}` };
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

  const firstMin = (m: string | undefined) => (m ?? "0").split(",")[0]?.trim() ?? "0";
  const formatTimeUtc = (hourStr: string, minStr: string, useTz: string) => {
    const h = parseInt(hourStr, 10);
    const m = parseInt(minStr, 10);
    const d = new Date(Date.UTC(2025, 0, 6, h, m, 0));
    return formatInTimezone(d, useTz, { timeStyle: "short" });
  };

  try {
    if (hour?.includes(",") && !hour.includes("-")) {
      const times = hour.split(",").map((h) => formatTimeUtc(h.trim(), firstMin(min), timeZone));
      const timeStr = times.join(" & ");
      return freq ? `${freq} at ${timeStr} ${label}` : `At ${timeStr} ${label}`;
    }
    if (hour?.includes("-")) {
      const [h1, h2] = hour.split("-").map((h) => h.trim());
      const t1Local = formatTimeUtc(h1, firstMin(min), timeZone);
      const t2Local = formatTimeUtc(h2, firstMin(min), timeZone);
      const t1Utc = formatTimeUtc(h1, firstMin(min), "UTC");
      const t2Utc = formatTimeUtc(h2, firstMin(min), "UTC");
      const timeStr =
        timeZone === "UTC" || label === "UTC"
          ? `${t1Local}–${t2Local} ${label}`
          : `${t1Utc}–${t2Utc} UTC (${t1Local}–${t2Local} ${label})`;
      return freq ? `${freq} at ${timeStr}` : `At ${timeStr}`;
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
