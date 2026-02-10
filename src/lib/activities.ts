/**
 * Activities (transaction log) for ghostbranch: insert and recompute positions.
 * See docs/ghostbranch-feature.md.
 */

import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { Activity, ActivityImportItem, Position } from "@/types/portfolio";

const COLLECTION = "activities";

type ActivityDoc = Omit<Activity, "_id"> & { _id?: ObjectId };

/** Insert activities for an account. Returns inserted count. */
export async function insertActivities(
  accountId: string,
  items: ActivityImportItem[],
  dataSource: Activity["dataSource"] = "IMPORT"
): Promise<number> {
  if (items.length === 0) return 0;
  const db = await getDb();
  const now = new Date().toISOString();
  const docs: ActivityDoc[] = items.map((item) => ({
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
    optionType: item.optionType,
    strike: item.strike,
    expiration: item.expiration,
    createdAt: now,
    updatedAt: now,
  }));
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

/** Recompute positions from activities for an account. Returns positions suitable for account.positions (stocks + options only; cash not derived from BUY/SELL). */
export async function recomputePositionsFromActivities(accountId: string): Promise<Position[]> {
  const db = await getDb();
  const activities = await db
    .collection<Activity>(COLLECTION)
    .find({ accountId })
    .sort({ date: 1 })
    .toArray();

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
    const key = positionKey(a);
    if (!byKey.has(key)) {
      byKey.set(key, {
        symbol: a.symbol,
        optionType: a.optionType,
        strike: a.strike,
        expiration: a.expiration,
        totalQty: 0,
        totalCost: 0,
      });
    }
    const agg = byKey.get(key)!;
    const qty = a.type === "BUY" ? a.quantity : a.type === "SELL" ? -a.quantity : 0;
    const cost = (a.type === "BUY" ? 1 : a.type === "SELL" ? -1 : 0) * a.quantity * a.unitPrice;
    if (a.fee != null) {
      if (a.type === "BUY") agg.totalCost += a.fee;
      else if (a.type === "SELL") agg.totalCost -= a.fee;
    }
    agg.totalQty += qty;
    agg.totalCost += cost;
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
};

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
 * Validate account exists, insert activities, optionally recompute and set account.positions.
 * Returns null if account not found; otherwise { imported, positionsUpdated }.
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

  const imported = await insertActivities(accountId, activities);
  let positionsUpdated = false;
  if (recomputePositions) {
    const positions = await recomputePositionsFromActivities(accountId);
    positionsUpdated = await setAccountPositions(accountId, positions);
  }
  return { imported, positionsUpdated };
}
