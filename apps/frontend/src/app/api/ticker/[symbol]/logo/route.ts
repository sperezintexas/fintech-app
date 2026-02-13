import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const TICKER_LOGOS_CDN = "https://cdn.tickerlogos.com";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ symbol: string }> };

/** GET /api/ticker/[symbol]/logo - Redirect to company logo (Ticker Logos CDN) using Yahoo company website */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { symbol } = await params;
    const upper = (symbol ?? "").toUpperCase().trim();
    if (!upper) {
      return NextResponse.json({ error: "Symbol required" }, { status: 400 });
    }
    const summary = await yahooFinance.quoteSummary(upper, { modules: ["summaryProfile"] });
    const profile = summary?.summaryProfile as { website?: string } | undefined;
    const website = profile?.website;
    if (!website || typeof website !== "string") {
      return NextResponse.json({ error: "No logo URL for symbol" }, { status: 404 });
    }
    const hostname = new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(
      /^www\./,
      ""
    );
    if (!hostname) {
      return NextResponse.json({ error: "No logo URL for symbol" }, { status: 404 });
    }
    const logoUrl = `${TICKER_LOGOS_CDN}/${hostname}`;
    return NextResponse.redirect(logoUrl, 302);
  } catch {
    return NextResponse.json({ error: "Failed to resolve logo" }, { status: 404 });
  }
}
