import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const dynamic = "force-dynamic";

/** GET /api/options/expirations?underlying=TSLA - Returns Yahoo's actual expiration dates */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const underlying = searchParams.get("underlying")?.toUpperCase();
    if (!underlying) {
      return NextResponse.json({ error: "underlying is required" }, { status: 400 });
    }

    const result = await yahooFinance.options(underlying);
    const dates = (result as { expirationDates?: (Date | string)[] }).expirationDates ?? [];
    const expirationDates = dates.map((d) => {
      const x = d instanceof Date ? d : new Date(d);
      const y = x.getUTCFullYear();
      const m = String(x.getUTCMonth() + 1).padStart(2, "0");
      const day = String(x.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    });

    return NextResponse.json({ underlying, expirationDates });
  } catch (error) {
    console.error("Error fetching expiration dates:", error);
    return NextResponse.json({ error: "Failed to fetch expiration dates" }, { status: 500 });
  }
}
