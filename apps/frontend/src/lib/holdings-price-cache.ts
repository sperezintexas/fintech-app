/**
 * Holdings price cache (Phase 1: stocks; Phase 2: options).
 * Job refreshHoldingsPrices fetches stock prices and option premiums, upserts into priceCache and optionPriceCache.
 * During market hours: run every 15 min; outside market hours: run every 1 hr (throttled in job).
 */

import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { isMarketHours as isMarketOpenFromCalendar } from "@/lib/market-calendar";
import { getMultipleTickerPrices, getOptionPremiumForPosition } from "@/lib/yahoo";
import type { Position } from "@/types/portfolio";

function getUnderlyingFromTicker(ticker: string): string {
  return ticker?.replace(/\d.*$/, "").toUpperCase() ?? ticker?.toUpperCase() ?? "";
}

/** Merrill-style cash/money market tickers (e.g. IIAXX) are not on Yahoo; skip fetch and use placeholder. */
function isYahooUnsupportedTicker(symbol: string): boolean {
  const u = symbol?.toUpperCase() ?? "";
  return u === "IIAXX" || /^[A-Z]+XX$/i.test(u);
}

function getHeldSymbolsFromAccounts(accounts: Array<{ positions?: Position[] }>): Set<string> {
  const set = new Set<string>();
  for (const acc of accounts) {
    const positions = acc.positions ?? [];
    for (const p of positions) {
      if (!p.ticker) continue;
      if (p.type === "stock") set.add(p.ticker.toUpperCase());
      else if (p.type === "option") set.add(getUnderlyingFromTicker(p.ticker));
    }
  }
  return set;
}

/** Cache considered fresh: during market hours < 20 min, otherwise < 2 hr. */
const CACHE_TTL_MARKET_MS = 20 * 60 * 1000;
const CACHE_TTL_OFF_MARKET_MS = 2 * 60 * 60 * 1000;

export function isPriceCacheFresh(updatedAt: string): boolean {
  const updated = new Date(updatedAt).getTime();
  const now = Date.now();
  const ttl = isMarketOpenFromCalendar() ? CACHE_TTL_MARKET_MS : CACHE_TTL_OFF_MARKET_MS;
  return now - updated <= ttl;
}

export type PriceCacheEntry = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  updatedAt: string;
};

export type OptionPriceCacheEntry = {
  symbol: string;
  expiration: string;
  strike: number;
  optionType: "call" | "put";
  price: number;
  updatedAt: string;
};

/** 9:30 AM–4:00 PM ET, weekdays, excluding US market holidays (uses market-calendar). */
export function isMarketHours(): boolean {
  return isMarketOpenFromCalendar();
}

/**
 * Refresh stock prices for all symbols held in accounts and upsert into priceCache collection.
 * Phase 1: stocks only (option premiums in Phase 2).
 */
export async function refreshHoldingsPricesStock(): Promise<{
  symbolsRequested: number;
  symbolsUpdated: number;
  error?: string;
}> {
  const db = await getDb();
  type AccountDoc = { _id: ObjectId; positions?: Position[] };
  const accounts = await db
    .collection<AccountDoc>("accounts")
    .find({})
    .project({ _id: 1, positions: 1 })
    .toArray();

  const symbols = getHeldSymbolsFromAccounts(accounts);
  const symbolList = Array.from(symbols).filter(Boolean);
  const yahooSymbols = symbolList.filter((s) => !isYahooUnsupportedTicker(s));
  const skippedSymbols = symbolList.filter((s) => isYahooUnsupportedTicker(s));

  if (symbolList.length === 0) {
    return { symbolsRequested: 0, symbolsUpdated: 0 };
  }

  let priceMap: Map<string, { price: number; change: number; changePercent: number }>;
  try {
    priceMap = await getMultipleTickerPrices(yahooSymbols);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[holdings-price-cache] getMultipleTickerPrices failed:", msg);
    return { symbolsRequested: symbolList.length, symbolsUpdated: 0, error: msg };
  }

  const now = new Date().toISOString();
  const coll = db.collection<PriceCacheEntry>("priceCache");
  let updated = 0;
  for (const [symbol, data] of priceMap) {
    await coll.updateOne(
      { symbol },
      {
        $set: {
          symbol,
          price: data.price,
          change: data.change,
          changePercent: data.changePercent,
          updatedAt: now,
        },
      },
      { upsert: true }
    );
    updated++;
  }
  // Placeholder for Merrill-style cash tickers (IIAXX, *XX) not on Yahoo
  for (const symbol of skippedSymbols) {
    await coll.updateOne(
      { symbol: symbol.toUpperCase() },
      {
        $set: {
          symbol: symbol.toUpperCase(),
          price: 1,
          change: 0,
          changePercent: 0,
          updatedAt: now,
        },
      },
      { upsert: true }
    );
    updated++;
  }

  return { symbolsRequested: symbolList.length, symbolsUpdated: updated };
}

