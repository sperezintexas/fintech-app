import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type { WatchlistItem } from "@/types/portfolio";
import { getRiskDisclosure } from "@/lib/watchlist-rules";

export const dynamic = "force-dynamic";

// GET /api/watchlist - Get all watchlist items or filter by accountId
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    const db = await getDb();
    const query = accountId ? { accountId } : {};
    const items = await db
      .collection("watchlist")
      .find(query)
      .sort({ addedAt: -1 })
      .toArray();

    // Transform MongoDB _id to string
    const watchlistItems = items.map((item) => ({
      ...item,
      _id: item._id.toString(),
    }));

    return NextResponse.json(watchlistItems);
  } catch (error) {
    console.error("Failed to fetch watchlist:", error);
    return NextResponse.json(
      { error: "Failed to fetch watchlist" },
      { status: 500 }
    );
  }
}

// POST /api/watchlist - Add item to watchlist
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      accountId,
      symbol,
      underlyingSymbol,
      type,
      strategy,
      quantity,
      entryPrice,
      entryDate,
      strikePrice,
      expirationDate,
      entryPremium,
      notes,
    } = body;

    // Validate required fields
    if (!accountId || !symbol || !type || !strategy || !quantity || !entryPrice) {
      return NextResponse.json(
        { error: "Missing required fields: accountId, symbol, type, strategy, quantity, entryPrice" },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Verify account exists
    const account = await db.collection("accounts").findOne({
      _id: new ObjectId(accountId),
    });

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    // Get risk disclosure for the strategy
    const riskInfo = getRiskDisclosure(strategy);

    // Calculate max profit/loss based on strategy
    let maxProfit: number | undefined;
    let maxLoss: number | undefined;
    let breakeven: number | undefined;

    if (strategy === "covered-call" && entryPremium && strikePrice) {
      maxProfit = (strikePrice - entryPrice + entryPremium) * quantity * 100;
      maxLoss = (entryPrice - entryPremium) * quantity * 100;
      breakeven = entryPrice - entryPremium;
    } else if (strategy === "cash-secured-put" && entryPremium && strikePrice) {
      maxProfit = entryPremium * quantity * 100;
      maxLoss = (strikePrice - entryPremium) * quantity * 100;
      breakeven = strikePrice - entryPremium;
    } else if (strategy === "leap-call" && entryPremium) {
      maxProfit = undefined; // Unlimited
      maxLoss = entryPremium * quantity * 100;
      breakeven = (strikePrice || 0) + entryPremium;
    }

    const now = new Date().toISOString();
    const newItem: Omit<WatchlistItem, "_id"> = {
      accountId,
      symbol: symbol.toUpperCase(),
      underlyingSymbol: (underlyingSymbol || symbol).toUpperCase(),
      type,
      strategy,
      quantity,
      entryPrice,
      entryDate: entryDate || now.split("T")[0],
      strikePrice,
      expirationDate,
      entryPremium,
      riskDisclosure: riskInfo.description,
      maxProfit,
      maxLoss,
      breakeven,
      notes,
      addedAt: now,
      updatedAt: now,
    };

    const result = await db.collection("watchlist").insertOne(newItem);

    return NextResponse.json(
      {
        ...newItem,
        _id: result.insertedId.toString(),
        riskWarnings: riskInfo.risks,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to add to watchlist:", error);
    return NextResponse.json(
      { error: "Failed to add to watchlist" },
      { status: 500 }
    );
  }
}
