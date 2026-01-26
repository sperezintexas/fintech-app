import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type {
  WatchlistItem,
  SmartXAIReport,
  PositionAnalysis,
  StockSnapshot,
  StockRationale,
  MarketSentiment,
  RiskLevel,
} from "@/types/portfolio";
import { analyzeWatchlistItem, MarketData } from "@/lib/watchlist-rules";
import { getGroupedDailyData } from "@/lib/polygon";
import type { MarketIndex } from "@/types/portfolio";

export const dynamic = "force-dynamic";

// Generate rationale based on market data and position
function generateRationale(
  snapshot: StockSnapshot,
  entryPrice: number,
  strategy: string,
  riskLevel: RiskLevel
): StockRationale {
  const { price, changePercent, volume, high, low } = snapshot;
  const volatility = ((high - low) / low) * 100;

  // Determine sentiment
  let sentiment: MarketSentiment;
  if (changePercent > 1.5) sentiment = "bullish";
  else if (changePercent < -1.5) sentiment = "bearish";
  else sentiment = "neutral";

  // Technical analysis
  const priceVsEntry = ((price - entryPrice) / entryPrice) * 100;
  let technical = "";
  if (priceVsEntry > 10) {
    technical = `Strong upward momentum. Stock trading ${priceVsEntry.toFixed(1)}% above entry, indicating favorable position.`;
  } else if (priceVsEntry > 0) {
    technical = `Moderate gains. Position up ${priceVsEntry.toFixed(1)}% from entry, showing steady appreciation.`;
  } else if (priceVsEntry > -5) {
    technical = `Minor pullback. Down ${Math.abs(priceVsEntry).toFixed(1)}% from entry, within normal volatility range.`;
  } else {
    technical = `Significant decline. Down ${Math.abs(priceVsEntry).toFixed(1)}% from entry, requires attention.`;
  }

  if (volatility > 5) {
    technical += ` High intraday volatility (${volatility.toFixed(1)}%) suggests active trading.`;
  }

  // Fundamental/strategy analysis
  let fundamental = "";
  if (strategy === "covered-call") {
    fundamental = sentiment === "bullish"
      ? "Bullish momentum supports covered call strategy. Premium income plus potential capital appreciation."
      : sentiment === "bearish"
      ? "Bearish trend increases assignment risk. Consider rolling to lower strikes or closing position."
      : "Neutral market ideal for theta decay. Premium collection working as expected.";
  } else if (strategy === "cash-secured-put") {
    fundamental = sentiment === "bullish"
      ? "Bullish sentiment reduces assignment probability. Premium collection with low risk of stock acquisition."
      : sentiment === "bearish"
      ? "Bearish momentum increases assignment risk. Monitor closely - may want to close if approaching strike."
      : "Neutral conditions perfect for CSP. Stock likely to stay above strike, keeping premium.";
  } else {
    fundamental = `Position aligned with ${sentiment} market sentiment. ${riskLevel === "high" ? "Aggressive strategy requires active monitoring." : "Moderate risk profile suitable for current conditions."}`;
  }

  // Market conditions
  const marketConditions = volatility > 5
    ? "High volatility environment - increased opportunity and risk"
    : volatility < 2
    ? "Low volatility - stable price action"
    : "Moderate volatility - normal market conditions";

  return {
    technical,
    fundamental,
    sentiment,
    keyMetrics: {
      volatility,
      volumeVsAverage: volume > 0 ? 1.0 : 0, // Simplified - would need avg volume
    },
    marketConditions,
  };
}

// Generate position insights
function generatePositionInsights(
  entryPrice: number,
  currentPrice: number,
  strategy: string,
  daysToExpiration?: number
): {
  entryVsCurrent: string;
  riskAssessment: string;
  opportunity: string;
  timeHorizon: string;
} {
  const change = ((currentPrice - entryPrice) / entryPrice) * 100;

  const entryVsCurrent =
    change > 0
      ? `Entry: $${entryPrice.toFixed(2)} → Current: $${currentPrice.toFixed(2)} (+${change.toFixed(1)}%)`
      : `Entry: $${entryPrice.toFixed(2)} → Current: $${currentPrice.toFixed(2)} (${change.toFixed(1)}%)`;

  let riskAssessment = "";
  if (strategy === "covered-call") {
    riskAssessment = change > 10
      ? "Low risk - well above entry, assignment would be profitable"
      : change < -10
      ? "Elevated risk - significant drawdown, consider protective measures"
      : "Moderate risk - within normal range";
  } else if (strategy === "cash-secured-put") {
    riskAssessment = change < -5
      ? "Assignment risk increasing as stock approaches strike"
      : "Low assignment risk - stock well above strike";
  } else {
    riskAssessment = change > 0 ? "Favorable risk/reward" : "Monitor for exit signals";
  }

  const opportunity =
    change > 5
      ? "Consider taking profits or rolling to higher strikes"
      : change < -5
      ? "Potential buying opportunity if thesis remains intact"
      : "Position performing as expected - continue monitoring";

  const timeHorizon = daysToExpiration
    ? `${daysToExpiration} days to expiration - ${daysToExpiration <= 7 ? "urgent attention needed" : daysToExpiration <= 30 ? "approaching expiration" : "adequate time remaining"}`
    : "No expiration - long-term position";

  return {
    entryVsCurrent,
    riskAssessment,
    opportunity,
    timeHorizon,
  };
}

