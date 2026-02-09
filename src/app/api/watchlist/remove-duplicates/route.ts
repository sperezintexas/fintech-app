import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

type WatchlistItemDoc = {
  _id: ObjectId;
  watchlistId?: string;
  symbol?: string;
  underlyingSymbol?: string;
  type?: string;
  strikePrice?: number;
  expirationDate?: string;
  addedAt?: string;
};

function duplicateKey(item: WatchlistItemDoc): string {
  const s = (item.symbol ?? "").toUpperCase();
  const u = (item.underlyingSymbol ?? "").toUpperCase();
  const t = item.type ?? "";
  const strike = item.strikePrice ?? "";
  const exp = item.expirationDate ?? "";
  return `${s}|${u}|${t}|${strike}|${exp}`;
}

/**
 * POST /api/watchlist/remove-duplicates
 * Finds duplicates within each watchlist (same symbol/type/strike/exp), keeps oldest by addedAt, deletes the rest.
 * Returns { removed, byWatchlist: { [watchlistId]: number } }.
 */
export async function POST() {
  try {
    const db = await getDb();
    const items = (await db
      .collection<WatchlistItemDoc>("watchlist")
      .find({})
      .toArray()) as WatchlistItemDoc[];

    const byWatchlistAndKey = new Map<string, WatchlistItemDoc[]>();
    for (const item of items) {
      const wlId = item.watchlistId ?? "";
      const key = duplicateKey(item);
      const mapKey = `${wlId}\0${key}`;
      if (!byWatchlistAndKey.has(mapKey)) byWatchlistAndKey.set(mapKey, []);
      byWatchlistAndKey.get(mapKey)!.push(item);
    }

    const idsToDelete: string[] = [];
    const byWatchlist: Record<string, number> = {};

    for (const group of byWatchlistAndKey.values()) {
      if (group.length <= 1) continue;
      const sorted = [...group].sort(
        (a, b) =>
          new Date(a.addedAt ?? 0).getTime() - new Date(b.addedAt ?? 0).getTime()
      );
      const kept = sorted[0]!;
      const wlId = kept.watchlistId ?? "legacy";
      for (let i = 1; i < sorted.length; i++) {
        idsToDelete.push(sorted[i]!._id.toString());
        byWatchlist[wlId] = (byWatchlist[wlId] ?? 0) + 1;
      }
    }

    for (const id of idsToDelete) {
      await db.collection("watchlist").deleteOne({ _id: new ObjectId(id) });
      await db.collection("alerts").deleteMany({ watchlistItemId: id });
    }

    return NextResponse.json({
      removed: idsToDelete.length,
      byWatchlist,
    });
  } catch (error) {
    console.error("Failed to remove watchlist duplicates:", error);
    return NextResponse.json(
      { error: "Failed to remove duplicates" },
      { status: 500 }
    );
  }
}
