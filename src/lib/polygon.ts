import type { MarketConditions } from "@/types/portfolio";

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const BASE_URL = "https://api.polygon.io";

// Major indices ETFs to track
const INDEX_TICKERS = [
  { symbol: "SPY", name: "S&P 500" },
  { symbol: "QQQ", name: "Nasdaq 100" },
  { symbol: "DIA", name: "Dow Jones" },
  { symbol: "IWM", name: "Russell 2000" },
];

type PolygonPrevCloseResponse = {
  status: string;
  results: Array<{
    T: string; // ticker
    c: number; // close
    o: number; // open
    h: number; // high
    l: number; // low
    v: number; // volume
  }>;
};

type PolygonMarketStatusResponse = {
  market: string;
  earlyHours: boolean;
  afterHours: boolean;
};

// Get current market status
async function getMarketStatus(): Promise<MarketConditions["status"]> {
  try {
    const res = await fetch(
      `${BASE_URL}/v1/marketstatus/now?apiKey=${POLYGON_API_KEY}`,
      { next: { revalidate: 60 } }
    );

    if (!res.ok) {
      console.error("Failed to fetch market status:", res.status);
      return "closed";
    }

    const data: PolygonMarketStatusResponse = await res.json();

    if (data.market === "open") return "open";
    if (data.earlyHours) return "pre-market";
    if (data.afterHours) return "after-hours";
    return "closed";
  } catch (error) {
    console.error("Error fetching market status:", error);
    return "closed";
  }
}

// Get previous day close for a ticker (free tier)
async function getPrevDayClose(
  ticker: string
): Promise<{ close: number; open: number } | null> {
  try {
    const res = await fetch(
      `${BASE_URL}/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`,
      { next: { revalidate: 300 } } // Cache for 5 minutes
    );

    if (!res.ok) {
      console.error(`Failed to fetch prev close for ${ticker}:`, res.status);
      return null;
    }

    const data: PolygonPrevCloseResponse = await res.json();

    if (data.results && data.results.length > 0) {
      return {
        close: data.results[0].c,
        open: data.results[0].o,
      };
    }
    return null;
  } catch (error) {
    console.error(`Error fetching prev close for ${ticker}:`, error);
    return null;
  }
}

// Get single ticker price using previous day data (free tier)
export async function getTickerPrice(
  ticker: string
): Promise<{ price: number; change: number; changePercent: number } | null> {
  const data = await getPrevDayClose(ticker);
  if (!data) return null;

  const change = data.close - data.open;
  const changePercent = (change / data.open) * 100;

  return {
    price: data.close,
    change,
    changePercent,
  };
}

// Get market conditions with previous day data (uses cached grouped data)
export async function getMarketConditions(): Promise<MarketConditions> {
  const status = await getMarketStatus();

  // Use grouped daily data (single API call, cached)
  const groupedData = await getGroupedDailyData();

  const indices = INDEX_TICKERS.map((indexInfo) => {
    const data = groupedData.get(indexInfo.symbol);

    if (data) {
      const change = data.close - data.open;
      const changePercent = data.open > 0 ? (change / data.open) * 100 : 0;

      return {
        symbol: indexInfo.symbol,
        name: indexInfo.name,
        price: data.close,
        change,
        changePercent,
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

// Cache for grouped daily data (refreshes every 5 minutes)
let groupedDailyCache: {
  data: Map<string, { close: number; open: number }>;
  timestamp: number;
} | null = null;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Get previous day's grouped daily data (ONE API call for all tickers)
async function getGroupedDailyData(): Promise<Map<string, { close: number; open: number }>> {
  // Return cached data if still valid
  if (groupedDailyCache && Date.now() - groupedDailyCache.timestamp < CACHE_TTL) {
    return groupedDailyCache.data;
  }

  const dataMap = new Map<string, { close: number; open: number }>();

  try {
    // Get previous trading day's date
    const today = new Date();
    const prevDay = new Date(today);
    // Go back to find previous trading day (skip weekends)
    do {
      prevDay.setDate(prevDay.getDate() - 1);
    } while (prevDay.getDay() === 0 || prevDay.getDay() === 6);

    const dateStr = prevDay.toISOString().split("T")[0];

    // Fetch grouped daily data - ONE call returns all tickers
    const res = await fetch(
      `${BASE_URL}/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apiKey=${POLYGON_API_KEY}`,
      { next: { revalidate: 300 } }
    );

    if (!res.ok) {
      console.error("Failed to fetch grouped daily:", res.status);
      return dataMap;
    }

    const data = await res.json();

    if (data.results && Array.isArray(data.results)) {
      for (const result of data.results) {
        if (result.T && result.c && result.o) {
          dataMap.set(result.T, {
            close: result.c,
            open: result.o,
          });
        }
      }
    }

    // Cache the results
    groupedDailyCache = {
      data: dataMap,
      timestamp: Date.now(),
    };

    console.log(`Cached ${dataMap.size} tickers from grouped daily API`);
  } catch (error) {
    console.error("Error fetching grouped daily:", error);
  }

  return dataMap;
}

// Get prices for multiple tickers (uses ONE API call via grouped daily)
export async function getMultipleTickerPrices(
  tickers: string[]
): Promise<Map<string, { price: number; change: number; changePercent: number }>> {
  const priceMap = new Map<
    string,
    { price: number; change: number; changePercent: number }
  >();

  if (tickers.length === 0) return priceMap;

  // Get all ticker data with single API call
  const groupedData = await getGroupedDailyData();

  // Extract prices for requested tickers
  for (const ticker of tickers) {
    const data = groupedData.get(ticker.toUpperCase());
    if (data) {
      const change = data.close - data.open;
      const changePercent = data.open > 0 ? (change / data.open) * 100 : 0;

      priceMap.set(ticker, {
        price: data.close,
        change,
        changePercent,
      });
    }
  }

  // Log any missing tickers (might be ETFs or other symbols not in stocks)
  const missing = tickers.filter(t => !priceMap.has(t));
  if (missing.length > 0) {
    console.log(`Tickers not found in grouped daily: ${missing.join(", ")}`);
  }

  return priceMap;
}
