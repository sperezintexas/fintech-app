import { NextRequest, NextResponse } from "next/server";
import { evaluateCoveredCall, CoveredCallPosition } from "@/lib/covered-call-monitor";
import { getTickerPrice } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

// Estimate option price based on stock price, strike, and days to expiration
function estimateOptionPrice(
  stockPrice: number,
  strikePrice: number,
  daysToExp: number,
  isCall: boolean
): { bid: number; ask: number } {
  const intrinsic = isCall
    ? Math.max(0, stockPrice - strikePrice)
    : Math.max(0, strikePrice - stockPrice);

  const monthsToExp = daysToExp / 30;
  const timeValue = stockPrice * 0.015 * Math.sqrt(Math.max(monthsToExp, 0.1));
  const premium = intrinsic + timeValue;

  const spread = premium * 0.08;
  return {
    bid: Math.max(0.01, premium - spread / 2),
    ask: premium + spread / 2,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      symbol,
      contractSymbol,
      strikePrice,
      expirationDate,
      entryPremium,
      quantity = 1,
    } = body;

    // Validate required fields
    if (!symbol || !strikePrice || !expirationDate || !entryPremium) {
      return NextResponse.json(
        { error: "Missing required fields: symbol, strikePrice, expirationDate, entryPremium" },
        { status: 400 }
      );
    }

    // Fetch current stock price
    let stockPrice = strikePrice; // Fallback
    try {
      const quote = await getTickerPrice(symbol.toUpperCase());
      stockPrice = quote?.price ?? strikePrice;
    } catch (err) {
      console.error("Failed to fetch stock price:", err);
    }

    // Calculate days to expiration
    const expDate = new Date(expirationDate);
    const today = new Date();
    const daysToExp = Math.max(0, Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    // Estimate current option price (since we may not have real-time options data)
    const optionPrice = estimateOptionPrice(stockPrice, strikePrice, daysToExp, true);

    // Build position object
    const position: CoveredCallPosition = {
      symbol: symbol.toUpperCase(),
      contractSymbol: contractSymbol || "",
      strikePrice,
      expirationDate,
      entryPremium,
      quantity,
    };

    // Evaluate the position
    const evaluation = evaluateCoveredCall(position, {
      stockPrice,
      optionBid: optionPrice.bid,
      optionAsk: optionPrice.ask,
    });

    return NextResponse.json({
      position,
      market: {
        stockPrice,
        optionBid: Math.round(optionPrice.bid * 100) / 100,
        optionAsk: Math.round(optionPrice.ask * 100) / 100,
        optionMid: Math.round((optionPrice.bid + optionPrice.ask) / 2 * 100) / 100,
      },
      evaluation,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error evaluating covered call:", error);
    return NextResponse.json(
      { error: "Failed to evaluate covered call" },
      { status: 500 }
    );
  }
}