// POST - Generate SmartXAI report
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Fetch account
    const account = await db.collection("accounts").findOne({
      _id: new ObjectId(accountId),
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const riskLevel: RiskLevel = account.riskLevel || "medium";

    // Fetch all watchlist items for this account
    const watchlistItems = await db
      .collection<WatchlistItem>("watchlist")
      .find({ accountId })
      .toArray();

    if (watchlistItems.length === 0) {
      return NextResponse.json(
        { error: "No watchlist items found" },
        { status: 404 }
      );
    }

    // Get market data for all symbols (batch call - ONE API call for everything)
    // This uses Polygon's grouped daily endpoint which returns ALL stocks in a single call
    // Cached for 5 minutes to avoid hitting rate limits
    const marketDataMap = await getGroupedDailyData();

    if (marketDataMap.size === 0) {
      return NextResponse.json(
        { error: "Failed to fetch market data. Please try again in a moment." },
        { status: 503 }
      );
    }

    // Build market conditions from the batch data (no additional API calls)
    const INDEX_TICKERS = [
      { symbol: "SPY", name: "S&P 500" },
      { symbol: "QQQ", name: "Nasdaq 100" },
      { symbol: "DIA", name: "Dow Jones" },
      { symbol: "IWM", name: "Russell 2000" },
    ];

    const indices: MarketIndex[] = INDEX_TICKERS.map((indexInfo) => {
      const data = marketDataMap.get(indexInfo.symbol);

      if (data) {
        const change = data.close - data.open;
        const changePercent = data.open > 0 ? (change / data.open) * 100 : 0;

        return {
          symbol: indexInfo.symbol,
          name: indexInfo.name,
          price: data.close,
          change,
          changePercent,
        };
      }

      // Fallback if not found
      return {
        symbol: indexInfo.symbol,
        name: indexInfo.name,
        price: 0,
        change: 0,
        changePercent: 0,
      };
    });

    // Get market status (lightweight call, separate from price data)
    let marketStatus: "open" | "closed" | "pre-market" | "after-hours" = "closed";
    try {
      const statusRes = await fetch(
        `https://api.polygon.io/v1/marketstatus/now?apiKey=${process.env.POLYGON_API_KEY}`,
        { next: { revalidate: 60 } }
      );
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.market === "open") marketStatus = "open";
        else if (statusData.earlyHours) marketStatus = "pre-market";
        else if (statusData.afterHours) marketStatus = "after-hours";
      }
    } catch (err) {
      console.error("Failed to fetch market status:", err);
    }

    // Analyze each position
    const positions: PositionAnalysis[] = [];
    let totalValue = 0;
    let totalProfitLoss = 0;
    const sentimentCounts = { bullish: 0, neutral: 0, bearish: 0 };
    const recommendationCounts = {
      HOLD: 0,
      CLOSE: 0,
      BTC: 0,
      STC: 0,
      ROLL: 0,
      WATCH: 0,
    };

    for (const item of watchlistItems) {
      const underlying = item.underlyingSymbol || item.symbol.replace(/\d+[CP]\d+$/, "");
      const priceData = marketDataMap.get(underlying);

      if (!priceData) {
        console.log(`No market data for ${underlying}, skipping ${item.symbol}`);
        continue;
      }

      const currentPrice = priceData.close;
      const priceChange = currentPrice - item.entryPrice;
      const priceChangePercent = (priceChange / item.entryPrice) * 100;

      // Build snapshot
      const snapshot: StockSnapshot = {
        symbol: underlying,
        price: currentPrice,
        open: priceData.open,
        high: priceData.high || currentPrice,
        low: priceData.low || currentPrice,
        close: currentPrice,
        volume: priceData.volume || 0,
        change: priceChange,
        changePercent: priceChangePercent,
        previousClose: priceData.open,
      };

      // Generate rationale
      const rationale = generateRationale(snapshot, item.entryPrice, item.strategy, riskLevel);
      sentimentCounts[rationale.sentiment]++;

      // Run analysis
      const analysisMarketData: MarketData = {
        currentPrice,
        previousClose: priceData.open,
        change: priceChange,
        changePercent: priceChangePercent,
      };

      const analysis = analyzeWatchlistItem(item, riskLevel, analysisMarketData);
      recommendationCounts[analysis.recommendation]++;

      // Generate position insights
      let dte: number | undefined;
      if (item.expirationDate) {
        const expDate = new Date(item.expirationDate);
        dte = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      }

      const insights = generatePositionInsights(
        item.entryPrice,
        currentPrice,
        item.strategy,
        dte
      );

      const positionValue = currentPrice * item.quantity * (item.type === "stock" ? 1 : 100);
      const profitLoss = priceChange * item.quantity * (item.type === "stock" ? 1 : 100);

      totalValue += positionValue;
      totalProfitLoss += profitLoss;

      positions.push({
        watchlistItemId: item._id.toString(),
        symbol: item.symbol,
        underlyingSymbol: underlying,
        strategy: item.strategy,
        type: item.type,
        quantity: item.quantity,
        entryPrice: item.entryPrice,
        currentPrice,
        profitLoss,
        profitLossPercent: priceChangePercent,
        snapshot,
        rationale,
        recommendation: analysis.recommendation,
        recommendationReason: analysis.reason,
        positionInsights: insights,
      });
    }

    // Determine overall sentiment
    const overallSentiment: MarketSentiment =
      sentimentCounts.bullish > sentimentCounts.bearish
        ? "bullish"
        : sentimentCounts.bearish > sentimentCounts.bullish
        ? "bearish"
        : "neutral";

    // Create report
    const now = new Date();
    const reportDate = now.toISOString().split("T")[0];
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 30);

    const report: Omit<SmartXAIReport, "_id"> = {
      accountId,
      reportDate,
      reportDateTime: now.toISOString(),
      title: `SmartXAI Says - ${now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
      summary: {
        totalPositions: positions.length,
        totalValue,
        totalProfitLoss,
        totalProfitLossPercent: totalValue > 0 ? (totalProfitLoss / (totalValue - totalProfitLoss)) * 100 : 0,
        bullishCount: sentimentCounts.bullish,
        neutralCount: sentimentCounts.neutral,
        bearishCount: sentimentCounts.bearish,
        recommendations: recommendationCounts,
      },
      positions,
      marketOverview: {
        marketStatus,
        indices,
        overallSentiment,
      },
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    // Save report
    const result = await db.collection("smartXAIReports").insertOne(report);

    // Cleanup old reports (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    await db.collection("smartXAIReports").deleteMany({
      expiresAt: { $lt: thirtyDaysAgo.toISOString() },
    });

    return NextResponse.json({
      success: true,
      report: {
        ...report,
        _id: result.insertedId.toString(),
      },
    });
  } catch (error) {
    console.error("Failed to generate SmartXAI report:", error);
    return NextResponse.json(
      { error: "Failed to generate SmartXAI report" },
      { status: 500 }
    );
  }
}

// GET - Fetch reports
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get("id");
    const accountId = searchParams.get("accountId");
    const limit = parseInt(searchParams.get("limit") || "10");

    const db = await getDb();

    // If ID provided, fetch single report
    if (reportId) {
      const report = await db.collection<SmartXAIReport>("smartXAIReports").findOne({
        _id: new ObjectId(reportId),
        expiresAt: { $gte: new Date().toISOString() },
      });

      if (!report) {
        return NextResponse.json({ error: "Report not found" }, { status: 404 });
      }

      return NextResponse.json({
        ...report,
        _id: report._id.toString(),
      });
    }

    // Otherwise, fetch list of reports
    const query: Record<string, unknown> = {};

    if (accountId) {
      query.accountId = accountId;
    }

    // Only get non-expired reports
    query.expiresAt = { $gte: new Date().toISOString() };

    const reports = await db
      .collection<SmartXAIReport>("smartXAIReports")
      .find(query)
      .sort({ reportDateTime: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json(
      reports.map((report) => ({
        ...report,
        _id: report._id.toString(),
      }))
    );
  } catch (error) {
    console.error("Failed to fetch reports:", error);
    return NextResponse.json(
      { error: "Failed to fetch reports" },
      { status: 500 }
    );
  }
}
