import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type { Position } from "@/types/portfolio";

export const dynamic = "force-dynamic";

/** Extract underlying symbol from option ticker (e.g. TSLA250117C250 -> TSLA). */
function getUnderlyingFromTicker(ticker: string): string {
  return ticker?.replace(/\d.*$/, "").toUpperCase() ?? ticker?.toUpperCase() ?? "";
}

/** Build set of symbols held across all accounts (stock tickers + option underlyings). */
function getHeldSymbols(accounts: Array<{ positions?: Position[] }>): Set<string> {
  const set = new Set<string>();
  for (const acc of accounts) {
    const positions = acc.positions ?? [];
    for (const p of positions) {
      if (!p.ticker) continue;
      if (p.type === "stock") {
        set.add(p.ticker.toUpperCase());
      } else if (p.type === "option") {
        set.add(getUnderlyingFromTicker(p.ticker));
      }
    }
  }
  return set;
}

/** POST /api/watchlist/remove-held — Remove watchlist items whose symbol/underlying is held in any account. */
export async function POST() {
  try {
    const db = await getDb();

    const accounts = (await db
      .collection("accounts")
      .find({})
      .project({ positions: 1 })
      .toArray()) as Array<{ positions?: Position[] }>;

    const heldSymbols = getHeldSymbols(accounts);
    if (heldSymbols.size === 0) {
      return NextResponse.json({ removed: 0, symbols: [], message: "No holdings found" });
    }

    type WatchlistDoc = { _id: ObjectId; symbol?: string; underlyingSymbol?: string; type?: string };
    const allItems = (await db.collection("watchlist").find({}).toArray()) as WatchlistDoc[];

    const toRemove: string[] = [];
    for (const item of allItems) {
      const symbolForMatch =
        item.type === "stock"
          ? (item.symbol ?? "").toUpperCase()
          : (item.underlyingSymbol ?? item.symbol ?? "").toUpperCase();
      if (symbolForMatch && heldSymbols.has(symbolForMatch)) {
        toRemove.push(item._id.toString());
      }
    }

    if (toRemove.length === 0) {
      return NextResponse.json({
        removed: 0,
        symbols: [...heldSymbols],
        message: "No watchlist items match your holdings",
      });
    }

    const result = await db.collection("watchlist").deleteMany({
      _id: { $in: toRemove.map((id) => new ObjectId(id)) },
    });

    await db.collection("alerts").deleteMany({
      watchlistItemId: { $in: toRemove },
    });

    return NextResponse.json({
      removed: result.deletedCount,
      symbols: [...heldSymbols],
      message: `Removed ${result.deletedCount} watchlist item(s) that are already in your holdings`,
    });
  } catch (error) {
    console.error("Failed to remove held watchlist items:", error);
    return NextResponse.json(
      { error: "Failed to remove watchlist items" },
      { status: 500 }
    );
  }
}
