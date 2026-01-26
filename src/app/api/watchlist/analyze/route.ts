import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type { WatchlistItem, WatchlistAlert, RiskLevel, TechnicalIndicators } from "@/types/portfolio";
import { analyzeWatchlistItem, MarketData } from "@/lib/watchlist-rules";
import { getGroupedDailyData } from "@/lib/polygon";

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const BASE_URL = "https://api.polygon.io";

export const dynamic = "force-dynamic";

// Fetch market data from batch (no individual API calls)
function getMarketDataFromBatch(
  symbol: string,
  batchData: Map<string, { close: number; open: number; high: number; low: number; volume: number }>
): MarketData | null {
  const data = batchData.get(symbol);
  if (!data) return null;

  const change = data.close - data.open;
  const changePercent = data.open > 0 ? (change / data.open) * 100 : 0;

  return {
    currentPrice: data.close,
    previousClose: data.open,
    change,
    changePercent,
  };
}

// Fetch technical indicators (RSI) from Polygon
async function fetchTechnicalIndicators(symbol: string): Promise<Partial<TechnicalIndicators> | null> {
  try {
    // Fetch RSI
    const rsiRes = await fetch(
      `${BASE_URL}/v1/indicators/rsi/${symbol}?timespan=day&window=14&series_type=close&apiKey=${POLYGON_API_KEY}`
    );

    let rsi: number | undefined;
    if (rsiRes.ok) {
      const rsiData = await rsiRes.json();
      if (rsiData.results?.values?.[0]) {
        rsi = rsiData.results.values[0].value;
      }
    }

    // Fetch SMA 50
    const smaRes = await fetch(
      `${BASE_URL}/v1/indicators/sma/${symbol}?timespan=day&window=50&series_type=close&apiKey=${POLYGON_API_KEY}`
    );

    let sma50: number | undefined;
    if (smaRes.ok) {
      const smaData = await smaRes.json();
      if (smaData.results?.values?.[0]) {
        sma50 = smaData.results.values[0].value;
      }
    }

    return {
      rsi,
      sma50,
    };
  } catch (error) {
    console.error(`Error fetching technical indicators for ${symbol}:`, error);
    return null;
  }
}

// Estimate option price based on underlying
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

// POST /api/watchlist/analyze - Analyze all or specific watchlist items
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, watchlistItemId } = body;

    const db = await getDb();

    // Build query
    const query: Record<string, unknown> = {};
    if (accountId) query.accountId = accountId;
    if (watchlistItemId) query._id = new ObjectId(watchlistItemId);

    // Fetch watchlist items
    const items = await db.collection("watchlist").find(query).toArray();

    if (items.length === 0) {
      return NextResponse.json({ message: "No watchlist items to analyze", alerts: [] });
    }

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

    // Get ALL market data in ONE batch API call
    const batchMarketData = await getGroupedDailyData();

    // Analyze each item
    const alerts: WatchlistAlert[] = [];
    const processedTechnicals = new Map<string, Partial<TechnicalIndicators>>();

    for (const item of items) {
      const watchlistItem = {
        ...item,
        _id: item._id.toString(),
      } as WatchlistItem;

      const riskLevel = accountRiskMap.get(item.accountId) || "medium";

      // Get market data from batch (no API call)
      const marketData = getMarketDataFromBatch(watchlistItem.underlyingSymbol, batchMarketData);

      if (!marketData) {
        console.log(`Skipping ${watchlistItem.symbol} - no market data for ${watchlistItem.underlyingSymbol}`);
        continue;
      }

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

        marketData = {
          ...marketData,
          optionBid: optionPrice.bid,
          optionAsk: optionPrice.ask,
          optionMid: optionPrice.mid,
        };
      }

      // Get technical indicators (cache by symbol)
      let technicals = processedTechnicals.get(watchlistItem.underlyingSymbol);
      if (!technicals) {
        technicals = await fetchTechnicalIndicators(watchlistItem.underlyingSymbol) || undefined;
        if (technicals) {
          processedTechnicals.set(watchlistItem.underlyingSymbol, technicals);
        }
      }

      // Run analysis
      const analysis = analyzeWatchlistItem(
        watchlistItem,
        riskLevel,
        marketData,
        technicals as TechnicalIndicators | undefined
      );

      // Update watchlist item with current prices
      await db.collection("watchlist").updateOne(
        { _id: item._id },
        {
          $set: {
            currentPrice: marketData.currentPrice,
            currentPremium: marketData.optionMid,
            profitLoss: analysis.details.priceChange * watchlistItem.quantity * (watchlistItem.type === "stock" ? 1 : 100),
            profitLossPercent: analysis.details.priceChangePercent,
            updatedAt: new Date().toISOString(),
          },
        }
      );

      // Create alert if significant
      if (
        analysis.severity !== "info" ||
        analysis.recommendation !== "HOLD"
      ) {
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

        // Check if similar alert already exists (same item, same recommendation, within 24h)
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
    }

    return NextResponse.json({
      message: `Analyzed ${items.length} items, generated ${alerts.length} alerts`,
      itemsAnalyzed: items.length,
      alertsGenerated: alerts.length,
      alerts,
    });
  } catch (error) {
    console.error("Failed to analyze watchlist:", error);
    return NextResponse.json(
      { error: "Failed to analyze watchlist" },
      { status: 500 }
    );
  }
}
