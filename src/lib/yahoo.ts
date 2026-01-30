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
// Suppress one-time upstream notice (see yahoo-finance2 issue #764)
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

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

type QuotePoint = { date?: Date | number | string; close: number | null };

function toEpochMs(d: QuotePoint["date"]): number {
  if (!d) return 0;
  if (typeof d === "number") return d > 10_000_000_000 ? d : d * 1000;
  if (typeof d === "string") return new Date(d).getTime();
  return d.getTime();
}

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

export type PriceRSIData = {
  price: number;
  changePercent: number;
  rsi: number | null;
};

/** Fetches price, daily change %, and RSI for multiple symbols (for watchlist reports). */
export async function getBatchPriceAndRSI(
  symbols: string[]
): Promise<Map<string, PriceRSIData>> {
  const result = new Map<string, PriceRSIData>();
  if (symbols.length === 0) return result;

  const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase())));

  const fetchOne = async (ticker: string): Promise<void> => {
    try {
      const [quote, chart] = await Promise.all([
        yahooFinance.quote(ticker),
        yahooFinance.chart(ticker, {
          period1: Math.floor((Date.now() - 120 * 24 * 60 * 60 * 1000) / 1000),
          period2: Math.floor(Date.now() / 1000),
          interval: "1d",
        }),
      ]);

      if (!quote?.regularMarketPrice) return;

      const previousClose =
        quote.regularMarketPreviousClose || quote.regularMarketOpen || quote.regularMarketPrice;
      const changePercent =
        previousClose > 0 ? ((quote.regularMarketPrice - previousClose) / previousClose) * 100 : 0;

      let rsi: number | null = null;
      const quotesRaw = (chart?.quotes ?? []) as QuotePoint[];
      const quotes = quotesRaw
        .filter((q) => q.close != null && q.close > 0)
        .sort((a, b) => toEpochMs(a.date) - toEpochMs(b.date));
      const closes = quotes.map((q) => q.close as number);
      if (closes.length >= 15) {
        rsi = computeRsiWilder(closes, 14);
      }

      result.set(ticker, {
        price: quote.regularMarketPrice,
        changePercent,
        rsi: rsi != null ? Math.round(rsi * 10) / 10 : null,
      });
    } catch (e) {
      console.error(`getBatchPriceAndRSI ${ticker}:`, e);
    }
  };

  await Promise.all(unique.map(fetchOne));
  return result;
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

// --- Smart Grok Chat Tools ---

export type MarketNewsItem = {
  title: string;
  link?: string;
  summary: string;
  date: string;
};

export type MarketNewsOutlook = {
  news: MarketNewsItem[];
  outlook: { summary: string; sentiment: "bullish" | "neutral" | "bearish" };
};

const NEWS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
let marketNewsCache: { data: MarketNewsOutlook; timestamp: number } | null = null;

/** Fetch market news and outlook for Smart Grok Chat. Uses trendingSymbols, insights (sigDevs), and indices. */
export async function getMarketNewsAndOutlook(options?: {
  limit?: number;
  region?: string;
}): Promise<MarketNewsOutlook> {
  const limit = options?.limit ?? 10;
  const region = options?.region ?? "US";

  if (marketNewsCache && Date.now() - marketNewsCache.timestamp < NEWS_CACHE_TTL) {
    return {
      ...marketNewsCache.data,
      news: marketNewsCache.data.news.slice(0, limit),
    };
  }

  const news: MarketNewsItem[] = [];
  let sentiment: "bullish" | "neutral" | "bearish" = "neutral";

  try {
    const [trending, marketConditions, insightsSpy, insightsQqq] = await Promise.all([
      yahooFinance.trendingSymbols(region, { count: Math.min(limit, 10) }),
      getMarketConditions(),
      yahooFinance.insights("SPY", { reportsCount: 2 }).catch(() => null),
      yahooFinance.insights("QQQ", { reportsCount: 2 }).catch(() => null),
    ]);

    const insightsList = [insightsSpy, insightsQqq].filter(Boolean);
    for (const ins of insightsList) {
      const sigDevs = (ins as { sigDevs?: { headline: string; date?: Date }[] })?.sigDevs ?? [];
      for (const dev of sigDevs.slice(0, 3)) {
        news.push({
          title: dev.headline,
          summary: dev.headline,
          date: dev.date ? new Date(dev.date).toISOString().slice(0, 10) : "",
        });
      }
    }

    const avgChange =
      marketConditions.indices.length > 0
        ? marketConditions.indices.reduce((s, i) => s + (i.changePercent ?? 0), 0) /
          marketConditions.indices.length
        : 0;
    if (avgChange > 0.5) sentiment = "bullish";
    else if (avgChange < -0.5) sentiment = "bearish";

    const trendingSymbols = (trending as { quotes?: { symbol: string }[] })?.quotes ?? [];
    const trendingStr =
      trendingSymbols.length > 0
        ? `Trending: ${trendingSymbols.map((q) => q.symbol).join(", ")}`
        : "";

    const summary = [
      `Market status: ${marketConditions.status}.`,
      marketConditions.indices
        .map(
          (i) =>
            `${i.symbol} ${i.price.toFixed(2)} (${i.changePercent >= 0 ? "+" : ""}${i.changePercent.toFixed(2)}%)`
        )
        .join("; "),
      trendingStr,
    ]
      .filter(Boolean)
      .join(" ");

    const result: MarketNewsOutlook = {
      news: news.slice(0, limit),
      outlook: { summary, sentiment },
    };
    marketNewsCache = { data: result, timestamp: Date.now() };
    return result;
  } catch (e) {
    console.error("getMarketNewsAndOutlook:", e);
    return {
      news: [],
      outlook: {
        summary: "Unable to fetch market data. Please try again.",
        sentiment: "neutral",
      },
    };
  }
}

