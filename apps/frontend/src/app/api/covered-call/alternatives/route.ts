import { NextRequest, NextResponse } from "next/server";
import { getCoveredCallAlternatives } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

/**
 * POST /api/covered-call/alternatives
 * Find covered call alternatives: same or next week, higher prob OTM (e.g. 70%) and higher premium.
 * Used by Grok chat tool and by xStrategyBuilder "Find better value".
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      symbol?: string;
      strike?: number;
      expiration?: string;
      credit?: number;
      quantity?: number;
      minProbOtm?: number;
      limit?: number;
    };

    const symbol = body.symbol?.trim().toUpperCase();
    const strike = typeof body.strike === "number" ? body.strike : undefined;
    const expiration = body.expiration?.trim();
    const credit = typeof body.credit === "number" ? body.credit : undefined;
    const quantity = typeof body.quantity === "number" ? body.quantity : 1;
    const minProbOtm = typeof body.minProbOtm === "number" ? body.minProbOtm : 70;
    const limit = typeof body.limit === "number" ? Math.min(body.limit, 20) : 10;

    if (!symbol || strike == null || !expiration || credit == null) {
      return NextResponse.json(
        { error: "Missing required fields: symbol, strike, expiration, credit" },
        { status: 400 }
      );
    }

    const alternatives = await getCoveredCallAlternatives(symbol, {
      currentStrike: strike,
      currentExpiration: expiration,
      currentCredit: credit,
      quantity,
      minProbOtm,
      limit,
    });

    return NextResponse.json({
      symbol,
      currentStrike: strike,
      currentExpiration: expiration,
      currentCredit: credit,
      quantity,
      minProbOtm,
      alternatives,
    });
  } catch (error) {
    console.error("Covered call alternatives error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
