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

// Get market conditions with previous day data
export async function getMarketConditions(): Promise<MarketConditions> {
  const status = await getMarketStatus();

  // Fetch all indices in parallel
  const indexPromises = INDEX_TICKERS.map(async (indexInfo) => {
    const data = await getPrevDayClose(indexInfo.symbol);

    if (data) {
      const change = data.close - data.open;
      const changePercent = (change / data.open) * 100;

      return {
        symbol: indexInfo.symbol,
        name: indexInfo.name,
        price: data.close,
        change,
        changePercent,
      };
    }

    // Fallback if fetch fails
    return {
      symbol: indexInfo.symbol,
      name: indexInfo.name,
      price: 0,
      change: 0,
      changePercent: 0,
    };
  });

  const indices = await Promise.all(indexPromises);

  return {
    status,
    indices,
    lastUpdated: new Date().toISOString(),
  };
}

// Get prices for multiple tickers (for portfolio positions)
export async function getMultipleTickerPrices(
  tickers: string[]
): Promise<Map<string, { price: number; change: number; changePercent: number }>> {
  const priceMap = new Map<
    string,
    { price: number; change: number; changePercent: number }
  >();

  if (tickers.length === 0) return priceMap;

  // Fetch all tickers in parallel
  const promises = tickers.map(async (ticker) => {
    const price = await getTickerPrice(ticker);
    if (price) {
      priceMap.set(ticker, price);
    }
  });

  await Promise.all(promises);
  return priceMap;
}
