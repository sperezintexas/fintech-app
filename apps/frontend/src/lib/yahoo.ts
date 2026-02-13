/**
 * Yahoo Finance API integration
 * Replaces Polygon.io to avoid rate limiting issues
 * Uses yahoo-finance2 v3 package for reliable, free market data
 *
 * v3 requires instantiating the class: const yahooFinance = new YahooFinance();
 */

import YahooFinance from "yahoo-finance2";
import type { MarketConditions } from "@/types/portfolio";
import { getMarketState } from "@/lib/market-calendar";

// Initialize Yahoo Finance instance (v3 requirement)
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Major indices ETFs and VIX to track
const INDEX_TICKERS = [
  { symbol: "SPY", name: "S&P 500" },
  { symbol: "QQQ", name: "Nasdaq 100" },
  { symbol: "DIA", name: "Dow Jones" },
  { symbol: "IWM", name: "Russell 2000" },
  { symbol: "^VIX", name: "CBOE Volatility Index (VIX)" },
];

// Cache for market data (refreshes every 5 minutes)
let marketDataCache: {
  data: Map<string, { close: number; open: number; high: number; low: number; volume: number; previousClose?: number }>;
  timestamp: number;
} | null = null;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Determine market status from market calendar (NYSE/NASDAQ hours + holidays)
function getMarketStatus(): MarketConditions["status"] {
  return getMarketState(new Date());
}

// Get quote data for a single ticker with full OHLC
async function getTickerQuote(ticker: string): Promise<{
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  previousClose?: number;
} | null> {
  try {
    const quote = await yahooFinance.quote(ticker);

    if (!quote || !quote.regularMarketPrice) {
      return null;
    }

    return {
      close: quote.regularMarketPrice,
      open: quote.regularMarketOpen || quote.regularMarketPrice,
      high: quote.regularMarketDayHigh || quote.regularMarketPrice,
      low: quote.regularMarketDayLow || quote.regularMarketPrice,
      volume: quote.regularMarketVolume || 0,
      previousClose: quote.regularMarketPreviousClose,
    };
  } catch (error) {
    console.error(`Error fetching quote for ${ticker}:`, error);
    return null;
  }
}

// Get single ticker price
export async function getTickerPrice(
  ticker: string
): Promise<{ price: number; change: number; changePercent: number } | null> {
  const quote = await getTickerQuote(ticker.toUpperCase());
  if (!quote) return null;

  const previousClose = quote.previousClose || quote.open;
  const change = quote.close - previousClose;
  const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

  return {
    price: quote.close,
    change,
    changePercent,
  };
}

// Get prices for multiple tickers (uses batch fetching)
export async function getMultipleTickerPrices(
  tickers: string[]
): Promise<Map<string, { price: number; change: number; changePercent: number; open?: number; high?: number; low?: number; volume?: number; previousClose?: number }>> {
  const priceMap = new Map<
    string,
    { price: number; change: number; changePercent: number; open?: number; high?: number; low?: number; volume?: number; previousClose?: number }
  >();

  if (tickers.length === 0) return priceMap;

  try {
    // Fetch all quotes in parallel (yahoo-finance2 handles batching internally)
    const upperTickers = tickers.map(t => t.toUpperCase());

    const quotePromises = upperTickers.map(async (ticker) => {
      try {
        const quote = await yahooFinance.quote(ticker);

        if (quote && quote.regularMarketPrice) {
          const previousClose = quote.regularMarketPreviousClose || quote.regularMarketOpen || quote.regularMarketPrice;
          const change = quote.regularMarketPrice - previousClose;
          const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

          priceMap.set(ticker, {
            price: quote.regularMarketPrice,
            change,
            changePercent,
            open: quote.regularMarketOpen,
            high: quote.regularMarketDayHigh,
            low: quote.regularMarketDayLow,
            volume: quote.regularMarketVolume,
            previousClose,
          });

          // Update cache
          if (!marketDataCache || Date.now() - marketDataCache.timestamp >= CACHE_TTL) {
            marketDataCache = {
              data: new Map(),
              timestamp: Date.now(),
            };
          }

          marketDataCache.data.set(ticker, {
            close: quote.regularMarketPrice,
            open: quote.regularMarketOpen || quote.regularMarketPrice,
            high: quote.regularMarketDayHigh || quote.regularMarketPrice,
            low: quote.regularMarketDayLow || quote.regularMarketPrice,
            volume: quote.regularMarketVolume || 0,
            previousClose,
          });
        }
      } catch (error) {
        console.error(`Error fetching quote for ${ticker}:`, error);
      }
    });

    await Promise.all(quotePromises);

    // Log any missing tickers
    const missing = tickers.filter(t => !priceMap.has(t.toUpperCase()));
    if (missing.length > 0) {
      console.log(`Tickers not found: ${missing.join(", ")}`);
    }
  } catch (error) {
    console.error("Error fetching multiple ticker prices:", error);
  }

  return priceMap;
}

