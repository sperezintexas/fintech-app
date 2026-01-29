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
