import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type { WatchlistItem, WatchlistAlert, RiskLevel } from "@/types/portfolio";
import { analyzeWatchlistItem, MarketData } from "@/lib/watchlist-rules";

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const BASE_URL = "https://api.polygon.io";
const CRON_SECRET = process.env.CRON_SECRET;

export const dynamic = "force-dynamic";

// Verify cron request (optional security)
function verifyCronRequest(request: NextRequest): boolean {
  // Allow if no secret is set (development)
  if (!CRON_SECRET) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;

  // Also check query param for simple cron services
  const { searchParams } = new URL(request.url);
  if (searchParams.get("secret") === CRON_SECRET) return true;

  return false;
}

// Fetch market data using grouped daily (single API call for all)
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

    console.log(`Fetched ${dataMap.size} tickers from grouped daily`);
  } catch (error) {
    console.error("Error fetching grouped daily:", error);
  }

  return dataMap;
}

// Estimate option price
function estimateOptionPrice(
  stockPrice: number,
  strikePrice: number,
  daysToExp: number,
  isCall: boolean
): { bid: number; ask: number; mid: number } {
  const intrinsic = isCall
    ? Math.max(0, stockPrice - strikePrice)
    : Math.max(0, strikePrice - stockPrice);

  const timeYears = daysToExp / 365;
  const timeValue = stockPrice * 0.02 * Math.sqrt(timeYears);
  const premium = intrinsic + timeValue;

  const spread = premium * 0.05;
  return {
    bid: Math.max(0.01, premium - spread),
    ask: premium + spread,
    mid: premium,
  };
}

/**
 * GET /api/cron/daily-analysis
 *
 * Triggered daily at market close (4:30 PM ET recommended).
 * Analyzes all watchlist items and generates alerts.
 *
 * Can be triggered by:
 * - Vercel Cron: Add to vercel.json { "crons": [{ "path": "/api/cron/daily-analysis", "schedule": "30 21 * * 1-5" }] }
 * - GitHub Actions: Use workflow dispatch
 * - External cron service: Call with ?secret=YOUR_CRON_SECRET
 */
export async function GET(request: NextRequest) {
  // Verify request
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  console.log("Starting daily watchlist analysis...");

  try {
    const db = await getDb();

    // Fetch all watchlist items
    const items = await db.collection("watchlist").find({}).toArray();

    if (items.length === 0) {
      return NextResponse.json({
        message: "No watchlist items to analyze",
        duration: Date.now() - startTime,
      });
    }

    console.log(`Found ${items.length} watchlist items to analyze`);

    // Fetch market data in ONE call
    const groupedData = await fetchGroupedDaily();

    // Get account risk levels
    const accountIds = [...new Set(items.map((i) => i.accountId))];
    const accounts = await db
      .collection("accounts")
      .find({
        _id: { $in: accountIds.map((id) => new ObjectId(id)) },
      })
      .toArray();

    const accountRiskMap = new Map<string, RiskLevel>();
    accounts.forEach((acc) => {
      accountRiskMap.set(acc._id.toString(), acc.riskLevel as RiskLevel);
    });

    // Analyze each item
    const alerts: WatchlistAlert[] = [];
    let itemsProcessed = 0;
    let itemsSkipped = 0;

    for (const item of items) {
      const watchlistItem = {
        ...item,
        _id: item._id.toString(),
      } as WatchlistItem;

      const riskLevel = accountRiskMap.get(item.accountId) || "medium";

      // Get market data from grouped daily
      const priceData = groupedData.get(watchlistItem.underlyingSymbol.toUpperCase());
      if (!priceData) {
        console.log(`Skipping ${watchlistItem.symbol} - no market data`);
        itemsSkipped++;
        continue;
      }

      const marketData: MarketData = {
        currentPrice: priceData.close,
        previousClose: priceData.open,
        change: priceData.close - priceData.open,
        changePercent: ((priceData.close - priceData.open) / priceData.open) * 100,
      };

      // Add option pricing if applicable
      if (watchlistItem.strikePrice && watchlistItem.expirationDate) {
        const expDate = new Date(watchlistItem.expirationDate);
        const now = new Date();
        const daysToExp = Math.max(
          0,
          Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        );

        const isCall = watchlistItem.type === "call" || watchlistItem.type === "covered-call";
        const optionPrice = estimateOptionPrice(
          marketData.currentPrice,
          watchlistItem.strikePrice,
          daysToExp,
          isCall
        );

        marketData.optionBid = optionPrice.bid;
        marketData.optionAsk = optionPrice.ask;
        marketData.optionMid = optionPrice.mid;
      }

      // Run analysis (no technical indicators to save API calls)
      const analysis = analyzeWatchlistItem(watchlistItem, riskLevel, marketData);

      // Update watchlist item with current prices
      await db.collection("watchlist").updateOne(
        { _id: item._id },
        {
          $set: {
            currentPrice: marketData.currentPrice,
            currentPremium: marketData.optionMid,
            profitLoss:
              analysis.details.priceChange *
              watchlistItem.quantity *
              (watchlistItem.type === "stock" ? 1 : 100),
            profitLossPercent: analysis.details.priceChangePercent,
            updatedAt: new Date().toISOString(),
          },
        }
      );

      // Create alert if significant
      if (analysis.severity !== "info" || analysis.recommendation !== "HOLD") {
        const newAlert: Omit<WatchlistAlert, "_id"> = {
          watchlistItemId: watchlistItem._id,
          accountId: watchlistItem.accountId,
          symbol: watchlistItem.symbol,
          recommendation: analysis.recommendation,
          severity: analysis.severity,
          reason: analysis.reason,
          details: analysis.details,
          riskWarning: analysis.riskWarning,
          suggestedActions: analysis.suggestedActions,
          createdAt: new Date().toISOString(),
          acknowledged: false,
        };

        // Check for duplicate alert (same item, same rec, within 24h)
        const existingAlert = await db.collection("alerts").findOne({
          watchlistItemId: watchlistItem._id,
          recommendation: analysis.recommendation,
          createdAt: {
            $gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          },
        });

        if (!existingAlert) {
          const result = await db.collection("alerts").insertOne(newAlert);
          alerts.push({
            ...newAlert,
            _id: result.insertedId.toString(),
          });
        }
      }

      itemsProcessed++;
    }

    // Clean up old alerts (older than 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const deleteResult = await db.collection("alerts").deleteMany({
      createdAt: { $lt: thirtyDaysAgo },
      acknowledged: true,
    });

    const duration = Date.now() - startTime;
    console.log(
      `Daily analysis complete: ${itemsProcessed} items, ${alerts.length} alerts, ${duration}ms`
    );

    return NextResponse.json({
      success: true,
      message: `Daily analysis complete`,
      stats: {
        itemsTotal: items.length,
        itemsProcessed,
        itemsSkipped,
        alertsGenerated: alerts.length,
        oldAlertsDeleted: deleteResult.deletedCount,
        duration,
      },
      alerts: alerts.slice(0, 10), // Return first 10 alerts
    });
  } catch (error) {
    console.error("Daily analysis failed:", error);
    return NextResponse.json(
      {
        error: "Daily analysis failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
