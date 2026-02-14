/**
 * Symbol logo cache: in-memory + MongoDB collection to avoid Yahoo lookup on every
 * price refresh or page load. Resolve logo URL once per symbol, then serve from cache.
 */

import YahooFinance from "yahoo-finance2";
import { getDb } from "@/lib/mongodb";

const TICKER_LOGOS_CDN = "https://cdn.tickerlogos.com";
const COLLECTION = "symbols";

/** In-memory cache: symbol (upper) -> { logoUrl, updatedAt }. Max size to avoid unbounded growth. */
const MAX_MEMORY_ENTRIES = 5_000;
const memoryCache = new Map<string, { logoUrl: string; updatedAt: number }>();

function evictOneIfFull(): void {
  if (memoryCache.size < MAX_MEMORY_ENTRIES) return;
  const firstKey = memoryCache.keys().next().value;
  if (firstKey !== undefined) memoryCache.delete(firstKey);
}

function websiteToLogoUrl(website: string): string | null {
  try {
    const hostname = new URL(
      website.startsWith("http") ? website : `https://${website}`
    ).hostname.replace(/^www\./, "");
    return hostname ? `${TICKER_LOGOS_CDN}/${hostname}` : null;
  } catch {
    return null;
  }
}

/** Fetch logo URL from Yahoo (summaryProfile.website) and return CDN URL or null. */
async function fetchLogoFromYahoo(symbol: string): Promise<string | null> {
  const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  const summary = await yahoo.quoteSummary(symbol, { modules: ["summaryProfile"] });
  const profile = summary?.summaryProfile as { website?: string } | undefined;
  const website = profile?.website;
  if (!website || typeof website !== "string") return null;
  return websiteToLogoUrl(website);
}

export type SymbolLogoDoc = {
  _id?: unknown;
  symbol: string;
  logoUrl: string;
  website?: string;
  updatedAt: Date;
};

/**
 * Get logo URL for a ticker. Checks in-memory cache, then MongoDB, then Yahoo.
 * On miss, persists to MongoDB and memory. Returns null if symbol has no logo.
 */
export async function getSymbolLogoUrl(symbol: string): Promise<string | null> {
  const upper = (symbol ?? "").toUpperCase().trim();
  if (!upper) return null;

  const cached = memoryCache.get(upper);
  if (cached) return cached.logoUrl;

  const db = await getDb();
  const doc = await db
    .collection<SymbolLogoDoc>(COLLECTION)
    .findOne({ symbol: upper }, { projection: { logoUrl: 1 } });
  if (doc?.logoUrl) {
    memoryCache.set(upper, { logoUrl: doc.logoUrl, updatedAt: Date.now() });
    evictOneIfFull();
    return doc.logoUrl;
  }

  const logoUrl = await fetchLogoFromYahoo(upper);
  if (!logoUrl) return null;

  const now = new Date();
  await db.collection<SymbolLogoDoc>(COLLECTION).updateOne(
    { symbol: upper },
    { $set: { symbol: upper, logoUrl, updatedAt: now } },
    { upsert: true }
  );
  memoryCache.set(upper, { logoUrl, updatedAt: now.getTime() });
  evictOneIfFull();
  return logoUrl;
}

/**
 * Get logo URLs for multiple symbols in one go. Uses cache + batch DB lookup;
 * only fetches from Yahoo for misses. Returns Map(symbol -> logoUrl); missing symbols are absent.
 */
export async function getSymbolLogoUrls(
  symbols: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = [...new Set(symbols.map((s) => s.toUpperCase().trim()).filter(Boolean))];
  if (unique.length === 0) return result;

  const toFetch: string[] = [];
  for (const sym of unique) {
    const fromMem = memoryCache.get(sym);
    if (fromMem) {
      result.set(sym, fromMem.logoUrl);
      continue;
    }
    toFetch.push(sym);
  }

  if (toFetch.length > 0) {
    const db = await getDb();
    const docs = await db
      .collection<SymbolLogoDoc>(COLLECTION)
      .find({ symbol: { $in: toFetch } }, { projection: { symbol: 1, logoUrl: 1 } })
      .toArray();
    const stillMissing: string[] = [];
    for (const d of docs) {
      result.set(d.symbol, d.logoUrl);
      memoryCache.set(d.symbol, { logoUrl: d.logoUrl, updatedAt: Date.now() });
      evictOneIfFull();
    }
    for (const sym of toFetch) {
      if (!result.has(sym)) stillMissing.push(sym);
    }
    for (const sym of stillMissing) {
      const logoUrl = await fetchLogoFromYahoo(sym);
      if (logoUrl) {
        result.set(sym, logoUrl);
        const now = new Date();
        await db.collection<SymbolLogoDoc>(COLLECTION).updateOne(
          { symbol: sym },
          { $set: { symbol: sym, logoUrl, updatedAt: now } },
          { upsert: true }
        );
        memoryCache.set(sym, { logoUrl, updatedAt: now.getTime() });
        evictOneIfFull();
      }
    }
  }

  return result;
}
