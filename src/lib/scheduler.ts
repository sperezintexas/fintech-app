import Agenda, { Job as AgendaJob } from "agenda";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "./mongodb";
import type { WatchlistItem, WatchlistAlert, RiskLevel, AlertDeliveryChannel, Job, OptionScannerConfig } from "@/types/portfolio";
import { getReportTemplate } from "@/types/portfolio";
import { analyzeWatchlistItem, MarketData } from "./watchlist-rules";
import { getMultipleTickerOHLC, getBatchPriceAndRSI } from "./yahoo";
import { postToXThread } from "./x";
import { scanOptions, storeOptionRecommendations } from "./option-scanner";
import { analyzeCoveredCalls, storeCoveredCallRecommendations } from "./covered-call-analyzer";
import { analyzeProtectivePuts, storeProtectivePutRecommendations } from "./protective-put-analyzer";
import { analyzeStraddlesAndStrangles, storeStraddleStrangleRecommendations } from "./straddle-strangle-analyzer";
import { processAlertDelivery } from "./alert-delivery";
import { shouldRunPurge, runPurge } from "./cleanup-storage";

// Removed - using Yahoo Finance
// Removed - using Yahoo Finance

// Singleton agenda instance
let agenda: Agenda | null = null;

export async function getAgenda(): Promise<Agenda> {
  if (agenda) return agenda;

  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  const dbName = process.env.MONGODB_DB || "myinvestments";

  agenda = new Agenda({
    db: {
      address: `${mongoUri}/${dbName}`,
      collection: "scheduledJobs",
    },
    processEvery: "1 minute",
    maxConcurrency: 1,
  });

  // Define job handlers
  defineJobs(agenda);

  // Start the agenda
  await agenda.start();

  console.log("Agenda scheduler started");

  return agenda;
}

// Define all scheduled job types
function defineJobs(agenda: Agenda) {
  // Daily watchlist analysis job
  agenda.define("daily-analysis", async (job: AgendaJob) => {
    console.log("Running daily watchlist analysis...", new Date().toISOString());

    const data = job.attrs.data as { accountId?: string } | undefined;
    const accountId = data?.accountId;

    try {
      const result = await runWatchlistAnalysis(accountId);
      console.log("Daily analysis complete:", result);

      // Store result in job data for history
      job.attrs.data = {
        ...job.attrs.data,
        lastRun: new Date().toISOString(),
        result,
      };
      await job.save();
    } catch (error) {
      console.error("Daily analysis failed:", error);
      throw error; // Let Agenda handle retry
    }
  });

  // Cleanup old alerts job
  agenda.define("cleanup-alerts", async (_job: AgendaJob) => {
    console.log("Running alert cleanup...", new Date().toISOString());

    try {
      const db = await getDb();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await db.collection("alerts").deleteMany({
        acknowledged: true,
        acknowledgedAt: { $lt: thirtyDaysAgo.toISOString() },
      });

      console.log(`Cleaned up ${result.deletedCount} old alerts`);
    } catch (error) {
      console.error("Alert cleanup failed:", error);
      throw error;
    }
  });

  // Option Scanner job - evaluates options positions, generates HOLD/BTC recommendations
  agenda.define("OptionScanner", async (job: AgendaJob) => {
    console.log("Running Option Scanner...", new Date().toISOString());

    const data = job.attrs.data as { accountId?: string; config?: OptionScannerConfig } | undefined;
    const accountId = data?.accountId;
    const config = data?.config;

    try {
      const recommendations = await scanOptions(accountId, config);
      const { stored, alertsCreated } = await storeOptionRecommendations(recommendations, {
        createAlerts: true,
      });

      job.attrs.data = {
        ...job.attrs.data,
        lastRun: new Date().toISOString(),
        result: { scanned: recommendations.length, stored, alertsCreated },
      };
      await job.save();

      console.log(`Option Scanner complete: ${recommendations.length} scanned, ${stored} stored, ${alertsCreated} alerts`);
    } catch (error) {
      console.error("Option Scanner failed:", error);
      throw error;
    }
  });

  // Covered Call Scanner job - evaluates covered call positions and opportunities
  agenda.define("coveredCallScanner", async (job: AgendaJob) => {
    console.log("Running Covered Call Scanner...", new Date().toISOString());

    const data = job.attrs.data as { accountId?: string } | undefined;
    const accountId = data?.accountId;

    try {
      const recommendations = await analyzeCoveredCalls(accountId);
      const { stored, alertsCreated } = await storeCoveredCallRecommendations(recommendations, {
        createAlerts: true,
      });

      job.attrs.data = {
        ...job.attrs.data,
        lastRun: new Date().toISOString(),
        result: { analyzed: recommendations.length, stored, alertsCreated },
      };
      await job.save();

      console.log(
        `Covered Call Scanner complete: ${recommendations.length} analyzed, ${stored} stored, ${alertsCreated} alerts`
      );
    } catch (error) {
      console.error("Covered Call Scanner failed:", error);
      throw error;
    }
  });

  // Deliver Alerts job - sends pending alerts to Slack/X per AlertConfig
  agenda.define("deliverAlerts", async (job: AgendaJob) => {
    console.log("Running Alert Delivery...", new Date().toISOString());

    const data = job.attrs.data as { accountId?: string } | undefined;
    const accountId = data?.accountId;

    try {
      const result = await processAlertDelivery(accountId);

      job.attrs.data = {
        ...job.attrs.data,
        lastRun: new Date().toISOString(),
        result,
      };
      await job.save();

      console.log(
        `Alert Delivery complete: ${result.processed} processed, ${result.delivered} delivered, ${result.failed} failed, ${result.skipped} skipped`
      );
    } catch (error) {
      console.error("Alert Delivery failed:", error);
      throw error;
    }
  });

  // Straddle/Strangle Scanner job - evaluates long straddle and strangle positions
  agenda.define("straddleStrangleScanner", async (job: AgendaJob) => {
    console.log("Running Straddle/Strangle Scanner...", new Date().toISOString());

    const data = job.attrs.data as { accountId?: string } | undefined;
    const accountId = data?.accountId;

    try {
      const recommendations = await analyzeStraddlesAndStrangles(accountId);
      const { stored, alertsCreated } = await storeStraddleStrangleRecommendations(recommendations, {
        createAlerts: true,
      });

      job.attrs.data = {
        ...job.attrs.data,
        lastRun: new Date().toISOString(),
        result: { analyzed: recommendations.length, stored, alertsCreated },
      };
      await job.save();

      console.log(
        `Straddle/Strangle Scanner complete: ${recommendations.length} analyzed, ${stored} stored, ${alertsCreated} alerts`
      );
    } catch (error) {
      console.error("Straddle/Strangle Scanner failed:", error);
      throw error;
    }
  });

  // Protective Put Scanner job - evaluates protective put positions and opportunities
  agenda.define("protectivePutScanner", async (job: AgendaJob) => {
    console.log("Running Protective Put Scanner...", new Date().toISOString());

    const data = job.attrs.data as { accountId?: string } | undefined;
    const accountId = data?.accountId;

    try {
      const recommendations = await analyzeProtectivePuts(accountId);
      const { stored, alertsCreated } = await storeProtectivePutRecommendations(recommendations, {
        createAlerts: true,
      });

      job.attrs.data = {
        ...job.attrs.data,
        lastRun: new Date().toISOString(),
        result: { analyzed: recommendations.length, stored, alertsCreated },
      };
      await job.save();

      console.log(
        `Protective Put Scanner complete: ${recommendations.length} analyzed, ${stored} stored, ${alertsCreated} alerts`
      );
    } catch (error) {
      console.error("Protective Put Scanner failed:", error);
      throw error;
    }
  });

  // Scheduled report job (user-configured)
  agenda.define("scheduled-report", async (job: AgendaJob) => {
    const data = job.attrs.data as { jobId?: string } | undefined;
    const jobId = data?.jobId;
    if (!jobId) return;
    await executeJob(jobId);
  });
}

