import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

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

    const quote = await yahooFinance.quote(upperSymbol);

    if (!quote || !quote.regularMarketPrice) {
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

    const change = quote.regularMarketPrice - (quote.regularMarketOpen || quote.regularMarketPrice);
    const changePercent = quote.regularMarketOpen ? (change / quote.regularMarketOpen) * 100 : 0;

    // Fetch ticker details for name (stocks only)
    let tickerName = upperSymbol;
    if (!isOption) {
      tickerName = quote.longName || upperSymbol;
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