// Get full OHLC data for multiple tickers (improved with full OHLC)
export async function getMultipleTickerOHLC(
  tickers: string[]
): Promise<Map<string, { open: number; high: number; low: number; close: number; volume: number; previousClose?: number }>> {
  const ohlcMap = new Map<string, { open: number; high: number; low: number; close: number; volume: number; previousClose?: number }>();

  if (tickers.length === 0) return ohlcMap;

  try {
    const upperTickers = tickers.map(t => t.toUpperCase());

    const quotePromises = upperTickers.map(async (ticker) => {
      try {
        const quote = await yahooFinance.quote(ticker);

        if (quote && quote.regularMarketPrice) {
          const ohlc = {
            open: quote.regularMarketOpen || quote.regularMarketPrice,
            high: quote.regularMarketDayHigh || quote.regularMarketPrice,
            low: quote.regularMarketDayLow || quote.regularMarketPrice,
            close: quote.regularMarketPrice,
            volume: quote.regularMarketVolume || 0,
            previousClose: quote.regularMarketPreviousClose,
          };

          ohlcMap.set(ticker, ohlc);

          // Update cache
          if (!marketDataCache || Date.now() - marketDataCache.timestamp >= CACHE_TTL) {
            marketDataCache = {
              data: new Map(),
              timestamp: Date.now(),
            };
          }
          marketDataCache.data.set(ticker, ohlc);
        }
      } catch (error) {
        console.error(`Error fetching OHLC for ${ticker}:`, error);
      }
    });

    await Promise.all(quotePromises);
  } catch (error) {
    console.error("Error fetching multiple ticker OHLC:", error);
  }

  return ohlcMap;
}

// Get grouped daily data (for compatibility with old Polygon API)
export async function getGroupedDailyData(): Promise<Map<string, { close: number; open: number; high: number; low: number; volume: number }>> {
  // Return cached data if still valid
  if (marketDataCache && Date.now() - marketDataCache.timestamp < CACHE_TTL) {
    return marketDataCache.data;
  }

  const dataMap = new Map<string, { close: number; open: number; high: number; low: number; volume: number }>();

  // If we have stale cache, return it
  if (marketDataCache) {
    console.log("Returning stale cached data, will refresh on next request");
    return marketDataCache.data;
  }

  return dataMap;
}

// Get market conditions with indices
export async function getMarketConditions(): Promise<MarketConditions> {
  const status = getMarketStatus();

  // Fetch indices in batch
  const indexSymbols = INDEX_TICKERS.map(idx => idx.symbol);
  const indexQuotes = await getMultipleTickerPrices(indexSymbols);

  const indices = INDEX_TICKERS.map((indexInfo) => {
    const data = indexQuotes.get(indexInfo.symbol);

    if (data) {
      return {
        symbol: indexInfo.symbol,
        name: indexInfo.name,
        price: data.price,
        change: data.change,
        changePercent: data.changePercent,
      };
    }

    // Fallback if not found
    return {
      symbol: indexInfo.symbol,
      name: indexInfo.name,
      price: 0,
      change: 0,
      changePercent: 0,
    };
  });

  return {
    status,
    indices,
    lastUpdated: new Date().toISOString(),
  };
}

// Search symbols
export async function searchSymbols(query: string): Promise<Array<{ symbol: string; name: string; type: string }>> {
  try {
    const results = await yahooFinance.search(query);
    return (results.quotes ?? []).map((q) => ({
      symbol: String(q.symbol ?? ''),
      name: String(q.shortname ?? q.longname ?? ''),
      type: String(q.quoteType ?? 'EQUITY'),
    }));
  } catch (error) {
    console.error('Symbol search error:', error);
    return [];
  }
}

