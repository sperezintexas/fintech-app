import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getHistoricalCloses } from "@/lib/yahoo";
import type { Account } from "@/types/portfolio";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

const RANGE_DAYS: Record<string, number> = {
  "1w": 7,
  "1mo": 30,
  "1yr": 365,
};

export type TimelinePoint = { date: string; value: number };

export type TimelineResponse = { points: TimelinePoint[] };

/** GET /api/dashboard/timeline?range=1w|1mo|1yr - Portfolio value over time (stock positions only). */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = (searchParams.get("range") ?? "1mo").toLowerCase();
    const days = RANGE_DAYS[range] ?? RANGE_DAYS["1mo"];

    const db = await getDb();
    type AccountDoc = Omit<Account, "_id"> & { _id: ObjectId };
    const accounts = await db.collection<AccountDoc>("accounts").find({}).toArray();

    const stockPositions: { ticker: string; shares: number }[] = [];
    for (const account of accounts) {
      for (const pos of account.positions ?? []) {
        if (pos.type === "stock" && pos.ticker && (pos.shares ?? 0) > 0) {
          stockPositions.push({ ticker: pos.ticker, shares: pos.shares ?? 0 });
        }
      }
    }

    if (stockPositions.length === 0) {
      return NextResponse.json({ points: [] } satisfies TimelineResponse);
    }

    const tickerShares = new Map<string, number>();
    for (const { ticker, shares } of stockPositions) {
      const s = ticker.toUpperCase();
      tickerShares.set(s, (tickerShares.get(s) ?? 0) + shares);
    }
    const tickers = Array.from(tickerShares.keys());

    const seriesByTicker = await Promise.all(
      tickers.map(async (t) => ({ ticker: t, data: await getHistoricalCloses(t, days) }))
    );

    const dateToValue = new Map<string, number>();
    for (const { ticker, data } of seriesByTicker) {
      const shares = tickerShares.get(ticker) ?? 0;
      for (const { date, close } of data) {
        const v = dateToValue.get(date) ?? 0;
        dateToValue.set(date, v + close * shares);
      }
    }

    const points: TimelinePoint[] = Array.from(dateToValue.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ points } satisfies TimelineResponse);
  } catch (error) {
    console.error("Failed to fetch timeline:", error);
    return NextResponse.json(
      { error: "Failed to fetch timeline" },
      { status: 500 }
    );
  }
}