export type OptionContract = {
  strike: number;
  type: "call" | "put";
  bid: number;
  ask: number;
  lastPrice: number;
  volume?: number;
  impliedVolatility?: number;
};

export type StockAndOptionPrices = {
  stock: { price: number; change: number; volume: number; changePercent?: number };
  options?: { calls: OptionContract[]; puts: OptionContract[] };
};

/** Fetch option premium for a specific position (underlying, expiration, strike, type). Used by holdings. */
export async function getOptionPremiumForPosition(
  underlying: string,
  expiration: string,
  strike: number,
  optionType: "call" | "put"
): Promise<number | null> {
  try {
    const result = await getStockAndOptionPrices(underlying, {
      includeOptions: true,
      expiration: new Date(expiration + "T12:00:00Z"),
    });
    if (!result?.options) return null;
    const list = optionType === "call" ? result.options.calls : result.options.puts;
    const match = list.find((c) => Math.abs(c.strike - strike) < 0.01);
    if (!match) return null;
    const mid = match.lastPrice > 0 ? match.lastPrice : (match.bid + match.ask) / 2;
    return mid > 0 ? mid : null;
  } catch (e) {
    console.error(`getOptionPremiumForPosition ${underlying} ${expiration} ${strike} ${optionType}:`, e);
    return null;
  }
}

/** Option metrics for Option Scanner (price, IV, intrinsic/time value). */
export type OptionMetrics = {
  price: number;
  bid: number;
  ask: number;
  underlyingPrice: number;
  impliedVolatility?: number;
  intrinsicValue: number;
  timeValue: number;
  volume?: number;
};

/** Fetch option metrics for a specific contract (strike, expiration, type). Used by Option Scanner. */
export async function getOptionMetrics(
  symbol: string,
  expiration: Date | string,
  strike: number,
  type: "call" | "put"
): Promise<OptionMetrics | null> {
  try {
    const expDate = typeof expiration === "string" ? new Date(expiration + "T12:00:00Z") : expiration;
    const result = await getStockAndOptionPrices(symbol.toUpperCase(), {
      includeOptions: true,
      expiration: expDate,
    });
    if (!result?.options) return null;

    const list = type === "call" ? result.options.calls : result.options.puts;
    const match = list.find((c) => Math.abs(c.strike - strike) < 0.01);
    if (!match) return null;

    const price = match.lastPrice > 0 ? match.lastPrice : (match.bid + match.ask) / 2;
    const underlyingPrice = result.stock.price;
    const intrinsicValue =
      type === "call"
        ? Math.max(0, underlyingPrice - strike)
        : Math.max(0, strike - underlyingPrice);
    const timeValue = Math.max(0, price - intrinsicValue);

    return {
      price,
      bid: match.bid,
      ask: match.ask,
      underlyingPrice,
      impliedVolatility: match.impliedVolatility,
      intrinsicValue,
      timeValue,
      volume: match.volume,
    };
  } catch (e) {
    console.error(`getOptionMetrics ${symbol} ${expiration} ${strike} ${type}:`, e);
    return null;
  }
}

/** Market conditions for Option Scanner: VIX level and symbol trend. */
export type OptionMarketConditions = {
  vix: number;
  vixLevel: "low" | "moderate" | "elevated";
  trend: "up" | "down" | "neutral";
  symbolChangePercent?: number;
};

/** Fetch market conditions (VIX, trend) for Option Scanner. */
export async function getOptionMarketConditions(symbol?: string): Promise<OptionMarketConditions> {
  try {
    const [vixQuote, symbolQuote] = await Promise.all([
      yahooFinance.quote("^VIX"),
      symbol ? yahooFinance.quote(symbol.toUpperCase()) : null,
    ]);

    const vix = vixQuote?.regularMarketPrice ?? 0;
    const vixLevel: OptionMarketConditions["vixLevel"] =
      vix < 15 ? "low" : vix < 25 ? "moderate" : "elevated";

    let trend: "up" | "down" | "neutral" = "neutral";
    let symbolChangePercent: number | undefined;
    if (symbolQuote?.regularMarketPrice != null && symbolQuote?.regularMarketPreviousClose != null) {
      const prev = symbolQuote.regularMarketPreviousClose;
      const change = symbolQuote.regularMarketPrice - prev;
      symbolChangePercent = prev > 0 ? (change / prev) * 100 : 0;
      if (symbolChangePercent > 0.5) trend = "up";
      else if (symbolChangePercent < -0.5) trend = "down";
    }

    return { vix, vixLevel, trend, symbolChangePercent };
  } catch (e) {
    console.error("getOptionMarketConditions:", e);
    return { vix: 0, vixLevel: "moderate", trend: "neutral" };
  }
}

