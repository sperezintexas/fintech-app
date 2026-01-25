import { NextRequest, NextResponse } from "next/server";

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const BASE_URL = "https://api.polygon.io";

export const dynamic = "force-dynamic";

type TickerDetails = {
  symbol: string;
  name: string;
  type: "stock" | "option";
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  // Option-specific fields
  underlyingSymbol?: string;
  optionType?: "call" | "put";
  strike?: number;
  expiration?: string;
};

// Parse Yahoo-style option symbol: TSLA260320C00005000
function parseOptionSymbol(symbol: string): {
  underlying: string;
  expiration: string;
  optionType: "call" | "put";
  strike: number;
} | null {
  const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/i);
  if (!match) return null;

  const [, ticker, datePart, typePart, strikePart] = match;
  const year = 2000 + parseInt(datePart.substring(0, 2));
  const month = datePart.substring(2, 4);
  const day = datePart.substring(4, 6);

  return {
    underlying: ticker.toUpperCase(),
    expiration: `${year}-${month}-${day}`,
    optionType: typePart.toUpperCase() === "C" ? "call" : "put",
    strike: parseInt(strikePart) / 1000,
  };
}

// Convert Yahoo symbol to Polygon options format: O:TSLA260320C00005000
function toPolygonOptionSymbol(yahooSymbol: string): string {
  return `O:${yahooSymbol.toUpperCase()}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const upperSymbol = symbol.toUpperCase();

    // Check if it's an option symbol
    const optionParsed = parseOptionSymbol(upperSymbol);
    const isOption = !!optionParsed;
    const polygonSymbol = isOption ? toPolygonOptionSymbol(upperSymbol) : upperSymbol;

    // Fetch previous day aggregates (free tier)
    const aggRes = await fetch(
      `${BASE_URL}/v2/aggs/ticker/${polygonSymbol}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`,
      { cache: "no-store" }
    );

    if (!aggRes.ok) {
      // Try fetching as regular stock if option fails
      if (isOption) {
        return NextResponse.json(
          { error: `Option data not available for ${upperSymbol}. Try the underlying stock symbol.` },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `Ticker ${upperSymbol} not found` },
        { status: 404 }
      );
    }

    const aggData = await aggRes.json();

    if (!aggData.results || aggData.results.length === 0) {
      return NextResponse.json(
        { error: `No data available for ${upperSymbol}` },
        { status: 404 }
      );
    }

    const agg = aggData.results[0];
    const change = agg.c - agg.o;
    const changePercent = (change / agg.o) * 100;

    // Fetch ticker details for name (stocks only)
    let tickerName = upperSymbol;
    if (!isOption) {
      try {
        const detailsRes = await fetch(
          `${BASE_URL}/v3/reference/tickers/${upperSymbol}?apiKey=${POLYGON_API_KEY}`,
          { cache: "no-store" }
        );
        if (detailsRes.ok) {
          const detailsData = await detailsRes.json();
          if (detailsData.results?.name) {
            tickerName = detailsData.results.name;
          }
        }
      } catch {
        // Ignore errors fetching details
      }
    }

    const result: TickerDetails = {
      symbol: upperSymbol,
      name: isOption
        ? `${optionParsed!.underlying} ${optionParsed!.strike} ${optionParsed!.optionType.toUpperCase()} ${optionParsed!.expiration}`
        : tickerName,
      type: isOption ? "option" : "stock",
      price: agg.c,
      open: agg.o,
      high: agg.h,
      low: agg.l,
      close: agg.c,
      volume: agg.v,
      change,
      changePercent,
    };

    if (isOption && optionParsed) {
      result.underlyingSymbol = optionParsed.underlying;
      result.optionType = optionParsed.optionType;
      result.strike = optionParsed.strike;
      result.expiration = optionParsed.expiration;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching ticker:", error);
    return NextResponse.json(
      { error: "Failed to fetch ticker data" },
      { status: 500 }
    );
  }
}
