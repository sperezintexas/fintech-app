import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

type QuotePoint = {
  date?: Date | number | string;
  close: number | null;
};

function toEpochMs(d: QuotePoint["date"]): number {
  if (!d) return 0;
  if (typeof d === "number") return d > 10_000_000_000 ? d : d * 1000; // seconds vs ms heuristic
  if (typeof d === "string") return new Date(d).getTime();
  return d.getTime();
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / (values.length - 1);
  return Math.sqrt(variance);
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const upperSymbol = symbol.toUpperCase();

    // ~3 months of daily candles to ensure enough trading days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 120);

    const chart = await yahooFinance.chart(upperSymbol, {
      period1: Math.floor(startDate.getTime() / 1000),
      period2: Math.floor(endDate.getTime() / 1000),
      interval: "1d",
    });

    const quotesRaw = (chart?.quotes ?? []) as QuotePoint[];
    const quotes = quotesRaw
      .filter((q) => q.close != null && q.close > 0)
      .sort((a, b) => toEpochMs(a.date) - toEpochMs(b.date));

    if (quotes.length < 20) {
      return NextResponse.json(
        { error: `Insufficient historical data for ${upperSymbol}` },
        { status: 404 }
      );
    }

    const closes = quotes.map((q) => q.close as number);

    // RSI(14)
    const rsi14 = computeRsiWilder(closes, 14);
    if (rsi14 == null) {
      return NextResponse.json(
        { error: `Insufficient data to compute RSI for ${upperSymbol}` },
        { status: 404 }
      );
    }

    // Annualized volatility from daily log returns
    const logReturns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      const prev = closes[i - 1];
      const cur = closes[i];
      if (prev > 0 && cur > 0) logReturns.push(Math.log(cur / prev));
    }
    const dailyStdev = stdev(logReturns);
    const volatility = dailyStdev * Math.sqrt(252) * 100;

    return NextResponse.json({
      symbol: upperSymbol,
      rsi14: Math.round(rsi14 * 10) / 10,
      volatility: Math.round(volatility * 10) / 10,
      dataPoints: quotes.length,
    });
  } catch (error) {
    console.error("Error fetching technical indicators:", error);
    return NextResponse.json(
      { error: "Failed to fetch technical indicators" },
      { status: 500 }
    );
  }
}
