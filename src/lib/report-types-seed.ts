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
  { id: "unifiedOptionsScanner", handlerKey: "unifiedOptionsScanner", name: "Unified Options Scanner", description: "Runs Option, Covered Call, Protective Put, and Straddle/Strangle scanners in one job", supportsPortfolio: false, supportsAccount: true, order: 4, enabled: true },
  { id: "deliverAlerts", handlerKey: "deliverAlerts", name: "Deliver Alerts", description: "Sends pending alerts to Slack/X per AlertConfig", supportsPortfolio: true, supportsAccount: true, order: 5, enabled: true },
];

const REMOVED_IDS = ["daily-analysis", "straddleStrangleScanner", "OptionScanner", "coveredCallScanner", "protectivePutScanner"];

export async function ensureDefaultReportTypes(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  const coll = db.collection("reportTypes");
  const now = new Date().toISOString();

  if (REMOVED_IDS.length > 0) {
    await coll.deleteMany({ id: { $in: REMOVED_IDS } });
    const jobsColl = db.collection("reportJobs");
    await jobsColl.deleteMany({ jobType: { $in: REMOVED_IDS } });
  }

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