/** Detailed option contract for Covered Call Analyzer (includes delta if available). */
export type OptionChainContract = OptionContract & {
  delta?: number;
};

/** Full option chain with more strikes for Covered Call Analyzer. */
export type OptionChainDetailed = {
  stock: { price: number; change: number; changePercent: number };
  calls: OptionChainContract[];
  puts: OptionChainContract[];
};

/** Fetch full option chain with bid/ask/IV for Covered Call Analyzer. */
export async function getOptionChainDetailed(
  underlying: string,
  expiration?: Date | string
): Promise<OptionChainDetailed | null> {
  const expDate = expiration
    ? typeof expiration === "string"
      ? new Date(expiration + "T12:00:00Z")
      : expiration
    : (() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        return d;
      })();

  const result = await getStockAndOptionPrices(underlying.toUpperCase(), {
    includeOptions: true,
    expiration: expDate,
  });
  if (!result?.options) return null;

  return {
    stock: {
      ...result.stock,
      changePercent: result.stock.changePercent ?? 0,
    },
    calls: result.options.calls.map((c) => ({ ...c, delta: undefined })),
    puts: result.options.puts.map((p) => ({ ...p, delta: undefined })),
  };
}

/** IV rank/percentile approximation. Yahoo doesn't provide historical IV; returns null or heuristic. */
export async function getIVRankOrPercentile(symbol: string): Promise<number | null> {
  try {
    const result = await getStockAndOptionPrices(symbol.toUpperCase(), {
      includeOptions: true,
    });
    if (!result?.options?.calls?.length) return null;
    const avgIV =
      result.options.calls
        .filter((c) => c.impliedVolatility != null && c.impliedVolatility > 0)
        .reduce((s, c) => s + (c.impliedVolatility ?? 0), 0) /
      Math.max(1, result.options.calls.filter((c) => c.impliedVolatility).length);
    if (!avgIV || avgIV <= 0) return null;
    return Math.min(100, Math.round(avgIV * 4));
  } catch {
    return null;
  }
}

/** Fetch stock and optionally options for Smart Grok Chat. */
export async function getStockAndOptionPrices(
  symbol: string,
  options?: { includeOptions?: boolean; expiration?: Date }
): Promise<StockAndOptionPrices | null> {
  const upper = symbol.toUpperCase();
  try {
    const quote = await yahooFinance.quote(upper);
    if (!quote?.regularMarketPrice) return null;

    const prev = quote.regularMarketPreviousClose ?? quote.regularMarketOpen ?? quote.regularMarketPrice;
    const change = quote.regularMarketPrice - prev;
    const changePercent = prev > 0 ? (change / prev) * 100 : 0;

    const stock = {
      price: quote.regularMarketPrice,
      change,
      volume: quote.regularMarketVolume ?? 0,
      changePercent,
    };

    if (!options?.includeOptions) {
      return { stock };
    }

    const expDate = options.expiration ?? (() => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      return d;
    })();

    const optsResult = await yahooFinance.options(upper, { date: expDate });
    const rawOpts = (optsResult as { options?: { calls?: unknown[]; puts?: unknown[] } })?.options ?? [];
    const group = Array.isArray(rawOpts) ? rawOpts[0] : rawOpts;
    const rawCalls = (group as { calls?: { strike: number; bid?: number; ask?: number; lastPrice?: number; volume?: number; impliedVolatility?: number }[] })?.calls ?? [];
    const rawPuts = (group as { puts?: { strike: number; bid?: number; ask?: number; lastPrice?: number; volume?: number; impliedVolatility?: number }[] })?.puts ?? [];

    const mapOpt = (o: { strike: number; bid?: number; ask?: number; lastPrice?: number; volume?: number; impliedVolatility?: number }, type: "call" | "put"): OptionContract => ({
      strike: o.strike,
      type,
      bid: o.bid ?? 0,
      ask: o.ask ?? 0,
      lastPrice: o.lastPrice ?? ((o.bid ?? 0) + (o.ask ?? 0)) / 2,
      volume: o.volume,
      impliedVolatility: o.impliedVolatility,
    });

    const calls = rawCalls.slice(0, 20).map((c) => mapOpt(c, "call"));
    const puts = rawPuts.slice(0, 20).map((p) => mapOpt(p, "put"));

    return { stock, options: { calls, puts } };
  } catch (e) {
    console.error(`getStockAndOptionPrices ${upper}:`, e);
    return null;
  }
}
