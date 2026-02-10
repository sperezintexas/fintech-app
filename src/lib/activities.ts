/**
 * Activities (transaction log) for ghostbranch: insert and recompute positions.
 * See docs/ghostbranch-feature.md.
 */

import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { Activity, ActivityImportItem, Position } from "@/types/portfolio";

const COLLECTION = "activities";

type ActivityDoc = Omit<Activity, "_id"> & { _id?: ObjectId };

/** Signature for deduplication: same date, symbol, type, qty, price, option fields = same activity. */
function activitySignature(item: {
  date: string;
  symbol: string;
  type: string;
  quantity: number;
  unitPrice: number;
  optionType?: string;
  strike?: number;
  expiration?: string;
}): string {
  const sym = (item.symbol ?? "").toUpperCase().trim();
  const opt = item.optionType ?? "";
  const str = item.strike != null ? String(item.strike) : "";
  const exp = (item.expiration ?? "").trim();
  return [
    item.date,
    sym,
    item.type,
    String(item.quantity),
    String(Number(item.unitPrice)),
    opt,
    str,
    exp,
  ].join("|");
}

/** Insert activities for an account. Returns inserted count. */
export async function insertActivities(
  accountId: string,
  items: ActivityImportItem[],
  dataSource: Activity["dataSource"] = "IMPORT"
): Promise<number> {
  if (items.length === 0) return 0;
  const db = await getDb();
  const now = new Date().toISOString();
  const docs: ActivityDoc[] = items.map((item) => {
    const base: Record<string, unknown> = {
      _id: new ObjectId(),
      accountId,
      symbol: item.symbol.toUpperCase(),
      type: item.type,
      date: item.date,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      fee: item.fee,
      dataSource: item.dataSource ?? dataSource,
      comment: item.comment,
      createdAt: now,
      updatedAt: now,
    };
    if (item.optionType != null) base.optionType = item.optionType;
    if (item.strike != null) base.strike = item.strike;
    if (item.expiration != null) base.expiration = item.expiration;
    return base as ActivityDoc;
  });
  const result = await db.collection(COLLECTION).insertMany(docs as unknown as Record<string, unknown>[]);
  return result.insertedCount;
}

/** Position key for grouping: stock by symbol; option by symbol+optionType+strike+expiration. */
function positionKey(a: { symbol: string; optionType?: string; strike?: number; expiration?: string }): string {
  if (a.optionType != null && (a.strike != null || a.expiration != null)) {
    return `${a.symbol}|${a.optionType}|${a.strike ?? ""}|${a.expiration ?? ""}`;
  }
  return a.symbol;
}

const RECOMPUTE_DEBUG = process.env.RECOMPUTE_DEBUG === "true" || process.env.DEBUG?.includes("recompute");

/** Recompute positions from activities for an account. Returns positions suitable for account.positions (stocks + options only; cash not derived from BUY/SELL). */
export async function recomputePositionsFromActivities(accountId: string): Promise<Position[]> {
  const db = await getDb();
  const activities = await db
    .collection<Activity>(COLLECTION)
    .find({ accountId })
    .sort({ date: 1 })
    .toArray();

  if (RECOMPUTE_DEBUG) {
    console.debug("[recompute] accountId=%s activitiesCount=%d", accountId, activities.length);
    if (activities.length > 0) {
      const sample = activities.slice(0, 3).map((a) => ({ date: a.date, symbol: a.symbol, type: a.type, quantity: a.quantity, optionType: a.optionType, strike: a.strike, expiration: a.expiration }));
      console.debug("[recompute] sample activities (first 3):", JSON.stringify(sample, null, 0));
    }
  }

  type Agg = {
    symbol: string;
    optionType?: "call" | "put";
    strike?: number;
    expiration?: string;
    totalQty: number;
    totalCost: number;
  };
  const byKey = new Map<string, Agg>();

  for (const a of activities) {
    const norm = {
      ...a,
      optionType: a.optionType ?? undefined,
      strike: a.strike != null ? Number(a.strike) : undefined,
      expiration: a.expiration != null ? String(a.expiration) : undefined,
    };
    const key = positionKey(norm);
    if (!byKey.has(key)) {
      byKey.set(key, {
        symbol: norm.symbol,
        optionType: norm.optionType,
        strike: norm.strike,
        expiration: norm.expiration,
        totalQty: 0,
        totalCost: 0,
      });
    }
    const agg = byKey.get(key)!;
    const qty = norm.type === "BUY" ? norm.quantity : norm.type === "SELL" ? -norm.quantity : 0;
    const cost = (norm.type === "BUY" ? 1 : norm.type === "SELL" ? -1 : 0) * norm.quantity * norm.unitPrice;
    if (norm.fee != null) {
      if (norm.type === "BUY") agg.totalCost += norm.fee;
      else if (norm.type === "SELL") agg.totalCost -= norm.fee;
    }
    agg.totalQty += qty;
    agg.totalCost += cost;
  }

  if (RECOMPUTE_DEBUG) {
    const aggSummary = Array.from(byKey.entries()).map(([key, agg]) => ({
      key,
      symbol: agg.symbol,
      optionType: agg.optionType,
      strike: agg.strike,
      expiration: agg.expiration,
      totalQty: agg.totalQty,
      kept: agg.totalQty > 0,
    }));
    console.debug("[recompute] aggregates (positionKey -> totalQty, kept=totalQty>0):", JSON.stringify(aggSummary, null, 0));
  }

  const positions: Position[] = [];
  for (const agg of byKey.values()) {
    if (agg.totalQty <= 0) continue;
    const isOption = agg.optionType != null && (agg.strike != null || agg.expiration != null);
    const avgCost = agg.totalQty > 0 ? agg.totalCost / agg.totalQty : 0;
    if (isOption) {
      positions.push({
        _id: new ObjectId().toString(),
        type: "option",
        ticker: agg.symbol,
        optionType: agg.optionType ?? "call",
        strike: agg.strike,
        expiration: agg.expiration,
        contracts: Math.round(agg.totalQty),
        premium: Math.max(0, avgCost),
      });
    } else {
      positions.push({
        _id: new ObjectId().toString(),
        type: "stock",
        ticker: agg.symbol,
        shares: agg.totalQty,
        purchasePrice: Math.max(0, avgCost),
      });
    }
  }

  if (RECOMPUTE_DEBUG) {
    console.debug("[recompute] accountId=%s positionsCreated=%d (only net-long totalQty>0 are kept; totalQty<=0 are closed/flat and skipped)", accountId, positions.length);
  }
  if (positions.length === 0 && activities.length > 0) {
    const aggSummary = Array.from(byKey.entries()).map(([key, agg]) => ({ key, totalQty: agg.totalQty }));
    console.debug("[recompute] no positions created for accountId=%s (activities=%d). Aggregates by positionKey: %s. Positions only created when net totalQty>0.", accountId, activities.length, JSON.stringify(aggSummary));
  }
  return positions;
}

