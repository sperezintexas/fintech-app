import Agenda, { Job } from "agenda";
import { ObjectId } from "mongodb";
import { getDb } from "./mongodb";
import type { WatchlistItem, WatchlistAlert, RiskLevel } from "@/types/portfolio";
import { analyzeWatchlistItem, MarketData } from "./watchlist-rules";

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const BASE_URL = "https://api.polygon.io";

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
  agenda.define("daily-analysis", async (job: Job) => {
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
  agenda.define("cleanup-alerts", async (_job: Job) => {
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
}

// Fetch market data using grouped daily (single API call)
async function fetchGroupedDaily(): Promise<Map<string, { close: number; open: number }>> {
  const dataMap = new Map<string, { close: number; open: number }>();

  try {
    const today = new Date();
    const prevDay = new Date(today);
    do {
      prevDay.setDate(prevDay.getDate() - 1);
    } while (prevDay.getDay() === 0 || prevDay.getDay() === 6);

    const dateStr = prevDay.toISOString().split("T")[0];

    const res = await fetch(
      `${BASE_URL}/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apiKey=${POLYGON_API_KEY}`
    );

    if (!res.ok) {
      console.error("Failed to fetch grouped daily:", res.status);
      return dataMap;
    }

    const data = await res.json();

    if (data.results && Array.isArray(data.results)) {
      for (const result of data.results) {
        if (result.T && result.c && result.o) {
          dataMap.set(result.T, {
            close: result.c,
            open: result.o,
          });
        }
      }
    }
  } catch (error) {
    console.error("Error fetching grouped daily:", error);
  }

  return dataMap;
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

  // Fetch market data in single API call
  const marketData = await fetchGroupedDaily();

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
      const priceData = marketData.get(underlying);

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

      // Get risk level for this account
      const riskLevel = accountRiskMap.get(item.accountId) || "medium";

      // Run analysis
      const analysis = analyzeWatchlistItem(item, riskLevel, analysisMarketData);

      // Update watchlist item with current data
      await db.collection("watchlist").updateOne(
        { _id: item._id },
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
          const alert: Omit<WatchlistAlert, "_id"> = {
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
  return result;
}

// Graceful shutdown
export async function stopScheduler(): Promise<void> {
  if (agenda) {
    await agenda.stop();
    console.log("Agenda scheduler stopped");
  }
}
