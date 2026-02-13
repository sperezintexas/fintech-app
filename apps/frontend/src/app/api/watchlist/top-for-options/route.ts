import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getIVRankOrPercentile } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

type WatchlistItemDoc = {
  type?: string;
  symbol?: string;
  underlyingSymbol?: string;
};

/**
 * GET /api/watchlist/top-for-options?limit=10
 * Returns top watchlist symbols by IV rank (best for CSP/CC premium), combined across all watchlists.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10) || 10));

    const db = await getDb();
    const items = await db
      .collection<WatchlistItemDoc>("watchlist")
      .find({})
      .project({ symbol: 1, underlyingSymbol: 1, type: 1 })
      .toArray();

    const symbolSet = new Set<string>();
    for (const item of items) {
      const sym =
        item.type === "stock" || !item.underlyingSymbol
          ? (item.symbol ?? "").toUpperCase().trim()
          : (item.underlyingSymbol ?? item.symbol ?? "").toUpperCase().trim();
      if (sym && sym.length >= 1 && sym.length <= 6) symbolSet.add(sym);
    }
    const symbols = Array.from(symbolSet).slice(0, 15);

    const withIv: Array<{ symbol: string; ivRank: number }> = [];
    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const ivRank = await getIVRankOrPercentile(symbol);
          withIv.push({ symbol, ivRank });
        } catch {
          withIv.push({ symbol, ivRank: 0 });
        }
      })
    );

    withIv.sort((a, b) => b.ivRank - a.ivRank);
    const top = withIv.slice(0, limit);

    return NextResponse.json(top);
  } catch (error) {
    console.error("Failed to fetch top watchlist for options:", error);
    return NextResponse.json(
      { error: "Failed to fetch top symbols for options" },
      { status: 500 }
    );
  }
}
