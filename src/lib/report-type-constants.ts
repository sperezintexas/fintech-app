/** Handler keys that have backend implementations. Shared by API and UI. */
export const REPORT_HANDLER_KEYS = [
  "smartxai",
  "portfoliosummary",
  "watchlistreport",
  "cleanup",
  "daily-analysis",
  "OptionScanner",
  "coveredCallScanner",
  "protectivePutScanner",
  "deliverAlerts",
  "straddleStrangleScanner",
] as const;

export type ReportHandlerKey = (typeof REPORT_HANDLER_KEYS)[number];