// Get option chain for a symbol (yahoo-finance2 uses .options())
export async function getOptionChain(
  symbol: string,
  date: number | string = Date.now()
): Promise<unknown | null> {
  try {
    const dateObj = typeof date === "number" ? new Date(date) : new Date(date);
    const result = await yahooFinance.options(symbol.toUpperCase(), { date: dateObj });
    return result;
  } catch (error) {
    console.error(`Error fetching option chain for ${symbol}:`, error);
    return null;
  }
}

// Option metrics for scanner/analyzers
export type OptionMetrics = {
  price: number;
  bid: number;
  ask: number;
  underlyingPrice: number;
  intrinsicValue: number;
  timeValue: number;
  impliedVolatility?: number;
  /** Put delta (e.g. -0.3); call delta (e.g. 0.5). From Yahoo when available. */
  delta?: number;
};

/** Normalize expiration to YYYY-MM-DD for comparison and API. Handles YYYY-MM-DD, YYYYMMDD, YYMMDD. */
function normalizeExpiration(expiration: string): string {
  const s = expiration.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const digits = expiration.replace(/\D/g, "").slice(-8);
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  if (digits.length === 6) {
    const yy = parseInt(digits.slice(0, 2), 10);
    const year = yy >= 0 && yy <= 50 ? 2000 + yy : 1900 + yy;
    return `${year}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
  }
  return s;
}

export async function getOptionMetrics(
  symbol: string,
  expiration: string,
  strike: number,
  optionType: "call" | "put"
): Promise<OptionMetrics | null> {
  try {
    const stockQuote = await yahooFinance.quote(symbol.toUpperCase());
    const stockPrice = stockQuote?.regularMarketPrice ?? 0;
    if (!stockPrice) return null;

    const expNorm = normalizeExpiration(expiration);
    const expDate = new Date(expNorm + "T12:00:00Z");
    const chain = await yahooFinance.options(symbol.toUpperCase(), { date: expDate });
    const opts = (chain as { options?: { expirationDate: Date; calls: unknown[]; puts: unknown[] }[] }).options;
    if (!opts?.length) return null;

    const expTarget = expNorm.slice(0, 10);
    const group = opts.find((g) => {
      const d = g.expirationDate instanceof Date ? g.expirationDate : new Date(g.expirationDate);
      return d.toISOString().slice(0, 10) === expTarget;
    }) ?? opts[0];

    const contracts = (optionType === "call" ? (group.calls ?? []) : (group.puts ?? [])) as { strike?: number }[];
    const c = contracts.find((x) => Math.abs((x.strike ?? 0) - strike) < 0.01);
    if (!c) return null;

    const c2 = c as {
      lastPrice?: number;
      bid?: number;
      ask?: number;
      strike?: number;
      impliedVolatility?: number;
      delta?: number;
    };
    const bid = c2.bid ?? 0;
    const ask = c2.ask ?? 0;
    const premium = (c2.lastPrice ?? 0) > 0 ? c2.lastPrice! : bid > 0 && ask > 0 ? (bid + ask) / 2 : bid || ask || 0;
    const intrinsic = optionType === "call"
      ? Math.max(0, stockPrice - strike)
      : Math.max(0, strike - stockPrice);
    const timeVal = Math.max(0, premium - intrinsic);
    const iv = c2.impliedVolatility ?? undefined;
    const delta = c2.delta;

    return {
      price: premium,
      bid,
      ask,
      underlyingPrice: stockPrice,
      intrinsicValue: intrinsic,
      timeValue: timeVal,
      impliedVolatility: iv,
      ...(delta != null && { delta }),
    };
  } catch {
    return null;
  }
}

// Market conditions for options (VIX + trend)
export type OptionMarketConditions = {
  vix: number;
  vixLevel: string;
  trend: string;
  symbolChangePercent?: number;
};

export async function getOptionMarketConditions(symbol?: string): Promise<OptionMarketConditions> {
  try {
    const vixQuote = await yahooFinance.quote("^VIX");
    const vix = vixQuote?.regularMarketPrice ?? 0;
    const vixLevel = vix < 15 ? "low" : vix < 25 ? "moderate" : "high";

    let trend = "neutral";
    let symbolChangePercent: number | undefined;
    if (symbol) {
      const symQuote = await yahooFinance.quote(symbol.toUpperCase());
      const prev = symQuote?.regularMarketPreviousClose ?? symQuote?.regularMarketPrice ?? 0;
      const price = symQuote?.regularMarketPrice ?? 0;
      if (prev > 0) {
        symbolChangePercent = ((price - prev) / prev) * 100;
        if (symbolChangePercent > 0.5) trend = "up";
        else if (symbolChangePercent < -0.5) trend = "down";
      }
    } else {
      const spyQuote = await yahooFinance.quote("SPY");
      const prev = spyQuote?.regularMarketPreviousClose ?? spyQuote?.regularMarketPrice ?? 0;
      const price = spyQuote?.regularMarketPrice ?? 0;
      if (prev > 0) {
        symbolChangePercent = ((price - prev) / prev) * 100;
        if (symbolChangePercent > 0.5) trend = "up";
        else if (symbolChangePercent < -0.5) trend = "down";
      }
    }

    return { vix, vixLevel, trend, symbolChangePercent };
  } catch {
    return { vix: 0, vixLevel: "moderate", trend: "neutral" };
  }
}

/** Option chain shape returned by getOptionChainDetailed (shared cache type). */
export type OptionChainDetailedData = {
  stock: { price: number };
  calls: { strike?: number; bid?: number; ask?: number; impliedVolatility?: number }[];
  puts: { strike?: number; bid?: number; ask?: number; impliedVolatility?: number }[];
};

// Detailed option chain (for analyzers) - shape: { stock: { price }, calls, puts }
export async function getOptionChainDetailed(symbol: string): Promise<OptionChainDetailedData | null> {
  try {
    const result = await yahooFinance.options(symbol.toUpperCase());
    const r = result as {
      quote?: { regularMarketPrice?: number };
      options?: { calls: unknown[]; puts: unknown[] }[];
    };
    const stockPrice = r.quote?.regularMarketPrice ?? 0;
    const opts = r.options ?? [];
    const g = opts[0];
    const calls = (g?.calls ?? []).map((c) => {
      const x = c as { strike?: number; bid?: number; ask?: number; impliedVolatility?: number };
      return { strike: x.strike, bid: x.bid, ask: x.ask, impliedVolatility: x.impliedVolatility };
    });
    const puts = (g?.puts ?? []).map((p) => {
      const x = p as { strike?: number; bid?: number; ask?: number; impliedVolatility?: number };
      return { strike: x.strike, bid: x.bid, ask: x.ask, impliedVolatility: x.impliedVolatility };
    });
    return { stock: { price: stockPrice }, calls, puts };
  } catch {
    return null;
  }
}

/** Suggested covered call options: OTM calls expiring 1–14 days, ranked by premium (highest first). */
export async function getSuggestedCoveredCallOptions(
  symbol: string,
  opts?: { minDte?: number; maxDte?: number; limit?: number }
): Promise<
  Array<{
    strike: number;
    expiration: string;
    dte: number;
    bid: number;
    ask: number;
    premium: number;
    otmPercent: number;
  }>
> {
  const minDte = opts?.minDte ?? 1;
  const maxDte = opts?.maxDte ?? 14;
  const limit = opts?.limit ?? 10;

  try {
    const result = await yahooFinance.options(symbol.toUpperCase());
    const r = result as {
      quote?: { regularMarketPrice?: number };
      expirationDates?: (Date | string)[];
      options?: { expirationDate: Date | string; calls: { strike?: number; bid?: number; ask?: number; lastPrice?: number }[] }[];
    };
    const stockPrice = r.quote?.regularMarketPrice ?? 0;
    if (!stockPrice) return [];

    const now = Date.now();
    const minExp = now + minDte * 24 * 60 * 60 * 1000;
    const maxExp = now + maxDte * 24 * 60 * 60 * 1000;

    const candidates: Array<{
      strike: number;
      expiration: string;
      dte: number;
      bid: number;
      ask: number;
      premium: number;
      otmPercent: number;
    }> = [];

    const optsArr = r.options ?? [];
    const expDates = r.expirationDates ?? [];

    const collectFromGroup = (
      group: { expirationDate: Date | string; calls: { strike?: number; bid?: number; ask?: number; lastPrice?: number }[] }
    ) => {
      const expDate = group.expirationDate instanceof Date ? group.expirationDate : new Date(group.expirationDate);
      const expMs = expDate.getTime();
      if (expMs < minExp || expMs > maxExp) return;

      const expStr = expDate.toISOString().slice(0, 10);
      const dte = Math.max(0, Math.ceil((expMs - now) / (24 * 60 * 60 * 1000)));

      for (const c of group.calls ?? []) {
        const strike = c.strike ?? 0;
        if (strike <= stockPrice) continue;

        const bid = c.bid ?? 0;
        const ask = c.ask ?? 0;
        const premium = bid > 0 && ask > 0 ? (bid + ask) / 2 : (c.lastPrice ?? (bid || ask || 0));
        if (premium <= 0) continue;

        const otmPercent = ((strike - stockPrice) / stockPrice) * 100;
        candidates.push({ strike, expiration: expStr, dte, bid, ask, premium, otmPercent });
      }
    };

    for (const group of optsArr) {
      collectFromGroup(group);
    }

    if (candidates.length === 0 && expDates.length > 0) {
      for (const d of expDates) {
        const expDate = d instanceof Date ? d : new Date(d);
        const expMs = expDate.getTime();
        if (expMs < minExp || expMs > maxExp) continue;

        const chain = await yahooFinance.options(symbol.toUpperCase(), { date: expDate });
        const c2 = chain as { options?: { expirationDate: Date | string; calls: { strike?: number; bid?: number; ask?: number; lastPrice?: number }[] }[] };
        const group = c2.options?.[0];
        if (group) collectFromGroup(group);
      }
    }

    candidates.sort((a, b) => b.premium - a.premium);
    return candidates.slice(0, limit);
  } catch {
    return [];
  }
}

/** Probability OTM (0–99) for a short call: higher strike = higher prob OTM. Same formula as ReviewOrderStep. */
function probOtmCall(stockPrice: number, strike: number): number {
  if (!stockPrice || stockPrice <= 0) return 50;
  const otmPercent = ((strike - stockPrice) / stockPrice) * 100;
  if (otmPercent <= 0) return 0;
  return Math.min(99, Math.round(50 + otmPercent * 2));
}

/** Probability of assignment (0–100) for a short call; used in alerts and recommendations. */
export function probAssignmentCall(stockPrice: number, strike: number): number {
  return Math.max(0, Math.min(100, 100 - probOtmCall(stockPrice, strike)));
}

export type CoveredCallAlternative = {
  strike: number;
  expiration: string;
  dte: number;
  bid: number;
  ask: number;
  premium: number;
  credit: number;
  probOtm: number;
};

/**
 * Find covered call alternatives: same or next week, higher prob OTM (e.g. ~70%) and higher premium.
 * Uses getSuggestedCoveredCallOptions (1–14 DTE) then filters by minProbOtm and min credit.
 */
export async function getCoveredCallAlternatives(
  symbol: string,
  opts: {
    currentStrike: number;
    currentExpiration: string;
    currentCredit: number;
    quantity: number;
    minProbOtm?: number;
    limit?: number;
  }
): Promise<CoveredCallAlternative[]> {
  const minProbOtm = opts.minProbOtm ?? 70;
  const limit = opts.limit ?? 10;

  try {
    const quote = await yahooFinance.quote(symbol.toUpperCase());
    const stockPrice = quote?.regularMarketPrice ?? 0;
    if (!stockPrice) return [];

    const candidates = await getSuggestedCoveredCallOptions(symbol, {
      minDte: 1,
      maxDte: 14,
      limit: 30,
    });

    const results: CoveredCallAlternative[] = [];
    for (const c of candidates) {
      const probOtm = probOtmCall(stockPrice, c.strike);
      const credit = opts.quantity * c.premium * 100;
      if (probOtm < minProbOtm) continue;
      if (credit < opts.currentCredit) continue;
      results.push({
        strike: c.strike,
        expiration: c.expiration,
        dte: c.dte,
        bid: c.bid,
        ask: c.ask,
        premium: c.premium,
        credit,
        probOtm,
      });
    }

    results.sort((a, b) => b.premium - a.premium);
    return results.slice(0, limit);
  } catch {
    return [];
  }
}

// IV rank/percentile placeholder (0-100)
export async function getIVRankOrPercentile(symbol: string): Promise<number> {
  try {
    const chain = await yahooFinance.options(symbol.toUpperCase());
    const opts = (chain as { options?: { calls: { impliedVolatility?: number }[] }[] }).options;
    const calls = opts?.[0]?.calls ?? [];
    const ivs = calls
      .map((c) => c.impliedVolatility)
      .filter((v): v is number => typeof v === "number" && v > 0);
    if (ivs.length === 0) return 50;
    const avg = ivs.reduce((a, b) => a + b, 0) / ivs.length;
    return Math.min(100, Math.max(0, Math.round(avg * 100)));
  } catch {
    return 50;
  }
}

// Premium for a specific option position
export async function getOptionPremiumForPosition(
  underlying: string,
  expiration: string,
  strike: number,
  optionType: "call" | "put"
): Promise<number | null> {
  const metrics = await getOptionMetrics(underlying, expiration, strike, optionType);
  return metrics?.price ?? null;
}

// Market news and outlook (for chat)
export type MarketNewsOutlook = {
  news: { title?: string; summary?: string; date?: Date }[];
  outlook: { summary: string; sentiment: "bullish" | "neutral" | "bearish" };
};

const NEWS_CACHE_TTL = 10 * 60 * 1000;
let newsCache: { data: MarketNewsOutlook; timestamp: number } | null = null;

export async function getMarketNewsAndOutlook(opts?: { limit?: number; region?: string }): Promise<MarketNewsOutlook> {
  if (newsCache && Date.now() - newsCache.timestamp < NEWS_CACHE_TTL) {
    return newsCache.data;
  }
  try {
    const limit = opts?.limit ?? 10;
    const trending = await yahooFinance.trendingSymbols("US");
    const quotes = trending?.quotes ?? [];
    const symbols = quotes.slice(0, 5).map((q) => (q as { symbol?: string }).symbol).filter(Boolean) as string[];
    const news: MarketNewsOutlook["news"] = [];
    for (const sym of symbols.slice(0, 3)) {
      try {
        const insights = await yahooFinance.insights(sym);
        const sigDevs = (insights as { sigDevs?: { headline?: string; date?: Date }[] }).sigDevs ?? [];
        news.push(...sigDevs.slice(0, 3).map((d) => ({ title: d.headline, date: d.date })));
      } catch {
        // skip
      }
    }
    const sentiment = news.length > 0 ? "neutral" : "neutral";
    const summary = `Market: ${quotes.length} trending symbols. ${news.length} recent developments.`;
    const result: MarketNewsOutlook = {
      news: news.slice(0, limit),
      outlook: { summary, sentiment },
    };
    newsCache = { data: result, timestamp: Date.now() };
    return result;
  } catch (error) {
    console.error("getMarketNewsAndOutlook error:", error);
    return {
      news: [],
      outlook: { summary: "Unable to fetch market news.", sentiment: "neutral" },
    };
  }
}

// Stock + optional options for chat
export type StockAndOptionPrices = {
  stock: { price: number; change: number; volume: number; changePercent: number };
  options?: {
    calls: { strike: number; type: string; bid: number; ask: number }[];
    puts: { strike: number; type: string; bid: number; ask: number }[];
  };
};

export async function getStockAndOptionPrices(
  symbol: string,
  opts?: { includeOptions?: boolean; expiration?: Date }
): Promise<StockAndOptionPrices | null> {
  try {
    const quote = await yahooFinance.quote(symbol.toUpperCase());
    if (!quote?.regularMarketPrice) return null;
    const prev = quote.regularMarketPreviousClose ?? quote.regularMarketPrice;
    const change = quote.regularMarketPrice - prev;
    const changePercent = prev > 0 ? (change / prev) * 100 : 0;
    const stock = {
      price: quote.regularMarketPrice,
      change,
      volume: quote.regularMarketVolume ?? 0,
      changePercent,
    };
    if (!opts?.includeOptions) {
      return { stock };
    }
    const chain = await yahooFinance.options(symbol.toUpperCase(), opts.expiration ? { date: opts.expiration } : undefined);
    const groups = (chain as { options?: { calls: unknown[]; puts: unknown[] }[] }).options ?? [];
    const g = groups[0];
    const mapCall = (c: { strike?: number; bid?: number; ask?: number }) => ({
      strike: c.strike ?? 0,
      type: "call" as const,
      bid: c.bid ?? 0,
      ask: c.ask ?? 0,
    });
    const mapPut = (p: { strike?: number; bid?: number; ask?: number }) => ({
      strike: p.strike ?? 0,
      type: "put" as const,
      bid: p.bid ?? 0,
      ask: p.ask ?? 0,
    });
    const calls = (g?.calls ?? []).map((c) => mapCall(c as { strike?: number; bid?: number; ask?: number }));
    const puts = (g?.puts ?? []).map((p) => mapPut(p as { strike?: number; bid?: number; ask?: number }));
    return { stock, options: { calls, puts } };
  } catch {
    return null;
  }
}

// Wilder RSI(14) from daily closes
function computeRsiWilder(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const deltas: number[] = [];
  for (let i = 1; i < closes.length; i++) deltas.push(closes[i] - closes[i - 1]);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const d = deltas[i];
    if (d >= 0) avgGain += d;
    else avgLoss += -d;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period; i < deltas.length; i++) {
    const d = deltas[i];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Batch price + RSI for scheduler
export async function getBatchPriceAndRSI(
  symbols: string[]
): Promise<Map<string, { price: number; changePercent: number; rsi: number | null }>> {
  const map = new Map<string, { price: number; changePercent: number; rsi: number | null }>();
  if (symbols.length === 0) return map;
  try {
    const prices = await getMultipleTickerPrices(symbols);
    const upperSymbols = symbols.map((s) => s.toUpperCase());

    const rsiPromises = upperSymbols.map(async (sym) => {
      let rsi: number | null = null;
      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 60);
        const chart = await yahooFinance.chart(sym, {
          period1: Math.floor(startDate.getTime() / 1000),
          period2: Math.floor(endDate.getTime() / 1000),
          interval: "1d",
        });
        const quotes = (chart?.quotes ?? []) as { date?: Date | number | string; close: number | null }[];
        const closes = quotes
          .filter((q) => q.close != null && q.close > 0)
          .sort((a, b) => {
            const ta = typeof a.date === "number" ? a.date : a.date ? new Date(a.date).getTime() : 0;
            const tb = typeof b.date === "number" ? b.date : b.date ? new Date(b.date).getTime() : 0;
            return ta - tb;
          })
          .map((q) => q.close as number);
        rsi = computeRsiWilder(closes, 14);
      } catch {
        // keep rsi null on chart fetch failure
      }
      return { sym, rsi };
    });

    const rsiResults = await Promise.all(rsiPromises);
    const rsiMap = new Map(rsiResults.map((r) => [r.sym, r.rsi]));

    for (const sym of upperSymbols) {
      const data = prices.get(sym);
      if (data) {
        map.set(sym, {
          price: data.price,
          changePercent: data.changePercent,
          rsi: rsiMap.get(sym) ?? null,
        });
      }
    }
    return map;
  } catch {
    return map;
  }
}

export type HistoricalClose = { date: string; close: number };

/** Fetch daily close prices for a symbol over the last `days` days. */
export async function getHistoricalCloses(
  symbol: string,
  days: number
): Promise<HistoricalClose[]> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const chart = await yahooFinance.chart(symbol.toUpperCase(), {
      period1: Math.floor(startDate.getTime() / 1000),
      period2: Math.floor(endDate.getTime() / 1000),
      interval: "1d",
    });
    const quotes = (chart?.quotes ?? []) as { date?: Date | number | string; close: number | null }[];
    return quotes
      .filter((q) => q.close != null && q.close > 0 && q.date != null)
      .map((q) => {
        const d =
          typeof q.date === "number" ? new Date(q.date * 1000) : q.date ? new Date(q.date) : new Date(0);
        return { date: d.toISOString().slice(0, 10), close: q.close as number };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}
