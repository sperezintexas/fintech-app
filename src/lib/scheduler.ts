import Agenda, { Job as AgendaJob } from "agenda";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getDb, getMongoUri, getMongoDbName } from "./mongodb";
import type { WatchlistItem, WatchlistAlert, RiskLevel, AlertDeliveryChannel, Job } from "@/types/portfolio";
import { getReportTemplate } from "@/types/portfolio";
import { analyzeWatchlistItem, MarketData } from "./watchlist-rules";
import { getMultipleTickerOHLC, getBatchPriceAndRSI } from "./yahoo";
import { postToXThread } from "./x";
import { runUnifiedOptionsScanner } from "./unified-options-scanner";
import { processAlertDelivery } from "./alert-delivery";
import { formatUnifiedOptionsScannerReport, formatUnifiedOptionsScannerRunNotes, type SlackBlock } from "./slack-templates";
import { shouldRunPurge, runPurge } from "./cleanup-storage";
import { runRiskScanner } from "./risk-scanner";
import { getHeldSymbols } from "./holdings";
import {
  refreshHoldingsPricesStock,
  refreshHoldingsPricesOptions,
  isMarketHours as getIsMarketHours,
} from "./holdings-price-cache";

// Removed - using Yahoo Finance
// Removed - using Yahoo Finance

/** Backoff delays in ms: 1 min, 2 min, 4 min (exponential). */
const RETRY_BACKOFF_MS = [60_000, 120_000, 240_000];
const MAX_ATTEMPTS = 3;

/** Classify as transient (retry) vs permanent (no retry). */
export function isTransientError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (lower.includes("timeout") || lower.includes("etimedout") || lower.includes("econnreset") || lower.includes("econnrefused")) return true;
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("enotfound")) return true;
  if (/\b5\d{2}\b/.test(msg) || lower.includes("503") || lower.includes("502") || lower.includes("504")) return true;
  if (/\b4\d{2}\b/.test(msg) || lower.includes("401") || lower.includes("403") || lower.includes("validation") || lower.includes("auth")) return false;
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run fn with retries on transient errors. Backoff: 1 min, 2 min, 4 min.
 * On permanent error or after max attempts, throws (caller should save lastError and not rethrow to avoid reschedule).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; backoffMs?: number[]; jobName?: string } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const backoffMs = options.backoffMs ?? RETRY_BACKOFF_MS;
  const jobName = options.jobName ?? "job";
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt === maxAttempts || !isTransientError(e)) throw e;
      const delay = backoffMs[Math.min(attempt - 1, backoffMs.length - 1)] ?? backoffMs[backoffMs.length - 1];
      console.warn(`[scheduler] ${jobName} attempt ${attempt}/${maxAttempts} failed (transient), retrying in ${delay / 1000}s:`, e instanceof Error ? e.message : e);
      await sleep(delay);
    }
  }
  throw lastError;
}

// Singleton agenda instance
let agenda: Agenda | null = null;

