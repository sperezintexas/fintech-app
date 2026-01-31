/**
 * Yahoo Finance API integration
 * Replaces Polygon.io to avoid rate limiting issues
 * Uses yahoo-finance2 v3 package for reliable, free market data
 *
 * v3 requires instantiating the class: const yahooFinance = new YahooFinance();
 */

import YahooFinance from "yahoo-finance2";
import type { MarketConditions } from "@/types/portfolio";

// Initialize Yahoo Finance instance (v3 requirement)
const yahooFinance = new YahooFinance();

// Major indices ETFs to track
const INDEX_TICKERS = [
  { symbol: "SPY", name: "S&P 500" },
  { symbol: "QQQ", name: "Nasdaq 100" },
  { symbol: "DIA", name: "Dow Jones" },
  { symbol: "IWM", name: "Russell 2000" },
];

// Cache for market data (refreshes every 5 minutes)
let marketDataCache: {
  data: Map<string, { close: number; open: number; high: number; low: number; volume: number; previousClose?: number }>;
  timestamp: number;
} | null = null;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Determine market status based on current time (US Eastern Time)
function getMarketStatus(): MarketConditions["status"] {
  const now = new Date();
  const easternTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hour = easternTime.getHours();
  const day = easternTime.getDay(); // 0 = Sunday, 6 = Saturday

  // Market is closed on weekends
  if (day === 0 || day === 6) {
    return "closed";
  }

  // Pre-market: 4:00 AM - 9:30 AM ET
  if (hour >= 4 && hour < 9) {
    return "pre-market";
  }
  // Market open: 9:30 AM - 4:00 PM ET
  if (hour >= 9 && hour < 16) {
    // Check if it's after 9:30 AM
    const minutes = easternTime.getMinutes();
    if (hour === 9 && minutes < 30) {
      return "pre-market";
    }
    return "open";
  }
  // After hours: 4:00 PM - 8:00 PM ET
  if (hour >= 16 && hour < 20) {
    return "after-hours";
  }

  return "closed";
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
};

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

    const chain = await yahooFinance.options(symbol.toUpperCase());
    const opts = (chain as { options?: { expirationDate: Date; calls: unknown[]; puts: unknown[] }[] }).options;
    if (!opts?.length) return null;

    const expTarget = expiration.slice(0, 10);
    const group = opts.find((g) => {
      const d = g.expirationDate instanceof Date ? g.expirationDate : new Date(g.expirationDate);
      return d.toISOString().slice(0, 10) === expTarget;
    }) ?? opts[0];

    const contracts = (optionType === "call" ? (group.calls ?? []) : (group.puts ?? [])) as { strike?: number }[];
    const c = contracts.find((x) => Math.abs((x.strike ?? 0) - strike) < 0.01);
    if (!c) return null;

    const c2 = c as { lastPrice?: number; bid?: number; ask?: number; strike?: number; impliedVolatility?: number };
    const bid = c2.bid ?? 0;
    const ask = c2.ask ?? 0;
    const premium = (c2.lastPrice ?? 0) > 0 ? c2.lastPrice! : bid > 0 && ask > 0 ? (bid + ask) / 2 : bid || ask || 0;
    const intrinsic = optionType === "call"
      ? Math.max(0, stockPrice - strike)
      : Math.max(0, strike - stockPrice);
    const timeVal = Math.max(0, premium - intrinsic);
    const iv = c2.impliedVolatility ?? undefined;

    return {
      price: premium,
      bid,
      ask,
      underlyingPrice: stockPrice,
      intrinsicValue: intrinsic,
      timeValue: timeVal,
      impliedVolatility: iv,
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

// Detailed option chain (for analyzers) - shape: { stock: { price }, calls, puts }
export async function getOptionChainDetailed(symbol: string): Promise<{
  stock: { price: number };
  calls: { strike?: number; bid?: number; ask?: number; impliedVolatility?: number }[];
  puts: { strike?: number; bid?: number; ask?: number; impliedVolatility?: number }[];
} | null> {
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

// Batch price + RSI for scheduler
export async function getBatchPriceAndRSI(
  symbols: string[]
): Promise<Map<string, { price: number; changePercent: number; rsi: number | null }>> {
  const map = new Map<string, { price: number; changePercent: number; rsi: number | null }>();
  if (symbols.length === 0) return map;
  try {
    const prices = await getMultipleTickerPrices(symbols);
    for (const sym of symbols) {
      const data = prices.get(sym.toUpperCase());
      if (data) {
        map.set(sym.toUpperCase(), {
          price: data.price,
          changePercent: data.changePercent,
          rsi: null,
        });
      }
    }
    return map;
  } catch {
    return map;
  }
}
