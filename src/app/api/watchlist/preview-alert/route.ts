import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type { WatchlistItem, WatchlistAlert, RiskLevel, AlertTemplateId } from "@/types/portfolio";
import { formatAlert, getTemplate } from "@/lib/alert-formatter";
import { analyzeWatchlistItem, MarketData } from "@/lib/watchlist-rules";

export const dynamic = "force-dynamic";

// POST - Generate alert preview for a watchlist item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { watchlistItemId, templateId } = body;

    if (!watchlistItemId) {
      return NextResponse.json(
        { error: "watchlistItemId is required" },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Fetch watchlist item
    const itemDoc = await db.collection("watchlist").findOne({
      _id: new ObjectId(watchlistItemId),
    });

    if (!itemDoc) {
      return NextResponse.json({ error: "Watchlist item not found" }, { status: 404 });
    }

    const item = {
      ...(itemDoc as any),
      _id: (itemDoc as any)._id.toString(),
    } as WatchlistItem;

    // Fetch account for risk level
    const account = await db.collection("accounts").findOne({
      _id: new ObjectId(item.accountId),
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const riskLevel: RiskLevel = account.riskLevel || "medium";

    // Get current market data (use latest price or entry price as fallback)
    const currentPrice = item.currentPrice || item.entryPrice;
    const priceChange = currentPrice - item.entryPrice;
    const priceChangePercent = (priceChange / item.entryPrice) * 100;

    // Calculate DTE
    let daysToExpiration: number | undefined;
    if (item.expirationDate) {
      const expDate = new Date(item.expirationDate);
      const today = new Date();
      const diffTime = expDate.getTime() - today.getTime();
      daysToExpiration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Build market data
    const marketData: MarketData = {
      currentPrice,
      previousClose: item.entryPrice,
      change: priceChange,
      changePercent: priceChangePercent,
      optionMid: item.currentPremium || item.entryPremium,
    };

    // Run analysis to generate alert
    const analysis = analyzeWatchlistItem(item, riskLevel, marketData);

    // Create a mock alert based on analysis
    const mockAlert: WatchlistAlert = {
      _id: "preview",
      watchlistItemId: item._id.toString(),
      accountId: item.accountId,
      symbol: item.symbol,
      recommendation: analysis.recommendation,
      severity: analysis.severity,
      reason: analysis.reason,
      details: {
        currentPrice,
        entryPrice: item.entryPrice,
        priceChange,
        priceChangePercent,
        daysToExpiration,
        profitCaptured: analysis.details.profitCaptured,
        rsi: analysis.details.rsi,
        volatility: analysis.details.volatility,
      },
      riskWarning: analysis.riskWarning,
      suggestedActions: analysis.suggestedActions,
      createdAt: new Date().toISOString(),
      acknowledged: false,
    };

    // Get template
    const template = getTemplate((templateId as AlertTemplateId) || "concise");

    // Format alert
    const formatted = formatAlert({
      alert: mockAlert,
      item,
      riskLevel,
      template,
    });

    return NextResponse.json({
      alert: mockAlert,
      formatted,
      template: {
        id: template.id,
        name: template.name,
      },
      analysis: {
        recommendation: analysis.recommendation,
        severity: analysis.severity,
        reason: analysis.reason,
        confidence: analysis.confidence,
      },
    });
  } catch (error) {
    console.error("Failed to generate alert preview:", error);
    return NextResponse.json(
      { error: "Failed to generate alert preview" },
      { status: 500 }
    );
  }
}
