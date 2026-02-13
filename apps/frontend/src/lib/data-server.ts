/**
 * Server-only data helpers for RSC (holdings, alerts pages).
 * Use getDb() — do not import from client.
 */

import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { Account } from "@/types/portfolio";

type AccountDoc = Omit<Account, "_id"> & { _id: ObjectId };

/** Fetch all accounts for server components. _id serialized to string. */
export async function getAccountsServer(): Promise<Account[]> {
  const db = await getDb();
  const docs = await db.collection<AccountDoc>("accounts").find({}).toArray();
  return docs.map((a) => ({
    ...a,
    _id: a._id.toString(),
  }));
}

export type AlertsFilterServer = {
  accountId?: string;
  unacknowledged?: boolean;
  type?: string;
  symbol?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

export type AlertRecordServer = {
  _id: string;
  accountId?: string;
  accountName?: string;
  symbol: string;
  recommendation: string;
  severity?: string;
  reason: string;
  type?: string;
  deliveryStatus?: Record<string, { channel: string; status: string; sentAt?: string; error?: string }>;
  details?: {
    currentPrice?: number;
    entryPrice?: number;
    priceChange?: number;
    priceChangePercent?: number;
    daysToExpiration?: number;
  };
  metrics?: {
    stockPrice?: number;
    callBid?: number;
    callAsk?: number;
    dte?: number;
    pl?: number;
    plPercent?: number;
    underlyingPrice?: number;
    unitCost?: number;
  };
  suggestedActions?: string[];
  riskWarning?: string;
  createdAt: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
};

/** Fetch alerts for server components. */
export async function getAlertsServer(filter: AlertsFilterServer = {}): Promise<AlertRecordServer[]> {
  const db = await getDb();
  const query: Record<string, unknown> = {};
  if (filter.accountId) query.accountId = filter.accountId;
  if (filter.unacknowledged !== false) query.acknowledged = false;
  if (filter.type) query.type = filter.type;
  if (filter.symbol) query.symbol = new RegExp(filter.symbol, "i");
  if (filter.dateFrom || filter.dateTo) {
    query.createdAt = {};
    if (filter.dateFrom) (query.createdAt as Record<string, string>).$gte = `${filter.dateFrom}T00:00:00.000Z`;
    if (filter.dateTo) (query.createdAt as Record<string, string>).$lte = `${filter.dateTo}T23:59:59.999Z`;
  }
  const limit = filter.limit ?? 100;
  const alerts = await db
    .collection("alerts")
    .find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return alerts.map((a) => ({
    ...a,
    _id: typeof a._id === "string" ? a._id : (a._id as ObjectId).toString(),
  })) as AlertRecordServer[];
}
