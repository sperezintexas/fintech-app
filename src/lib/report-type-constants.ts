/** Handler keys that have backend implementations. Shared by API and UI. */
export const REPORT_HANDLER_KEYS = [
  "smartxai",
  "portfoliosummary",
  "watchlistreport",
  "cleanup",
  "daily-analysis",
  "unifiedOptionsScanner",
  "deliverAlerts",
] as const;

export type ReportHandlerKey = (typeof REPORT_HANDLER_KEYS)[number];