export async function getAgenda(): Promise<Agenda> {
  if (agenda) return agenda;

  const mongoUri = getMongoUri();
  const dbName = getMongoDbName();

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
  // Deliver Alerts job - sends pending alerts to Slack/X per AlertConfig (with retry on transient errors)
  agenda.define("deliverAlerts", async (job: AgendaJob) => {
    console.log("Running Alert Delivery...", new Date().toISOString());

    const data = job.attrs.data as { accountId?: string } | undefined;
    const accountId = data?.accountId;

    try {
      const result = await withRetry(
        () => processAlertDelivery(accountId),
        { jobName: "deliverAlerts" }
      );

      job.attrs.data = {
        ...job.attrs.data,
        lastRun: new Date().toISOString(),
        lastError: undefined,
        result,
      };
      await job.save();

      console.log(
        `Alert Delivery complete: ${result.processed} processed, ${result.delivered} delivered, ${result.failed} failed, ${result.skipped} skipped`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Alert Delivery failed:", error);
      job.attrs.data = {
        ...job.attrs.data,
        lastRun: new Date().toISOString(),
        lastError: msg,
      };
      await job.save();
      // Do not rethrow: job completes so Agenda does not reschedule; lastError is stored.
    }
  });

  // Unified Options Scanner job - runs all 4 scanners (Option, CoveredCall, ProtectivePut, StraddleStrangle) with retry on transient errors
  agenda.define("unifiedOptionsScanner", async (job: AgendaJob) => {
    console.log("Running Unified Options Scanner...", new Date().toISOString());

    const data = job.attrs.data as { accountId?: string; config?: Record<string, unknown> } | undefined;
    const accountId = data?.accountId;
    let config = data?.config as import("./unified-options-scanner").UnifiedOptionsScannerConfig | undefined;

    // Merge Strategy Settings: excludeWatchlist (default true) -> coveredCall.includeWatchlist = false
    if (accountId) {
      const db = await getDb();
      const strategySettings = await db
        .collection<{ accountId: string; excludeWatchlist?: boolean }>("strategySettings")
        .findOne({ accountId });
      const excludeWatchlist = strategySettings?.excludeWatchlist !== false;
      config = {
        ...config,
        coveredCall: { ...config?.coveredCall, includeWatchlist: !excludeWatchlist },
      };
    } else {
      config = { ...config, coveredCall: { ...config?.coveredCall, includeWatchlist: false } };
    }

    try {
      const result = await withRetry(
        () => runUnifiedOptionsScanner(accountId, config),
        { jobName: "unifiedOptionsScanner" }
      );

      job.attrs.data = {
        ...job.attrs.data,
        lastRun: new Date().toISOString(),
        lastError: undefined,
        result,
      };
      await job.save();

      if (result.errors.length > 0) {
        console.warn(
          `Unified Options Scanner completed with errors: ${result.errors.map((e) => `${e.scanner}: ${e.message}`).join("; ")}`
        );
      }
      console.log(
        `Unified Options Scanner complete: ${result.totalScanned} total, ${result.totalStored} stored, ${result.totalAlertsCreated} alerts`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Unified Options Scanner failed:", error);
      job.attrs.data = {
        ...job.attrs.data,
        lastRun: new Date().toISOString(),
        lastError: msg,
      };
      await job.save();
      // Do not rethrow: job completes so Agenda does not reschedule; lastError is stored.
    }
  });

  // Watchlist report (ad-hoc run via runJobNow; also used by report jobs via scheduled-report)
  agenda.define("watchlistreport", async (job: AgendaJob) => {
    const data = job.attrs.data as { accountId?: string } | undefined;
    const accountId = data?.accountId ?? null;
    const db = await getDb();
    const tempJob = {
      _id: new ObjectId(),
      accountId,
      name: "Watchlist Report (Run Now)",
      jobType: "watchlistreport",
      templateId: "concise" as const,
      channels: ["slack"],
      status: "active" as const,
    };
    await db.collection("reportJobs").insertOne(tempJob);
    try {
      await executeJob(tempJob._id.toString());
    } finally {
      await db.collection("reportJobs").deleteOne({ _id: tempJob._id });
    }
  });

  // Holdings price cache refresh (Phase 1: stocks). Runs every 15 min; during market hours always runs, outside market runs at most every 1 hr.
  agenda.define("refreshHoldingsPrices", async (job: AgendaJob) => {
    const data = job.attrs.data as { lastRun?: string } | undefined;
    const lastRun = data?.lastRun ? new Date(data.lastRun).getTime() : 0;
    const now = Date.now();
    const oneHourMs = 60 * 60 * 1000;
    const isMarketHours = getIsMarketHours();

    if (!isMarketHours && lastRun > 0 && now - lastRun < oneHourMs) {
      return;
    }

    try {
      const stockResult = await refreshHoldingsPricesStock();
      const optionsResult = await refreshHoldingsPricesOptions();
      const result = { stock: stockResult, options: optionsResult };
      job.attrs.data = {
        ...job.attrs.data,
        lastRun: new Date().toISOString(),
        lastError: undefined,
        result,
      };
      await job.save();
      console.log(
        `[refreshHoldingsPrices] stocks: ${stockResult.symbolsUpdated}/${stockResult.symbolsRequested}; options: ${optionsResult.optionsUpdated}/${optionsResult.optionsRequested}`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[refreshHoldingsPrices] failed:", error);
      job.attrs.data = {
        ...job.attrs.data,
        lastRun: new Date().toISOString(),
        lastError: msg,
      };
      await job.save();
    }
  });

  // Scheduled report job (user-configured) with retry on transient errors
  agenda.define("scheduled-report", async (job: AgendaJob) => {
    const data = job.attrs.data as { jobId?: string } | undefined;
    const jobId = data?.jobId;
    if (!jobId) return;
    try {
      await withRetry(
        () => executeJob(jobId),
        { jobName: "scheduled-report" }
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("scheduled-report failed:", error);
      job.attrs.data = {
        ...job.attrs.data,
        lastRun: new Date().toISOString(),
        lastError: msg,
      };
      await job.save();
      // Do not rethrow so Agenda does not reschedule; lastError is stored.
    }
  });
}

/** Build concise block from watchlist items (shared core). */
async function buildWatchlistConciseBlockFromItems(
  rawItems: (WatchlistItem & { _id: ObjectId })[]
): Promise<{ stocksBlock: string; optionsBlock: string; itemCount: number }> {
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
    const rsiStr = data.rsi != null ? ` RSI:${Math.round(data.rsi)} ${rsiSentiment(data.rsi)}` : "";
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

  return { stocksBlock, optionsBlock, itemCount: rawItems.length };
}

/** Build concise per-item watchlist block by accountId (account-level). */
async function _buildWatchlistConciseBlock(accountId: string): Promise<{ stocksBlock: string; optionsBlock: string }> {
  const db = await getDb();
  const rawItems = (await db
    .collection("watchlist")
    .find({ accountId })
    .toArray()) as (WatchlistItem & { _id: ObjectId })[];
  const { stocksBlock, optionsBlock } = await buildWatchlistConciseBlockFromItems(rawItems);
  return { stocksBlock, optionsBlock };
}

/** Build concise per-item watchlist block by watchlistId (portfolio-level, one per watchlist). */
async function buildWatchlistConciseBlockForWatchlist(
  watchlistId: string,
  _watchlistName: string
): Promise<{ stocksBlock: string; optionsBlock: string; itemCount: number }> {
  const db = await getDb();
  const defaultWatchlist = await db.collection("watchlists").findOne({ name: "Default" });
  const isDefault = defaultWatchlist && watchlistId === defaultWatchlist._id.toString();
  const watchlistIdObj = ObjectId.isValid(watchlistId) ? new ObjectId(watchlistId) : null;
  const query = isDefault
    ? {
        $or: [
          { watchlistId },
          ...(watchlistIdObj ? [{ watchlistId: watchlistIdObj }] : []),
          { watchlistId: { $exists: false } },
          { watchlistId: "" },
        ],
      }
    : watchlistIdObj
      ? { $or: [{ watchlistId }, { watchlistId: watchlistIdObj }] }
      : { watchlistId };
  const rawItems = (await db
    .collection("watchlist")
    .find(query)
    .toArray()) as (WatchlistItem & { _id: ObjectId })[];
  return buildWatchlistConciseBlockFromItems(rawItems);
}

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function setJobLastRunError(
  db: Awaited<ReturnType<typeof getDb>>,
  jobId: string,
  error: string
): Promise<void> {
  await db.collection("reportJobs").updateOne(
    { _id: new ObjectId(jobId) },
    {
      $set: {
        lastRunAt: new Date().toISOString(),
        lastRunError: error,
        updatedAt: new Date().toISOString(),
      },
    }
  );
}

/** Execute a job synchronously (used by Run Now and scheduled runs). Returns { success, error?, deliveredChannels?, failedChannels?, summary? }. */
export async function executeJob(jobId: string): Promise<{
  success: boolean;
  error?: string;
  deliveredChannels?: string[];
  failedChannels?: { channel: string; error: string }[];
  summary?: string;
}> {
  const db = await getDb();
  try {
    const job = (await db.collection("reportJobs").findOne({ _id: new ObjectId(jobId) })) as (Job & { _id: ObjectId }) | null;
    if (!job) return { success: false, error: "Job not found" };
    if (job.status !== "active") {
      await setJobLastRunError(db, jobId, "Job is paused");
      return { success: false, error: "Job is paused" };
    }

    const deliveredChannels: string[] = [];
    const failedChannels: { channel: string; error: string }[] = [];

    // Resolve handler from job type
    const typeDoc = await db.collection("reportTypes").findOne({ id: job.jobType }) as { handlerKey?: string } | null;
    const handlerKey = typeDoc?.handlerKey ?? job.jobType;

    let title = job.name;
    let bodyText = "";
    let reportLink: string | null = null;
    let xTitle: string | null = null;
    const xBodyText: string | null = null;
    /** One post per watchlist when portfolio-level watchlistreport */
    let watchlistPosts: Array<{ title: string; bodyText: string; xBodyText?: string }> | null = null;
    /** Optional Slack attachments (legacy format). */
    let slackAttachmentsForPost: Array<{ color: string; text: string }> | undefined;
    /** Optional Slack Block Kit blocks (preferred for unified scanner). */
    let slackBlocksForPost: SlackBlock[] | undefined;
    /** Notes for job run history (e.g. unified scanner stats + breakdown). */
    let lastRunNotesForJob: string | undefined;

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

          // Optional: include AI insights (SmartXAI sentiment) when config.includeAiInsights is true
          const includeAiInsights = (job.config as { includeAiInsights?: boolean } | undefined)?.includeAiInsights;
          if (includeAiInsights) {
            try {
              const { POST: generateSmartXAI } = await import("@/app/api/reports/smartxai/route");
              const smartRes = await generateSmartXAI({ json: async () => ({ accountId: job.accountId }) } as unknown as NextRequest);
              const smartPayload = (await smartRes.json()) as {
                success?: boolean;
                report?: { summary?: { bullishCount?: number; neutralCount?: number; bearishCount?: number } };
              };
              if (smartPayload.success && smartPayload.report?.summary) {
                const s = smartPayload.report.summary;
                lines.push("");
                lines.push(
                  `AI Insights: bullish ${s.bullishCount ?? 0} / neutral ${s.neutralCount ?? 0} / bearish ${s.bearishCount ?? 0}`
                );
              }
            } catch (e) {
              console.error("Failed to add AI insights to portfolio summary:", e);
            }
          }

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
        const d = new Date();
        const dateStr = `${d.toISOString().slice(0, 10)} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
        const template = getReportTemplate(job.templateId ?? "concise");
        const slackTemplate = job.customSlackTemplate ?? template.slackTemplate;
        const xTemplate = job.customXTemplate ?? template.xTemplate;

        // Watchlist items use watchlistId (not accountId). Always use one post per watchlist.
        const analysisResult = await runWatchlistAnalysis(undefined);
        let watchlists = (await db.collection("watchlists").find({}).sort({ name: 1 }).toArray()) as Array<{ _id: ObjectId; name: string }>;

        // Ensure Default watchlist exists for legacy items (no watchlistId) - they only show in Default
        const hasDefault = watchlists.some((w) => w.name === "Default");
        const orphanedCount = await db.collection("watchlist").countDocuments({
          $or: [{ watchlistId: { $exists: false } }, { watchlistId: "" }],
        });
        if (!hasDefault && orphanedCount > 0) {
          const now = new Date().toISOString();
          const defaultWatchlist = {
            _id: new ObjectId(),
            name: "Default",
            purpose: "Legacy items (no watchlist assigned)",
            createdAt: now,
            updatedAt: now,
          };
          await db.collection("watchlists").insertOne(defaultWatchlist);
          watchlists = [defaultWatchlist, ...watchlists].sort((a, b) => a.name.localeCompare(b.name));
        }

        const posts: Array<{ title: string; bodyText: string; xBodyText?: string }> = [];
        for (const w of watchlists) {
            const watchlistId = w._id.toString();
            const { stocksBlock, optionsBlock: _optionsBlock, itemCount } = await buildWatchlistConciseBlockForWatchlist(watchlistId, w.name);
            if (itemCount === 0) continue;
            // Watchlist: stocks only (no options), RSI sentiment in both Slack and X
            const noOptions = "";
            const body = slackTemplate
              .replace(/\{date\}/g, dateStr)
              .replace(/\{reportName\}/g, job.name)
              .replace(/\{account\}/g, w.name)
              .replace(/\{stocks\}/g, stocksBlock)
              .replace(/\{options\}/g, noOptions);
            // X: only top 5 items per watchlist to reduce length and avoid rate limits
            const stocksLines = stocksBlock.split("\n").filter((l) => l.trim());
            const xStocksBlock =
              stocksLines.length > 5
                ? stocksLines.slice(0, 5).join("\n") + `\n… (${stocksLines.length - 5} more)`
                : stocksBlock;
            const xBody = xTemplate
              .replace(/\{date\}/g, dateStr)
              .replace(/\{reportName\}/g, job.name)
              .replace(/\{stocks\}/g, xStocksBlock)
              .replace(/\{options\}/g, noOptions);
            posts.push({ title: `${job.name} – ${w.name}`, bodyText: body, xBodyText: xBody });
        }
        if (posts.length > 0) {
          if (analysisResult.alertsCreated > 0) {
            const lastPost = posts[posts.length - 1];
            lastPost.bodyText += `\n\n📋 Alerts created: ${analysisResult.alertsCreated} (analyzed ${analysisResult.analyzed} items)`;
          }
          watchlistPosts = posts;
        } else {
          bodyText = "Watchlist report: no watchlists with items.";
          title = job.name;
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
    } else if (handlerKey === "unifiedOptionsScanner") {
      try {
        const startTime = Date.now();
        const accountId = job.accountId ?? undefined;
        let config = job.config as import("./unified-options-scanner").UnifiedOptionsScannerConfig | undefined;
        if (accountId) {
          const strategySettings = await db
            .collection<{ accountId: string; excludeWatchlist?: boolean }>("strategySettings")
            .findOne({ accountId });
          const excludeWatchlist = strategySettings?.excludeWatchlist !== false;
          config = {
            ...config,
            coveredCall: { ...config?.coveredCall, includeWatchlist: !excludeWatchlist },
          };
        } else {
          config = { ...config, coveredCall: { ...config?.coveredCall, includeWatchlist: false } };
        }
        const result = await runUnifiedOptionsScanner(accountId, config);
        title = job.name;

        let deliverySummary: { delivered: number; failed: number; skipped: number } | undefined;
        const configObj = job.config as { deliverAlertsAfter?: boolean } | undefined;
        if (configObj?.deliverAlertsAfter !== false) {
          try {
            deliverySummary = await processAlertDelivery(accountId);
          } catch (deliveryErr) {
            console.error("Inline alert delivery after unified scanner failed:", deliveryErr);
          }
        }
        const durationSeconds = (Date.now() - startTime) / 1000;
        const appBaseUrl =
          (typeof process !== "undefined" && (process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL)) || "";
        const report = formatUnifiedOptionsScannerReport(
          result,
          deliverySummary,
          durationSeconds,
          appBaseUrl
        );
        bodyText = report.bodyText;
        if (report.slackBlocks?.length) {
          slackBlocksForPost = report.slackBlocks;
        } else if (report.errorAttachment) {
          slackAttachmentsForPost = [{ color: "danger", text: report.errorAttachment }];
        }
        lastRunNotesForJob = formatUnifiedOptionsScannerRunNotes(result, durationSeconds);
      } catch (e) {
        console.error("Failed to run Unified Options Scanner:", e);
        title = job.name;
        bodyText = `Failed: ${toErrorMessage(e)}`;
      }
    } else if (handlerKey === "riskScanner") {
      try {
        const accountId = job.accountId ?? undefined;
        const result = await runRiskScanner(accountId);
        title = job.name;
        bodyText = [
          `Risk Scanner complete`,
          `• Risk level: ${result.riskLevel}`,
          `• Alerts created: ${result.alertsCreated}`,
          "",
          result.explanation || "",
        ].join("\n");
      } catch (e) {
        console.error("Failed to run Risk Scanner:", e);
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

    type PostItem = {
      title: string;
      bodyText: string;
      xBodyText?: string;
      slackAttachments?: Array<{ color: string; text: string }>;
      slackBlocks?: SlackBlock[];
    };
    const postsToSend: PostItem[] =
      watchlistPosts && watchlistPosts.length > 0
        ? watchlistPosts
        : [
            {
              title,
              bodyText,
              xBodyText: xBodyText ?? undefined,
              ...(slackAttachmentsForPost && { slackAttachments: slackAttachmentsForPost }),
              ...(slackBlocksForPost && { slackBlocks: slackBlocksForPost }),
            },
          ];

    if (job.channels.includes("slack")) {
      if (!slackConfig?.target) {
        const err = "Slack not configured. Go to Automation → Settings → Alert Settings and add a Slack webhook URL.";
        failedChannels.push({ channel: "Slack", error: err });
      } else {
      try {
        for (const p of postsToSend) {
          const slackText =
            handlerKey === "watchlistreport"
              ? p.bodyText
              : `*${p.title}*\n${p.bodyText}${reportLink ? `\n\nView: ${reportLink}` : ""}`;
          const slackPayload = p.slackBlocks?.length
            ? { text: slackText, blocks: p.slackBlocks }
            : p.slackAttachments?.length
              ? {
                  text: slackText,
                  attachments: p.slackAttachments.map((a) => ({
                    color: a.color,
                    text: a.text,
                    mrkdwn_in: ["text"] as const,
                  })),
                }
              : { text: slackText };
          const slackRes = await fetch(slackConfig.target, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(slackPayload),
          });
          if (!slackRes.ok) {
            const errBody = await slackRes.text();
            const err = `Slack webhook failed (${slackRes.status}): ${errBody.slice(0, 200)}`;
            await setJobLastRunError(db, jobId, err);
            return { success: false, error: err };
          }
        }
        deliveredChannels.push("Slack");
      } catch (e) {
        const msg = toErrorMessage(e);
        console.error("Failed to post report to Slack:", e);
        failedChannels.push({ channel: "Slack", error: msg });
      }
      }
    }

    if (job.channels.includes("twitter") && twitterConfig?.target) {
      // Watchlist report: cap X posts per run to avoid rate limits (e.g. 5 watchlists max to X)
      const maxXPosts = handlerKey === "watchlistreport" ? 5 : postsToSend.length;
      const postsForX = postsToSend.slice(0, maxXPosts);
      if (handlerKey === "watchlistreport" && postsToSend.length > maxXPosts) {
        console.warn(`Watchlist report: posting first ${maxXPosts} of ${postsToSend.length} watchlists to X to avoid rate limits`);
      }
      let xPosted = 0;
      for (const p of postsForX) {
        try {
          const tweetTitle = xTitle ?? p.title;
          const tweetBody = p.xBodyText ?? p.bodyText;
          const fullText = `${tweetTitle}\n\n${tweetBody}${reportLink ? `\n\n${reportLink}` : ""}`;
          await postToXThread(fullText);
          xPosted++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("Failed to post report to X:", msg);
          failedChannels.push({ channel: "X", error: msg });
          // Continue to next post; rate limit or one failure shouldn't stop the rest
        }
      }
      if (xPosted > 0) deliveredChannels.push("X");
    }

    if (job.channels.includes("push")) {
      console.log("Push delivery selected but not implemented server-side yet.");
    }

    const lastRunErrorToSet =
      failedChannels.length > 0
        ? failedChannels.map((f) => `${f.channel}: ${f.error}`).join("; ")
        : null;
    const updatePayload: Record<string, unknown> = {
      lastRunAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastRunError: lastRunErrorToSet,
    };
    if (lastRunNotesForJob != null) updatePayload.lastRunNotes = lastRunNotesForJob;
    await db.collection("reportJobs").updateOne(
      { _id: new ObjectId(jobId) },
      { $set: updatePayload }
    );
    const hasOutput = Boolean(bodyText && bodyText.trim().length > 0);
    return {
      success: deliveredChannels.length > 0 || hasOutput,
      deliveredChannels,
      failedChannels: failedChannels.length ? failedChannels : undefined,
      summary: bodyText || undefined,
      error: lastRunErrorToSet ?? undefined,
    };
  } catch (e) {
    const msg = toErrorMessage(e);
    console.error("executeJob failed:", e);
    try {
      await setJobLastRunError(db, jobId, msg);
    } catch {
      // ignore if jobId invalid or db unavailable
    }
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

  // Alerts only for account holdings (not watchlist-only items)
  const allAccountsWithPositions = await db
    .collection("accounts")
    .find(accountId ? { _id: new ObjectId(accountId) } : {})
    .project({ _id: 1, positions: 1 })
    .toArray();
  const heldSymbols = getHeldSymbols(
    allAccountsWithPositions,
    accountId ?? undefined
  );

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

      // Update watchlist item with current data and last recommendation/rationale
      const rationaleText = [analysis.recommendation, analysis.reason].filter(Boolean).join(" — ");
      await db.collection("watchlist").updateOne(
        { _id: new ObjectId(item._id) },
        {
          $set: {
            currentPrice,
            currentPremium: analysisMarketData.optionMid,
            profitLoss: priceChange * item.quantity * (item.type === "stock" ? 1 : 100),
            profitLossPercent: priceChangePercent,
            rationale: rationaleText || undefined,
            updatedAt: new Date().toISOString(),
          },
        }
      );

      analyzed++;

      // Create alert only for account holdings (not watchlist-only items)
      const symbolForItem = (
        item.type === "stock"
          ? item.symbol
          : (item.underlyingSymbol || item.symbol.replace(/\d+[CP]\d+$/, ""))
      ).toUpperCase();
      const isHolding = heldSymbols.has(symbolForItem);

      if (
        isHolding &&
        (analysis.severity !== "info" || analysis.recommendation !== "HOLD")
      ) {
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

/** Schedule a report job by ID (used when creating/updating jobs in reportJobs). */
export async function upsertReportJobSchedule(jobId: string, cron: string): Promise<void> {
  const ag = await getAgenda();
  await ag.cancel({ name: "scheduled-report", "data.jobId": jobId });
  await ag.every(cron, "scheduled-report", { jobId });
}

/** Cancel scheduled-report jobs for a given report job ID. */
export async function cancelReportJobSchedule(jobId: string): Promise<void> {
  const ag = await getAgenda();
  await ag.cancel({ name: "scheduled-report", "data.jobId": jobId });
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
