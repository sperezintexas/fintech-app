import { NextResponse } from "next/server";
import { getMarketConditions } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const revalidate = 30;

// GET /api/market - Get live market conditions
export async function GET() {
  try {
    const market = await getMarketConditions();
    return NextResponse.json(market);
  } catch (error) {
    console.error("Failed to fetch market data:", error);
    return NextResponse.json(
      { error: "Failed to fetch market data" },
      { status: 500 }
    );
  }
}
