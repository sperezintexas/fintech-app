import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const upperSymbol = symbol.toUpperCase();

    // Fetch 50 days of historical data to calculate SMA
    // Request 70 days to account for weekends/holidays
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 70);

    try {
      // Use chart method for historical data (yahoo-finance2 v3 API)
      const chartData = await yahooFinance.chart(upperSymbol, {
        period1: Math.floor(startDate.getTime() / 1000),
        period2: Math.floor(endDate.getTime() / 1000),
        interval: "1d",
      });

      if (!chartData || !chartData.quotes || chartData.quotes.length === 0) {
        return NextResponse.json(
          { error: `No historical data available for ${upperSymbol}` },
          { status: 404 }
        );
      }

      // Get the last 50 trading days (quotes are sorted oldest-first)
      // Filter out any entries without close price, take most recent 50
      const filtered = chartData.quotes.filter((d) => d.close != null && d.close > 0);
      const validCloses: number[] = filtered.slice(-50).map((d) => d.close as number);

      if (validCloses.length < 30) {
        // Require at least 30 days for meaningful SMA
        return NextResponse.json(
          { error: `Insufficient historical data for ${upperSymbol} (only ${validCloses.length} days available)` },
          { status: 404 }
        );
      }

      // Calculate 50 DMA (or available days if less than 50)
      const sma50 = validCloses.reduce((a, b) => a + b, 0) / validCloses.length;

      return NextResponse.json({
        symbol: upperSymbol,
        sma50: Math.round(sma50 * 100) / 100,
        sma50Plus15: Math.round(sma50 * 1.15 * 100) / 100,
        sma50Minus15: Math.round(sma50 * 0.85 * 100) / 100,
        dataPoints: validCloses.length,
      });
    } catch (histError) {
      console.error(`Error fetching historical data for ${upperSymbol}:`, histError);
      return NextResponse.json(
        { error: `Failed to fetch historical data for ${upperSymbol}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error fetching SMA:", error);
    return NextResponse.json(
      { error: "Failed to fetch SMA data" },
      { status: 500 }
    );
  }
}