/** Composite key for option cache lookup. */
function optionCacheKey(symbol: string, expiration: string, strike: number, optionType: string): string {
  return `${symbol.toUpperCase()}|${expiration}|${strike}|${optionType}`;
}

/**
 * Refresh option premiums for all option positions held in accounts; upsert into optionPriceCache.
 * Phase 2: runs after refreshHoldingsPricesStock in the same job.
 */
export async function refreshHoldingsPricesOptions(): Promise<{
  optionsRequested: number;
  optionsUpdated: number;
  error?: string;
}> {
  const db = await getDb();
  type AccountDoc = { _id: ObjectId; positions?: Position[] };
  const accounts = await db
    .collection<AccountDoc>("accounts")
    .find({})
    .project({ _id: 1, positions: 1 })
    .toArray();

  const keys: Array<{ symbol: string; expiration: string; strike: number; optionType: "call" | "put" }> = [];
  const seen = new Set<string>();
  for (const acc of accounts) {
    const positions = acc.positions ?? [];
    for (const p of positions) {
      if (p.type !== "option" || !p.ticker || !p.expiration || p.strike == null) continue;
      const symbol = getUnderlyingFromTicker(p.ticker);
      if (!symbol) continue;
      const optionType = (p.optionType ?? "call") as "call" | "put";
      const key = optionCacheKey(symbol, p.expiration, p.strike, optionType);
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push({ symbol, expiration: p.expiration, strike: p.strike, optionType });
    }
  }
  if (keys.length === 0) {
    return { optionsRequested: 0, optionsUpdated: 0 };
  }

  const BATCH = 15;
  let updated = 0;
  const now = new Date().toISOString();
  const coll = db.collection<OptionPriceCacheEntry>("optionPriceCache");

  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = keys.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (k) => {
        try {
          const price = await getOptionPremiumForPosition(k.symbol, k.expiration, k.strike, k.optionType);
          return { ...k, price };
        } catch (e) {
          console.warn(`[holdings-price-cache] option ${k.symbol} ${k.expiration} ${k.strike} ${k.optionType}:`, e instanceof Error ? e.message : e);
          return null;
        }
      })
    );
    for (const r of results) {
      if (r == null || r.price == null) continue;
      const entry: OptionPriceCacheEntry = {
        symbol: r.symbol,
        expiration: r.expiration,
        strike: r.strike,
        optionType: r.optionType,
        price: r.price,
        updatedAt: now,
      };
      await coll.updateOne(
        { symbol: entry.symbol, expiration: entry.expiration, strike: entry.strike, optionType: entry.optionType },
        { $set: entry },
        { upsert: true }
      );
      updated++;
    }
  }

  return { optionsRequested: keys.length, optionsUpdated: updated };
}

/**
 * Read stock prices from priceCache for the given symbols. Returns map of symbol -> entry (no freshness check).
 */
export async function getCachedStockPrices(
  symbols: string[]
): Promise<Map<string, PriceCacheEntry>> {
  if (symbols.length === 0) return new Map();
  const db = await getDb();
  const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean);
  const docs = await db
    .collection<PriceCacheEntry>("priceCache")
    .find({ symbol: { $in: unique } })
    .toArray();
  const map = new Map<string, PriceCacheEntry>();
  for (const d of docs) map.set(d.symbol, d);
  return map;
}

/**
 * Read option premiums from optionPriceCache. Keys are (symbol, expiration, strike, optionType).
 * Returns map keyed by optionCacheKey(symbol, expiration, strike, optionType) -> price.
 */
export async function getCachedOptionPremiums(
  keys: Array<{ symbol: string; expiration: string; strike: number; optionType: "call" | "put" }>
): Promise<Map<string, { price: number; updatedAt: string }>> {
  if (keys.length === 0) return new Map();
  const db = await getDb();
  const seen = new Set<string>();
  const uniqueKeys = keys.filter((k) => {
    const key = optionCacheKey(k.symbol, k.expiration, k.strike, k.optionType);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const $or = uniqueKeys.map((k) => ({
    symbol: k.symbol.toUpperCase(),
    expiration: k.expiration,
    strike: k.strike,
    optionType: k.optionType,
  }));
  const docs = await db.collection<OptionPriceCacheEntry>("optionPriceCache").find({ $or }).toArray();
  const result = new Map<string, { price: number; updatedAt: string }>();
  for (const doc of docs) {
    result.set(optionCacheKey(doc.symbol, doc.expiration, doc.strike, doc.optionType), {
      price: doc.price,
      updatedAt: doc.updatedAt,
    });
  }
  return result;
}

export { optionCacheKey };