/** Replace account.positions with the given positions (e.g. from recomputePositionsFromActivities). Returns true if account was found and updated. */
export async function setAccountPositions(accountId: string, positions: Position[]): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection("accounts").updateOne(
    { _id: new ObjectId(accountId) },
    { $set: { positions } }
  );
  return result.matchedCount > 0;
}

export type ImportActivitiesResult = {
  imported: number;
  positionsUpdated: boolean;
  /** Number of positions derived (net long); 0 if all trades closed. */
  positionsCount: number;
};

/** Delete all activities for an account. Returns number deleted. Use before a full replace import. */
export async function deleteActivitiesForAccount(accountId: string): Promise<number> {
  const db = await getDb();
  const result = await db.collection(COLLECTION).deleteMany({ accountId });
  return result.deletedCount;
}

/** Whether the account has any activities (used to choose positions source in getPositionsWithMarketValues). */
export async function hasActivitiesForAccount(accountId: string): Promise<boolean> {
  const db = await getDb();
  const count = await db.collection(COLLECTION).countDocuments({ accountId }, { limit: 1 });
  return count > 0;
}

/** List activities for an account, newest first. _id returned as string for API. */
export async function getActivitiesForAccount(accountId: string): Promise<Array<Omit<Activity, "_id"> & { _id: string }>> {
  const db = await getDb();
  const list = await db
    .collection<Activity & { _id?: ObjectId }>(COLLECTION)
    .find({ accountId })
    .sort({ date: -1, createdAt: -1 })
    .toArray();
  return list.map((a) => {
    const { _id, ...rest } = a;
    const rawId: unknown = _id;
    const idStr = rawId instanceof ObjectId ? rawId.toString() : String(rawId ?? "");
    return { _id: idStr, ...rest };
  });
}

/**
 * Validate account exists, sync activities (insert only those that don't already exist), then optionally recompute and set account.positions.
 * First-time import: all activities are new, so all are inserted and positions are created from them.
 * Re-import: only activities not already present are inserted; positions are recomputed from full activity history.
 * Returns null if account not found; otherwise { imported, positionsUpdated, positionsCount }.
 */
export async function importActivitiesForAccount(
  accountId: string,
  activities: ActivityImportItem[],
  recomputePositions: boolean
): Promise<ImportActivitiesResult | null> {
  const db = await getDb();
  const account = await db.collection("accounts").findOne({
    _id: new ObjectId(accountId),
  });
  if (!account) return null;

  const existing = await db
    .collection<Activity>(COLLECTION)
    .find({ accountId })
    .project({
      date: 1,
      symbol: 1,
      type: 1,
      quantity: 1,
      unitPrice: 1,
      optionType: 1,
      strike: 1,
      expiration: 1,
    })
    .toArray();
  type SigShape = Parameters<typeof activitySignature>[0];
  const existingSigs = new Set(existing.map((a) => activitySignature(a as SigShape)));

  const toInsert = activities.filter((item) => {
    const sig = activitySignature(item);
    return !existingSigs.has(sig);
  });

  const imported = await insertActivities(accountId, toInsert);
  let positionsUpdated = false;
  let positionsCount = 0;
  if (recomputePositions) {
    const positions = await recomputePositionsFromActivities(accountId);
    positionsCount = positions.length;
    positionsUpdated = await setAccountPositions(accountId, positions);
    if (RECOMPUTE_DEBUG) {
      console.debug("[import] accountId=%s imported=%d positionsCount=%d positionsUpdated=%s", accountId, imported, positionsCount, positionsUpdated);
    }
  }
  return { imported, positionsUpdated, positionsCount };
}
