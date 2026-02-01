import { getDb } from "@/lib/mongodb";

type ReportTypeSeed = {
  id: string;
  handlerKey: string;
  name: string;
  description: string;
  supportsPortfolio: boolean;
  supportsAccount: boolean;
  order: number;
  enabled: boolean;
};

const DEFAULT_REPORT_TYPES: ReportTypeSeed[] = [
  { id: "smartxai", handlerKey: "smartxai", name: "SmartXAI Report", description: "AI-powered position analysis and sentiment", supportsPortfolio: false, supportsAccount: true, order: 0, enabled: true },
  { id: "portfoliosummary", handlerKey: "portfoliosummary", name: "Portfolio Summary", description: "Multi-account portfolio overview", supportsPortfolio: true, supportsAccount: true, order: 1, enabled: true },
  { id: "watchlistreport", handlerKey: "watchlistreport", name: "Watchlist Report", description: "Market snapshot + rationale per item; runs daily analysis and creates alerts", supportsPortfolio: false, supportsAccount: true, order: 2, enabled: true },
  { id: "cleanup", handlerKey: "cleanup", name: "Data Cleanup", description: "Delete old reports and alerts (30+ days)", supportsPortfolio: true, supportsAccount: true, order: 3, enabled: true },
  { id: "daily-analysis", handlerKey: "daily-analysis", name: "Daily Analysis", description: "Watchlist analysis only (alerts). Prefer Watchlist Report which includes this.", supportsPortfolio: true, supportsAccount: true, order: 4, enabled: true },
  { id: "OptionScanner", handlerKey: "OptionScanner", name: "Option Scanner", description: "Evaluates option positions (HOLD/BTC recommendations)", supportsPortfolio: false, supportsAccount: true, order: 5, enabled: true },
  { id: "coveredCallScanner", handlerKey: "coveredCallScanner", name: "Covered Call Scanner", description: "Evaluates covered call positions and opportunities", supportsPortfolio: false, supportsAccount: true, order: 6, enabled: true },
  { id: "protectivePutScanner", handlerKey: "protectivePutScanner", name: "Protective Put Scanner", description: "Evaluates protective put positions and opportunities", supportsPortfolio: false, supportsAccount: true, order: 7, enabled: true },
  { id: "straddleStrangleScanner", handlerKey: "straddleStrangleScanner", name: "Straddle/Strangle Scanner", description: "Evaluates long straddle and strangle positions", supportsPortfolio: false, supportsAccount: true, order: 8, enabled: true },
  { id: "unifiedOptionsScanner", handlerKey: "unifiedOptionsScanner", name: "Unified Options Scanner", description: "Runs Option, Covered Call, Protective Put, and Straddle/Strangle scanners in one job", supportsPortfolio: false, supportsAccount: true, order: 9, enabled: true },
  { id: "deliverAlerts", handlerKey: "deliverAlerts", name: "Deliver Alerts", description: "Sends pending alerts to Slack/X per AlertConfig", supportsPortfolio: true, supportsAccount: true, order: 10, enabled: true },
];

export async function ensureDefaultReportTypes(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  const coll = db.collection("reportTypes");
  const now = new Date().toISOString();
  for (const t of DEFAULT_REPORT_TYPES) {
    const exists = await coll.findOne({ id: t.id });
    if (!exists) {
      await coll.insertOne({
        ...t,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}
