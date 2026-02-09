/**
 * Display timezone and date formatting.
 * Default: America/Chicago (CST). User can change in profile (Automation → Settings).
 */

export const DEFAULT_DISPLAY_TIMEZONE = "America/Chicago";

export const TIMEZONE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "America/Chicago", label: "Central (CST/CDT)" },
  { value: "America/New_York", label: "Eastern (EST/EDT)" },
  { value: "America/Denver", label: "Mountain (MST/MDT)" },
  { value: "America/Los_Angeles", label: "Pacific (PST/PDT)" },
  { value: "America/Phoenix", label: "Arizona (MST, no DST)" },
  { value: "UTC", label: "UTC" },
];

type DateTimeFormatOptions = Intl.DateTimeFormatOptions;

/**
 * Format a Date or ISO string in the given timezone.
 */
export function formatInTimezone(
  date: Date | string | null | undefined,
  timeZone: string = DEFAULT_DISPLAY_TIMEZONE,
  options: DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }
): string {
  if (date == null) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone,
  }).format(d);
}
