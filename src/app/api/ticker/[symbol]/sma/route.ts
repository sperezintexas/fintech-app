import { NextRequest, NextResponse } from "next/server";

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const BASE_URL = "https://api.polygon.io";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const upperSymbol = symbol.toUpperCase();

    // Fetch SMA (Simple Moving Average) for 50 days
    // Using Polygon's technical indicators endpoint
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];

    const smaRes = await fetch(
      `${BASE_URL}/v1/indicators/sma/${upperSymbol}?timespan=day&adjusted=true&window=50&series_type=close&order=desc&limit=1&apiKey=${POLYGON_API_KEY}`,
      { cache: "no-store" }
    );

    if (!smaRes.ok) {
      // If SMA endpoint fails, try to calculate from historical data
      const histRes = await fetch(
        `${BASE_URL}/v2/aggs/ticker/${upperSymbol}/range/1/day/${getDateDaysAgo(70)}/${dateStr}?adjusted=true&sort=desc&limit=50&apiKey=${POLYGON_API_KEY}`,
        { cache: "no-store" }
      );

      if (!histRes.ok) {
        return NextResponse.json(
          { error: `Unable to fetch data for ${upperSymbol}` },
          { status: 404 }
        );
      }

      const histData = await histRes.json();
      
      if (!histData.results || histData.results.length < 50) {
        return NextResponse.json(
          { error: `Insufficient historical data for ${upperSymbol}` },
          { status: 404 }
        );
      }

      // Calculate 50 DMA manually
      const closes = histData.results.slice(0, 50).map((r: { c: number }) => r.c);
      const sma50 = closes.reduce((a: number, b: number) => a + b, 0) / 50;

      return NextResponse.json({
        symbol: upperSymbol,
        sma50: Math.round(sma50 * 100) / 100,
        sma50Plus15: Math.round(sma50 * 1.15 * 100) / 100,
        sma50Minus15: Math.round(sma50 * 0.85 * 100) / 100,
        dataPoints: 50,
      });
    }

    const smaData = await smaRes.json();

    if (!smaData.results?.values || smaData.results.values.length === 0) {
      return NextResponse.json(
        { error: `No SMA data available for ${upperSymbol}` },
        { status: 404 }
      );
    }

    const sma50 = smaData.results.values[0].value;

    return NextResponse.json({
      symbol: upperSymbol,
      sma50: Math.round(sma50 * 100) / 100,
      sma50Plus15: Math.round(sma50 * 1.15 * 100) / 100,
      sma50Minus15: Math.round(sma50 * 0.85 * 100) / 100,
      dataPoints: 50,
    });
  } catch (error) {
    console.error("Error fetching SMA:", error);
    return NextResponse.json(
      { error: "Failed to fetch SMA data" },
      { status: 500 }
    );
  }
}

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}