/** Build concise per-item watchlist block (stocks + options) for Slack. */
async function buildWatchlistConciseBlock(
  accountId: string
): Promise<{ stocksBlock: string; optionsBlock: string }> {
  const db = await getDb();
  const rawItems = (await db
    .collection("watchlist")
    .find({ accountId })
    .toArray()) as (WatchlistItem & { _id: ObjectId })[];
  const seenStocks = new Set<string>();
  const seenOptions = new Set<string>();
  const stocks = rawItems
    .filter((i) => i.type === "stock")
    .filter((i) => {
      const key = (i.underlyingSymbol || i.symbol).toUpperCase();
      if (seenStocks.has(key)) return false;
      seenStocks.add(key);
      return true;
    });
  const options = rawItems
    .filter((i) => i.type === "covered-call" || i.type === "csp" || i.type === "call" || i.type === "put")
    .filter((i) => {
      const key = i.symbol;
      if (seenOptions.has(key)) return false;
      seenOptions.add(key);
      return true;
    });

  const underlyingSymbols = [
    ...stocks.map((s) => (s.underlyingSymbol || s.symbol).toUpperCase()),
    ...options.map((o) => (o.underlyingSymbol || o.symbol.replace(/\d+[CP]\d+$/, "")).toUpperCase()),
  ];
  const uniqueSymbols = Array.from(new Set(underlyingSymbols));
  const priceRsiMap = await getBatchPriceAndRSI(uniqueSymbols);

  const rsiSentiment = (rsi: number | null): string => {
    if (rsi == null) return "";
    if (rsi < 30) return "Oversold";
    if (rsi < 50) return "Bearish";
    if (rsi <= 70) return "Bullish📈";
    return "Overbought⚠️";
  };

  const rationale = (item: WatchlistItem & { _id: ObjectId }, rsi: number | null): string => {
    const isOption = ["covered-call", "csp", "call", "put"].includes(item.type);
    if (isOption) {
      if (item.type === "covered-call") return "Option: CC income";
      if (item.type === "csp" || item.type === "put") return "Option: CSP entry";
      return "Option: directional play";
    }
    if (rsi != null && rsi < 35) return "Stock: Buy dips";
    if (rsi != null && rsi > 65) return "Option: Consider CC for income";
    return "Stock: Buy & hold";
  };

  const formatLine = (item: WatchlistItem & { _id: ObjectId }, displaySymbol: string): string => {
    const underlying = (item.underlyingSymbol || item.symbol.replace(/\d+[CP]\d+$/, "")).toUpperCase();
    const data = priceRsiMap.get(underlying);
    if (!data) return `• $${displaySymbol}`;
    const emoji = data.changePercent >= 0 ? "🟢" : "🔴";
    const sign = data.changePercent >= 0 ? "+" : "";
    const rsiStr = data.rsi != null ? ` RSI:${data.rsi} ${rsiSentiment(data.rsi)}` : "";
    const rat = rationale(item, data.rsi);
    return `${emoji} $${displaySymbol}: $${data.price.toFixed(2)} (${sign}${data.changePercent.toFixed(1)}%)${rsiStr} ${rat}`;
  };

  const stocksBlock =
    stocks.length > 0
      ? stocks.map((s) => formatLine(s, s.symbol)).join("\n")
      : "_No stocks on watchlist_";
  const optionsBlock =
    options.length > 0
      ? options.map((o) => formatLine(o, o.symbol)).join("\n")
      : "No options";

  return { stocksBlock, optionsBlock };
}

