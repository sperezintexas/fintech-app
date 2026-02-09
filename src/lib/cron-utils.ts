import cronstrue from "cronstrue";
import { CronExpressionParser } from "cron-parser";

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
    const iso = (next as { toISOString?: () => string | null }).toISOString?.();
    return iso ?? String(next);
  } catch {
    return null;
  }
}
