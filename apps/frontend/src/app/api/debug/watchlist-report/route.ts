import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

/**
 * Debug endpoint to diagnose watchlist report issues.
 * GET /api/debug/watchlist-report
 *
 * Returns:
 * - watchlists: all watchlists with _id, name
 * - itemCounts: per-watchlist item count (same query as scheduler)
 * - sampleItems: first 10 items from watchlist collection with watchlistId/accountId
 * - orphanedItems: count of items with no watchlistId (legacy - only show in Default)
 */
export async function GET() {
  try {
    const db = await getDb();

    const watchlists = (await db
      .collection("watchlists")
      .find({})
      .sort({ name: 1 })
      .toArray()) as Array<{ _id: ObjectId; name: string }>;

    const defaultWatchlist = watchlists.find((w) => w.name === "Default");
    const defaultId = defaultWatchlist?._id.toString();

    const itemCounts: Array<{ watchlistId: string; name: string; count: number; query: string }> = [];

    for (const w of watchlists) {
      const watchlistId = w._id.toString();
      const isDefault = defaultWatchlist && watchlistId === defaultId;
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

      const count = await db.collection("watchlist").countDocuments(query);
      itemCounts.push({
        watchlistId,
        name: w.name,
        count,
        query: JSON.stringify(query),
      });
    }

    const allItems = await db
      .collection("watchlist")
      .find({})
      .limit(20)
      .toArray();

    const sampleItems = allItems.map((item: { _id: ObjectId; watchlistId?: string; accountId?: string; symbol?: string }) => ({
      _id: item._id.toString(),
      watchlistId: item.watchlistId ?? "(MISSING - legacy)",
      accountId: item.accountId ?? "(none)",
      symbol: item.symbol,
    }));

    const orphanedCount = await db.collection("watchlist").countDocuments({
      $or: [{ watchlistId: { $exists: false } }, { watchlistId: "" }],
    });

    const totalItems = await db.collection("watchlist").countDocuments({});

    return NextResponse.json({
      watchlists: watchlists.map((w) => ({ _id: w._id.toString(), name: w.name })),
      itemCounts,
      totalItems,
      orphanedItems: orphanedCount,
      hasDefaultWatchlist: !!defaultWatchlist,
      sampleItems,
      hint:
        orphanedCount > 0 && !defaultWatchlist
          ? "You have items without watchlistId (legacy). They only appear in a watchlist named 'Default'. Create a 'Default' watchlist or reassign items."
          : undefined,
    });
  } catch (error) {
    console.error("Debug watchlist-report failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