/** Execute a job synchronously (used by Run Now and scheduled runs). Returns { success, error?, deliveredChannels?, failedChannels? }. */
export async function executeJob(jobId: string): Promise<{
  success: boolean;
  error?: string;
  deliveredChannels?: string[];
  failedChannels?: { channel: string; error: string }[];
}> {
  try {
    const db = await getDb();
    const job = (await db.collection("reportJobs").findOne({ _id: new ObjectId(jobId) })) as (Job & { _id: ObjectId }) | null;
    if (!job) return { success: false, error: "Job not found" };
    if (job.status !== "active") return { success: false, error: "Job is paused" };

    const deliveredChannels: string[] = [];
    const failedChannels: { channel: string; error: string }[] = [];

    // Resolve handler from job type
    const typeDoc = await db.collection("reportTypes").findOne({ id: job.jobType }) as { handlerKey?: string } | null;
    const handlerKey = typeDoc?.handlerKey ?? job.jobType;

    let title = job.name;
    let bodyText = "";
    let reportLink: string | null = null;
    let xTitle: string | null = null;
    let xBodyText: string | null = null;

    if (handlerKey === "smartxai") {
      try {
        const { POST: generateSmartXAI } = await import("@/app/api/reports/smartxai/route");
        const res = await generateSmartXAI({ json: async () => ({ accountId: job.accountId }) } as unknown as NextRequest);
        const payload = (await res.json()) as {
          success?: boolean;
          report?: { _id: string; title: string; summary: Record<string, unknown> };
        };

        if (payload.success && payload.report) {
          const accountDoc = job.accountId
            ? await db.collection("accounts").findOne({ _id: new ObjectId(job.accountId) })
            : null;
          const accountName = (accountDoc as { name?: string } | null)?.name ?? "Account";

          const reportTitle = payload.report.title;
          title = `${reportTitle} – ${job.name} – ${accountName}`;
          xTitle = `${reportTitle} – ${job.name}`;
          reportLink = `/reports/${payload.report._id}`;
          const summary = payload.report.summary as {
            totalPositions: number;
            totalValue: number;
            totalProfitLoss: number;
            totalProfitLossPercent: number;
            bullishCount: number;
            neutralCount: number;
            bearishCount: number;
          };
          const positions = (payload.report as { positions?: Array<{ symbol: string; underlyingSymbol: string; type: string; strategy: string; snapshot: { price: number; changePercent: number }; recommendation: string; recommendationReason: string }> }).positions ?? [];

          // Concise summary: 3 pos · $216K · +$103K (91%) · bullish 3
          const valK = (Number(summary.totalValue) / 1000).toFixed(1);
          const plK = (Number(summary.totalProfitLoss) / 1000).toFixed(1);
          const plSign = Number(summary.totalProfitLoss) >= 0 ? "+" : "";
          bodyText += `${summary.totalPositions} pos · $${valK}K · ${plSign}$${plK}K (${Number(summary.totalProfitLossPercent).toFixed(1)}%) · bullish ${summary.bullishCount} / neutral ${summary.neutralCount} / bearish ${summary.bearishCount}`;

          // Concise positions from report (no re-fetch): short format, no RSI
          if (positions.length > 0) {
            const formatPos = (p: { symbol: string; underlyingSymbol: string; type: string; strategy: string; snapshot: { price: number; changePercent: number } }): string => {
              const sign = p.snapshot.changePercent >= 0 ? "+" : "";
              const tag = p.type === "stock" ? "Stock" : p.strategy === "covered-call" ? "CC" : p.strategy === "cash-secured-put" ? "CSP" : "Opt";
              return `$${p.symbol} $${p.snapshot.price.toFixed(0)} (${sign}${p.snapshot.changePercent.toFixed(1)}%) ${tag}`;
            };
            const lines = positions.map(formatPos);
            bodyText += `\n\n${lines.join("\n")}`;
          }
        } else {
          bodyText += `Failed to generate SmartXAI report.`;
        }
      } catch (e) {
        console.error("Failed to generate SmartXAI report for scheduled job:", e);
        bodyText += `Failed to generate SmartXAI report.`;
      }
    } else if (handlerKey === "portfoliosummary") {
      try {
        const { POST: generatePortfolioSummary } = await import("@/app/api/reports/portfoliosummary/route");
        const res = await generatePortfolioSummary({ json: async () => ({ accountId: job.accountId }) } as unknown as NextRequest);
        const payload = (await res.json()) as {
          success?: boolean;
          report?: {
            _id: string;
            title: string;
            accounts: Array<{
              name: string;
              broker?: string;
              riskLevel: string;
              strategy: string;
              totalValue: number;
              dailyChange: number;
              dailyChangePercent: number;
              weekChange?: number;
              weekChangePercent?: number;
              positions: Array<{
                symbol: string;
                shares?: number;
                avgCost: number;
                currentPrice: number;
                dailyChange: number;
                dailyChangePercent: number;
                unrealizedPnL: number;
                unrealizedPnLPercent: number;
              }>;
              optionsActivity?: string;
              recommendation?: string;
            }>;
            marketSnapshot: {
              SPY: { price: number; change: number; changePercent: number };
              QQQ: { price: number; change: number; changePercent: number };
              VIX: { price: number; level: "low" | "moderate" | "elevated" };
              TSLA: { price: number; change: number; changePercent: number };
            };
            goalsProgress: {
              merrill: { target: number; targetDate: string; currentValue: number; progressPercent: number; cagrNeeded: number };
              fidelity: { targetDate: string; currentValue: number; trajectory: "strong" | "moderate" | "weak" };
            };
          };
        };

        if (payload.success && payload.report) {
          const r = payload.report;
          title = `📈 ${r.title}`;
          reportLink = `/reports/${payload.report._id}`;

          // Format report (no duplicate title - it's in Slack header)
          const lines: string[] = [];

          // Account summaries
          for (const acc of r.accounts) {
            const riskLabel = acc.riskLevel === "low" || acc.riskLevel === "medium" ? "Moderate" : "Aggressive";
            const strategyLabel = acc.strategy || "Core";
            const accountName = acc.broker || acc.name;
            lines.push(`${accountName} · ${riskLabel} · ${strategyLabel} · $${acc.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

            // Main position (TSLA if available, otherwise first position)
            const mainPos = acc.positions.find((p) => p.symbol === "TSLA") || acc.positions[0];
            if (mainPos) {
              const sign = mainPos.dailyChangePercent >= 0 ? "+" : "";
              const signUnreal = mainPos.unrealizedPnLPercent >= 0 ? "+" : "";
              lines.push(
                `• ${mainPos.symbol} Position:        ${mainPos.shares || 0} shares @ avg $${mainPos.avgCost.toFixed(2)} → current $${mainPos.currentPrice.toFixed(2)} (${sign}${mainPos.dailyChangePercent.toFixed(2)}% today / ${signUnreal}${mainPos.unrealizedPnLPercent.toFixed(2)}% unrealized)`
              );
            }

            const signDay = acc.dailyChangePercent >= 0 ? "+" : "";
            const signWeek = acc.weekChangePercent && acc.weekChangePercent >= 0 ? "+" : "";
            lines.push(
              `• Portfolio Change:     Today: ${signDay}$${acc.dailyChange.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${signDay}${acc.dailyChangePercent.toFixed(2)}%)    Week: ${signWeek}$${acc.weekChange?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"} (${signWeek}${acc.weekChangePercent?.toFixed(2) || "0.00"}%)`
            );

            // Key drivers (simplified - top movers)
            const topMovers = acc.positions
              .filter((p) => Math.abs(p.dailyChangePercent) > 0.5)
              .sort((a, b) => Math.abs(b.dailyChangePercent) - Math.abs(a.dailyChangePercent))
              .slice(0, 3);
            if (topMovers.length > 0) {
              const driverText = topMovers
                .map((p) => {
                  const sign = p.dailyChange >= 0 ? "+" : "";
                  return `${p.symbol} ${sign}$${p.currentPrice.toFixed(2)} today`;
                })
                .join(" | ");
              lines.push(`• Key Drivers:          ${driverText}`);
            }

            if (acc.optionsActivity) {
              lines.push(`• Options Activity:     ${acc.optionsActivity}`);
            }

            if (acc.recommendation) {
              lines.push(`• Recommendation:       ${acc.recommendation}`);
            }

            lines.push("");
          }

          // Market Snapshot 📊
          const m = r.marketSnapshot;
          const spyDir = m.SPY.changePercent >= 0 ? "🔼" : "🔻";
          const qqqDir = m.QQQ.changePercent >= 0 ? "🔼" : "🔻";
          const tslaDir = m.TSLA.changePercent >= 0 ? "🔼" : "🔻";
          const vixLabel =
            m.VIX.level === "low"
              ? "Low fear"
              : m.VIX.level === "moderate"
                ? "Moderate fear"
                : "Elevated fear";
          lines.push("Market Snapshot 📊");
          lines.push("");
          lines.push(`SPY: $${m.SPY.price.toFixed(2)} (${m.SPY.changePercent >= 0 ? "+" : ""}${m.SPY.changePercent.toFixed(2)}%) ${spyDir}`);
          lines.push(`QQQ: $${m.QQQ.price.toFixed(2)} (${m.QQQ.changePercent >= 0 ? "+" : ""}${m.QQQ.changePercent.toFixed(2)}%) ${qqqDir}`);
          lines.push(`VIX: ${m.VIX.price.toFixed(1)} (${vixLabel}) ⚠️`);
          lines.push(`TSLA: $${m.TSLA.price.toFixed(2)} (${m.TSLA.changePercent >= 0 ? "+" : ""}${m.TSLA.changePercent.toFixed(2)}%) ${tslaDir}`);
          lines.push("");

          // Goal Progress 🎯
          lines.push("Goal Progress 🎯");
          const g = r.goalsProgress;
          lines.push(
            `• Merrill → $${g.merrill.target.toLocaleString()} balanced by ${g.merrill.targetDate}: ~${g.merrill.progressPercent.toFixed(1)}% of way (assuming ${g.merrill.cagrNeeded.toFixed(0)}-${Math.ceil(g.merrill.cagrNeeded * 1.4)}% CAGR needed)`
          );
          lines.push(`• Fidelity → max growth by ${g.fidelity.targetDate}: current trajectory [${g.fidelity.trajectory}]`);
          lines.push("");

          // Risk Reminder
          lines.push(
            "Risk Reminder: Options involve substantial risk of loss and are not suitable for all investors. Review OCC booklet before trading."
          );

          bodyText = lines.join("\n");
        } else {
          bodyText += `Failed to generate PortfolioSummary report.`;
        }
      } catch (e) {
        console.error("Failed to generate PortfolioSummary report for scheduled job:", e);
        bodyText += `Failed to generate PortfolioSummary report.`;
      }
    } else if (handlerKey === "watchlistreport") {
      try {
        const accountId = job.accountId;
        if (!accountId) {
          bodyText = "Watchlist report: no account configured.";
          title = job.name;
        } else {
          const accountDoc = await db.collection("accounts").findOne({ _id: new ObjectId(accountId) });
          const accountName = (accountDoc as { name?: string } | null)?.name ?? "Account";
          const { stocksBlock, optionsBlock } = await buildWatchlistConciseBlock(accountId);

          const d = new Date();
          const dateStr = `${d.toISOString().slice(0, 10)} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
          const template = getReportTemplate(job.templateId ?? "concise");
          const slackTemplate =
            job.customSlackTemplate ?? template.slackTemplate;
          const xTemplate =
            job.customXTemplate ?? template.xTemplate;
          const body = slackTemplate
            .replace(/\{date\}/g, dateStr)
            .replace(/\{reportName\}/g, job.name)
            .replace(/\{account\}/g, accountName)
            .replace(/\{stocks\}/g, stocksBlock)
            .replace(/\{options\}/g, optionsBlock);
          xBodyText = xTemplate
            .replace(/\{date\}/g, dateStr)
            .replace(/\{reportName\}/g, job.name)
            .replace(/\{stocks\}/g, stocksBlock)
            .replace(/\{options\}/g, optionsBlock);
          title = job.name;
          bodyText = body;
        }
      } catch (e) {
        console.error("Failed to generate Watchlist report for scheduled job:", e);
        title = job.name;
        bodyText = `Failed to generate Watchlist report: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else if (handlerKey === "cleanup") {
      // Run cleanup job - check storage, purge if at 75% of limit or every 30 days
      try {
        const { shouldRun, reason, stats } = await shouldRunPurge();

        if (!shouldRun) {
          title = "Data Cleanup Skipped";
          bodyText = [
            `Cleanup skipped on ${new Date().toLocaleString()}`,
            "",
            reason,
            stats ? `Storage: ${stats.dataSizeMB.toFixed(2)} MB (${stats.percentOfLimit.toFixed(1)}% of limit)` : "",
          ]
            .filter(Boolean)
            .join("\n");
          console.log(`Cleanup skipped: ${reason}`);
        } else {
          const result = await runPurge();

          title = "Data Cleanup Complete";
          bodyText = [
            `Cleanup completed on ${new Date().toLocaleString()}`,
            `Trigger: ${reason}`,
            "",
            "Deleted records older than 30 days:",
            `• SmartXAI Reports: ${result.smartXAIReports}`,
            `• Portfolio Summary Reports: ${result.portfolioSummaryReports}`,
            `• Alerts: ${result.alerts}`,
            `• Scheduled Alerts: ${result.scheduledAlerts}`,
            "",
            `Total records deleted: ${result.totalDeleted}`,
            "",
            `Storage before: ${result.statsBefore.dataSizeMB.toFixed(2)} MB (${result.statsBefore.percentOfLimit.toFixed(1)}% of limit)`,
            result.statsAfter
              ? `Storage after: ${result.statsAfter.dataSizeMB.toFixed(2)} MB (${result.statsAfter.percentOfLimit.toFixed(1)}% of limit)`
              : "",
          ]
            .filter(Boolean)
            .join("\n");

          console.log(`Cleanup job completed: ${result.totalDeleted} records deleted. ${reason}`);
        }
      } catch (e) {
        console.error("Failed to run cleanup job:", e);
        title = "Data Cleanup Failed";
        bodyText = `Failed to run cleanup job: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else if (handlerKey === "daily-analysis") {
      try {
        const accountId = job.accountId ?? undefined;
        const result = await runWatchlistAnalysis(accountId);
        title = job.name;
        bodyText = [
          `Daily Analysis complete`,
          `• Analyzed: ${result.analyzed}`,
          `• Alerts created: ${result.alertsCreated}`,
          `• Errors: ${result.errors}`,
        ].join("\n");
      } catch (e) {
        console.error("Failed to run daily analysis:", e);
        title = job.name;
        bodyText = `Failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else if (handlerKey === "OptionScanner") {
      try {
        const accountId = job.accountId ?? undefined;
        const config = job.scannerConfig;
        const recommendations = await scanOptions(accountId, config);
        const { stored, alertsCreated } = await storeOptionRecommendations(recommendations, { createAlerts: true });
        title = job.name;
        bodyText = [
          `Option Scanner complete`,
          `• Scanned: ${recommendations.length}`,
          `• Stored: ${stored}`,
          `• Alerts created: ${alertsCreated}`,
        ].join("\n");
      } catch (e) {
        console.error("Failed to run Option Scanner:", e);
        title = job.name;
        bodyText = `Failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else if (handlerKey === "coveredCallScanner") {
      try {
        const accountId = job.accountId ?? undefined;
        const config = job.config;
        const recommendations = await analyzeCoveredCalls(accountId, config);
        const { stored, alertsCreated } = await storeCoveredCallRecommendations(recommendations, { createAlerts: true });
        title = job.name;
        const recLines =
          recommendations.length > 0
            ? recommendations.map(
                (r) =>
                  `• ${r.symbol} (${r.source}): ${r.recommendation} — ${r.reason}`
              )
            : ["• No covered call positions or watchlist calls to analyze."];
        bodyText = [
          `Covered Call Scanner complete`,
          `• Analyzed: ${recommendations.length}`,
          `• Stored: ${stored}`,
          `• Alerts created: ${alertsCreated}`,
          "",
          ...recLines,
        ].join("\n");
      } catch (e) {
        console.error("Failed to run Covered Call Scanner:", e);
        title = job.name;
        bodyText = `Failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else if (handlerKey === "straddleStrangleScanner") {
      try {
        const accountId = job.accountId ?? undefined;
        const recommendations = await analyzeStraddlesAndStrangles(accountId);
        const { stored, alertsCreated } = await storeStraddleStrangleRecommendations(recommendations, {
          createAlerts: true,
        });
        title = job.name;
        bodyText = [
          `Straddle/Strangle Scanner complete`,
          `• Analyzed: ${recommendations.length}`,
          `• Stored: ${stored}`,
          `• Alerts created: ${alertsCreated}`,
        ].join("\n");
      } catch (e) {
        console.error("Failed to run Straddle/Strangle Scanner:", e);
        title = job.name;
        bodyText = `Failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else if (handlerKey === "protectivePutScanner") {
      try {
        const accountId = job.accountId ?? undefined;
        const config = job.config;
        const recommendations = await analyzeProtectivePuts(accountId, config);
        const { stored, alertsCreated } = await storeProtectivePutRecommendations(recommendations, { createAlerts: true });
        title = job.name;
        bodyText = [
          `Protective Put Scanner complete`,
          `• Analyzed: ${recommendations.length}`,
          `• Stored: ${stored}`,
          `• Alerts created: ${alertsCreated}`,
        ].join("\n");
      } catch (e) {
        console.error("Failed to run Protective Put Scanner:", e);
        title = job.name;
        bodyText = `Failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else if (handlerKey === "deliverAlerts") {
      try {
        const accountId = job.accountId ?? undefined;
        const result = await processAlertDelivery(accountId);
        title = job.name;
        bodyText = [
          `Alert Delivery complete`,
          `• Processed: ${result.processed}`,
          `• Delivered: ${result.delivered}`,
          `• Failed: ${result.failed}`,
          `• Skipped: ${result.skipped}`,
        ].join("\n");
      } catch (e) {
        console.error("Failed to run Deliver Alerts:", e);
        title = job.name;
        bodyText = `Failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else {
      bodyText += `Unknown job type: ${job.jobType} (handler: ${handlerKey})`;
    }

    // Deliver (Slack only for now; push/twitter are placeholders)
    let prefs = await db.collection("alertPreferences").findOne({ accountId: job.accountId });
    if (!prefs && job.accountId === null) {
      const firstAcc = await db.collection("accounts").findOne({});
      if (firstAcc) {
        prefs = await db.collection("alertPreferences").findOne({ accountId: (firstAcc as { _id: ObjectId })._id.toString() });
      }
    }
    const slackConfig = (prefs?.channels || []).find((c: { channel: AlertDeliveryChannel; target: string }) => c.channel === "slack");
    const twitterConfig = (prefs?.channels || []).find((c: { channel: AlertDeliveryChannel; target: string }) => c.channel === "twitter");

    if (job.channels.includes("slack")) {
      if (!slackConfig?.target) {
        return { success: false, error: "Slack not configured. Go to Automation → Settings → Alert Settings and add a Slack webhook URL." };
      }
      try {
        const slackText =
          handlerKey === "watchlistreport"
            ? bodyText
            : `*${title}*\n${bodyText}${reportLink ? `\n\nView: ${reportLink}` : ""}`;
        const slackRes = await fetch(slackConfig.target, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: slackText }),
        });
        if (!slackRes.ok) {
          const errBody = await slackRes.text();
          return { success: false, error: `Slack webhook failed (${slackRes.status}): ${errBody.slice(0, 200)}` };
        }
        deliveredChannels.push("Slack");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("Failed to post report to Slack:", e);
        return { success: false, error: `Slack delivery failed: ${msg}` };
      }
    }

    if (job.channels.includes("twitter") && twitterConfig?.target) {
      try {
        const tweetTitle = xTitle ?? title;
        const tweetBody = xBodyText ?? bodyText;
        const fullText = `${tweetTitle}\n\n${tweetBody}${reportLink ? `\n\n${reportLink}` : ""}`;
        await postToXThread(fullText);
        deliveredChannels.push("X");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("Failed to post report to X:", msg);
        failedChannels.push({ channel: "X", error: msg });
      }
    }

    if (job.channels.includes("push")) {
      console.log("Push delivery selected but not implemented server-side yet.");
    }

    await db.collection("reportJobs").updateOne(
      { _id: new ObjectId(jobId) },
      { $set: { lastRunAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }
    );
    return { success: true, deliveredChannels, failedChannels: failedChannels.length ? failedChannels : undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("executeJob failed:", e);
    return { success: false, error: msg };
  }
}

// Estimate option price based on underlying movement
function estimateOptionPrice(
  entryPremium: number,
  underlyingChange: number,
  isCall: boolean,
  _daysToExpiration: number
): { bid: number; ask: number; mid: number } {
  // Simple estimation based on delta approximation
  const delta = isCall ? 0.5 : -0.5;
  const premiumChange = underlyingChange * delta * 0.01;
  const newPremium = Math.max(0.01, entryPremium * (1 + premiumChange));

  return {
    bid: newPremium * 0.95,
    ask: newPremium * 1.05,
    mid: newPremium,
  };
}

// Main analysis function
async function runWatchlistAnalysis(accountId?: string): Promise<{
  analyzed: number;
  alertsCreated: number;
  errors: number;
}> {
  const db = await getDb();

  // Fetch all watchlist items (or filtered by account)
  const query = accountId ? { accountId } : {};
  const watchlistItems = await db
    .collection<WatchlistItem>("watchlist")
    .find(query)
    .toArray();

  if (watchlistItems.length === 0) {
    return { analyzed: 0, alertsCreated: 0, errors: 0 };
  }

  // Fetch market data using Yahoo Finance (batch call)
  const symbols = watchlistItems.map((item) => {
    const underlying = item.underlyingSymbol || item.symbol.replace(/\d+[CP]\d+$/, "");
    return underlying.toUpperCase();
  });
  const uniqueSymbols = Array.from(new Set(symbols));
  const marketDataOHLC = await getMultipleTickerOHLC(uniqueSymbols);

  // Convert to format expected by existing code
  const marketData = new Map<string, { close: number; open: number }>();
  marketDataOHLC.forEach((ohlc, ticker) => {
    marketData.set(ticker, {
      close: ohlc.close,
      open: ohlc.open,
    });
  });

  // Get account risk levels
  const accountIds = [...new Set(watchlistItems.map((item) => item.accountId))];
  const accounts = await db
    .collection("accounts")
    .find({ _id: { $in: accountIds.map((id) => new ObjectId(id)) } })
    .toArray();

  const accountRiskMap = new Map<string, RiskLevel>();
  accounts.forEach((acc) => {
    accountRiskMap.set(acc._id.toString(), acc.riskLevel || "medium");
  });

  let analyzed = 0;
  let alertsCreated = 0;
  let errors = 0;

  for (const item of watchlistItems) {
    try {
      // Get market data for underlying
      const underlying = item.underlyingSymbol || item.symbol.replace(/\d+[CP]\d+$/, "");
      const priceData = marketData.get(underlying.toUpperCase());

      if (!priceData) {
        console.log(`No market data for ${underlying}, skipping ${item.symbol}`);
        continue;
      }

      // Calculate current values
      const currentPrice = priceData.close;
      const priceChange = currentPrice - item.entryPrice;
      const priceChangePercent = (priceChange / item.entryPrice) * 100;

      // Build market data for analysis
      const analysisMarketData: MarketData = {
        currentPrice,
        previousClose: priceData.open,
        change: priceChange,
        changePercent: priceChangePercent,
      };

      // Add option pricing if applicable
      if (item.entryPremium && item.type !== "stock") {
        const isCall = item.type === "call" || item.type === "covered-call";
        let dte = 30;
        if (item.expirationDate) {
          const expDate = new Date(item.expirationDate);
          dte = Math.max(1, Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
        }
        const optionPrices = estimateOptionPrice(item.entryPremium, priceChangePercent, isCall, dte);
        analysisMarketData.optionBid = optionPrices.bid;
        analysisMarketData.optionAsk = optionPrices.ask;
        analysisMarketData.optionMid = optionPrices.mid;
      }

      // Get risk level for this account (default to medium for portfolio-level items)
      const riskLevel = item.accountId ? (accountRiskMap.get(item.accountId) || "medium") : "medium";

      // Run analysis
      const analysis = analyzeWatchlistItem(item, riskLevel, analysisMarketData);

      // Update watchlist item with current data
      await db.collection("watchlist").updateOne(
        { _id: new ObjectId(item._id) },
        {
          $set: {
            currentPrice,
            currentPremium: analysisMarketData.optionMid,
            profitLoss: priceChange * item.quantity * (item.type === "stock" ? 1 : 100),
            profitLossPercent: priceChangePercent,
            updatedAt: new Date().toISOString(),
          },
        }
      );

      analyzed++;

      // Create alert if significant (not just info/HOLD)
      if (analysis.severity !== "info" || analysis.recommendation !== "HOLD") {
        // Check for duplicate recent alert
        const recentAlert = await db.collection("alerts").findOne({
          watchlistItemId: item._id.toString(),
          recommendation: analysis.recommendation,
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
        });

        if (!recentAlert) {
          const alert: Omit<WatchlistAlert, "_id"> & { type?: string } = {
            watchlistItemId: item._id.toString(),
            accountId: item.accountId,
            symbol: item.symbol,
            recommendation: analysis.recommendation,
            severity: analysis.severity,
            reason: analysis.reason,
            details: analysis.details,
            riskWarning: analysis.riskWarning,
            suggestedActions: analysis.suggestedActions,
            createdAt: new Date().toISOString(),
            acknowledged: false,
            type: "daily-analysis",
          };

          await db.collection("alerts").insertOne(alert);
          alertsCreated++;
        }
      }
    } catch (error) {
      console.error(`Error analyzing ${item.symbol}:`, error);
      errors++;
    }
  }

  return { analyzed, alertsCreated, errors };
}

// Schedule management functions
export async function scheduleJob(
  jobName: string,
  schedule: string,
  data?: Record<string, unknown>
): Promise<void> {
  const ag = await getAgenda();

  // Cancel existing job with same name
  await ag.cancel({ name: jobName });

  // Schedule new job
  await ag.every(schedule, jobName, data || {});

  console.log(`Scheduled job "${jobName}" with schedule "${schedule}"`);
}

export async function runJobNow(
  jobName: string,
  data?: Record<string, unknown>
): Promise<void> {
  const ag = await getAgenda();
  await ag.now(jobName, data || {});
  console.log(`Triggered job "${jobName}" to run now`);
}

export async function getJobStatus(): Promise<{
  jobs: Array<{
    id: string;
    name: string;
    lastRunAt: Date | null;
    nextRunAt: Date | null;
    lastFinishedAt: Date | null;
    failCount: number;
    data: unknown;
  }>;
}> {
  const ag = await getAgenda();
  const jobs = await ag.jobs({});

  // Deduplicate by name - keep the most recent/active one
  const jobsByName = new Map<string, typeof jobs[0]>();

  for (const job of jobs) {
    const name = job.attrs.name;
    const existing = jobsByName.get(name);

    // Keep the one with nextRunAt (scheduled), or most recent lastRunAt
    if (!existing ||
        (job.attrs.nextRunAt && !existing.attrs.nextRunAt) ||
        (job.attrs.lastRunAt && (!existing.attrs.lastRunAt || job.attrs.lastRunAt > existing.attrs.lastRunAt))) {
      jobsByName.set(name, job);
    }
  }

  return {
    jobs: Array.from(jobsByName.values()).map((job) => ({
      id: job.attrs._id?.toString() || `${job.attrs.name}-${Date.now()}`,
      name: job.attrs.name,
      lastRunAt: job.attrs.lastRunAt || null,
      nextRunAt: job.attrs.nextRunAt || null,
      lastFinishedAt: job.attrs.lastFinishedAt || null,
      failCount: job.attrs.failCount || 0,
      data: job.attrs.data,
    })),
  };
}

export async function cancelJob(jobName: string): Promise<number> {
  const ag = await getAgenda();
  const result = await ag.cancel({ name: jobName });
  console.log(`Cancelled ${result} job(s) with name "${jobName}"`);
  return result ?? 0;
}

// Graceful shutdown
export async function stopScheduler(): Promise<void> {
  if (agenda) {
    await agenda.stop();
    console.log("Agenda scheduler stopped");
  }
}
