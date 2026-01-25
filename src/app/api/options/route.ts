import { NextRequest, NextResponse } from "next/server";

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const BASE_URL = "https://api.polygon.io";

export const dynamic = "force-dynamic";

// Convert to Yahoo Finance option symbol format: TSLA260130C00170000
function toYahooSymbol(
  underlying: string,
  expiration: string,
  contractType: "call" | "put",
  strikePrice: number
): string {
  // Format: SYMBOL + YYMMDD + C/P + Strike*1000 (8 digits)
  const expDate = expiration.replace(/-/g, "").slice(2); // YYMMDD
  const typeChar = contractType === "call" ? "C" : "P";
  const strikeStr = String(Math.round(strikePrice * 1000)).padStart(8, "0");
  return `${underlying}${expDate}${typeChar}${strikeStr}`;
}

// Estimate implied volatility based on premium and time
function estimateIV(
  stockPrice: number,
  strikePrice: number,
  premium: number,
  daysToExpiration: number,
  isCall: boolean
): number {
  // Simplified IV approximation using Brenner-Subrahmanyam formula
  // IV ≈ premium / (0.4 * stockPrice * sqrt(T))
  const timeYears = daysToExpiration / 365;
  if (timeYears <= 0) return 0;
  
  const atTheMoneyApprox = premium / (0.4 * stockPrice * Math.sqrt(timeYears));
  
  // Adjust for moneyness
  const moneyness = isCall 
    ? stockPrice / strikePrice 
    : strikePrice / stockPrice;
  const moneynessAdj = 1 + Math.abs(1 - moneyness) * 0.3;
  
  const iv = atTheMoneyApprox * moneynessAdj;
  return Math.min(2.0, Math.max(0.1, iv)); // Cap between 10% and 200%
}

// Generate rationale based on option characteristics
function generateRationale(
  stockPrice: number,
  strikePrice: number,
  contractType: "call" | "put",
  iv: number
): string {
  const otmPercent = contractType === "call"
    ? ((strikePrice - stockPrice) / stockPrice) * 100
    : ((stockPrice - strikePrice) / stockPrice) * 100;
  
  const isITM = contractType === "call" 
    ? strikePrice < stockPrice 
    : strikePrice > stockPrice;
  const isATM = Math.abs(otmPercent) < 2;
  
  // Moneyness description
  let moneyness: string;
  if (isATM) {
    moneyness = "ATM";
  } else if (isITM) {
    moneyness = `${Math.abs(otmPercent).toFixed(0)}% ITM`;
  } else {
    moneyness = `${otmPercent.toFixed(0)}% OTM`;
  }
  
  // Strategy suggestion
  let strategy: string;
  if (contractType === "call") {
    if (isATM || (otmPercent > 0 && otmPercent <= 5)) {
      strategy = "Good STO"; // Sell to open - covered call sweet spot
    } else if (otmPercent > 5 && otmPercent <= 10) {
      strategy = "Safe STO"; // More conservative
    } else if (otmPercent > 10) {
      strategy = "Low premium"; // Far OTM
    } else if (isITM && Math.abs(otmPercent) <= 5) {
      strategy = "Higher assign risk";
    } else {
      strategy = "Deep ITM";
    }
  } else {
    // Puts
    if (isATM || (otmPercent > 0 && otmPercent <= 5)) {
      strategy = "CSP target"; // Cash secured put
    } else if (otmPercent > 5 && otmPercent <= 10) {
      strategy = "Safe CSP";
    } else if (otmPercent > 10) {
      strategy = "Low premium";
    } else {
      strategy = isITM ? "ITM put" : "Protective";
    }
  }
  
  // IV note
  const ivNote = iv > 0.5 ? " • High IV" : iv < 0.25 ? " • Low IV" : "";
  
  return `${moneyness} • ${strategy}${ivNote}`;
}

// Estimate volume (synthetic - based on moneyness and expiration)
function estimateVolume(
  stockPrice: number,
  strikePrice: number,
  daysToExpiration: number
): number {
  // ATM options have highest volume, decreases further OTM
  const moneyness = Math.abs(stockPrice - strikePrice) / stockPrice;
  const moneynessMultiplier = Math.max(0.1, 1 - moneyness * 5);
  
  // Nearer expiration = higher volume
  const timeMultiplier = daysToExpiration < 30 ? 2 : daysToExpiration < 60 ? 1.5 : 1;
  
  // Base volume estimate
  const baseVolume = 500;
  return Math.round(baseVolume * moneynessMultiplier * timeMultiplier);
}

// Simple premium estimation using time value approximation
function estimatePremium(
  stockPrice: number,
  strikePrice: number,
  daysToExpiration: number,
  isCall: boolean = true
): { bid: number; ask: number; premium: number } {
  // Intrinsic value
  const intrinsic = isCall
    ? Math.max(0, stockPrice - strikePrice)
    : Math.max(0, strikePrice - stockPrice);

  // Time value estimation (simplified - roughly 0.5-2% of stock price per month)
  const monthsToExp = daysToExpiration / 30;
  const volatilityFactor = 0.015;
  const moneyness = stockPrice / strikePrice;

  // ATM options have highest time value
  const moneynessAdjustment = 1 - Math.abs(1 - moneyness) * 0.5;
  const timeValue =
    stockPrice * volatilityFactor * Math.sqrt(monthsToExp) * moneynessAdjustment;

  const premium = intrinsic + Math.max(timeValue, 0.05);

  // Simulate bid-ask spread
  const spread = premium * 0.08;
  const bid = Math.max(0.01, premium - spread / 2);
  const ask = premium + spread / 2;

  return {
    bid: Math.round(bid * 100) / 100,
    ask: Math.round(ask * 100) / 100,
    premium: Math.round(premium * 100) / 100,
  };
}

// Generate synthetic option chain when API is unavailable
function generateSyntheticOptions(
  underlying: string,
  expiration: string,
  targetStrike: number,
  contractType: "call" | "put",
  stockPrice: number,
  daysToExp: number
) {
  const strikeTolerance = targetStrike * 0.15;
  const minStrike = targetStrike - strikeTolerance;
  const maxStrike = targetStrike + strikeTolerance;
  
  // Generate strikes at appropriate intervals
  const increment = stockPrice < 100 ? 2.5 : stockPrice < 500 ? 5 : 10;
  const strikes: number[] = [];
  
  let strike = Math.floor(minStrike / increment) * increment;
  while (strike <= maxStrike) {
    if (strike > 0) strikes.push(strike);
    strike += increment;
  }

  return strikes.map((strikePrice) => {
    const priceEstimate = estimatePremium(
      stockPrice,
      strikePrice,
      daysToExp,
      contractType === "call"
    );
    
    const iv = estimateIV(stockPrice, strikePrice, priceEstimate.premium, daysToExp, contractType === "call");
    const volume = estimateVolume(stockPrice, strikePrice, daysToExp);
    const rationale = generateRationale(stockPrice, strikePrice, contractType, iv);
    const yahooSymbol = toYahooSymbol(underlying, expiration, contractType, strikePrice);

    return {
      ticker: `O:${underlying}${expiration.replace(/-/g, "").slice(2)}${contractType === "call" ? "C" : "P"}${String(Math.round(strikePrice * 1000)).padStart(8, "0")}`,
      yahoo_symbol: yahooSymbol,
      strike_price: strikePrice,
      expiration_date: expiration,
      contract_type: contractType,
      premium: priceEstimate.premium,
      totalPremium: priceEstimate.premium * 100,
      last_quote: {
        bid: priceEstimate.bid,
        ask: priceEstimate.ask,
      },
      volume,
      implied_volatility: Math.round(iv * 1000) / 10, // As percentage (e.g., 35.5%)
      rationale,
      dataSource: "synthetic",
    };
  });
}

async function fetchOptionsForType(
  underlying: string,
  targetExpiration: string,
  targetStrike: number,
  contractType: "call" | "put",
  stockPrice: number,
  daysToExp: number
): Promise<{ options: any[]; synthetic: boolean }> {
  const strikeTolerance = targetStrike * 0.15;
  const minStrike = targetStrike - strikeTolerance;
  const maxStrike = targetStrike + strikeTolerance;

  // Calculate date range (±7 days from target to catch the actual expiration Friday)
  const targetDate = new Date(targetExpiration);
  const minDate = new Date(targetDate);
  minDate.setDate(minDate.getDate() - 7);
  const maxDate = new Date(targetDate);
  maxDate.setDate(maxDate.getDate() + 7);

  try {
    // Fetch options contracts from reference endpoint with date range
    const refParams = new URLSearchParams({
      underlying_ticker: underlying,
      contract_type: contractType,
      expired: "false",
      "expiration_date.gte": minDate.toISOString().split("T")[0],
      "expiration_date.lte": maxDate.toISOString().split("T")[0],
      limit: "250",
      sort: "strike_price",
    });

    const refRes = await fetch(
      `${BASE_URL}/v3/reference/options/contracts?${refParams.toString()}&apiKey=${POLYGON_API_KEY}`,
      { cache: "no-store" }
    );

    if (!refRes.ok) {
      console.log(`API returned ${refRes.status} for ${contractType}s, using synthetic data`);
      return {
        options: generateSyntheticOptions(underlying, targetExpiration, targetStrike, contractType, stockPrice, daysToExp),
        synthetic: true,
      };
    }

    const refData = await refRes.json();

    // Check for rate limit or error
    if (refData.status === "ERROR" || !refData.results || refData.results.length === 0) {
      console.log(`No results or error for ${contractType}s, using synthetic data`);
      return {
        options: generateSyntheticOptions(underlying, targetExpiration, targetStrike, contractType, stockPrice, daysToExp),
        synthetic: true,
      };
    }

    // Find the closest expiration date to target
    const expirations = new Set<string>();
    refData.results.forEach((c: any) => expirations.add(c.expiration_date));
    
    let closestExpiration = targetExpiration;
    let minDiff = Infinity;
    
    expirations.forEach((exp) => {
      const diff = Math.abs(new Date(exp).getTime() - targetDate.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closestExpiration = exp;
      }
    });

    // Filter by strike range and closest expiration
    const options = refData.results
      .filter((contract: any) => {
        return (
          contract.expiration_date === closestExpiration &&
          contract.strike_price >= minStrike && 
          contract.strike_price <= maxStrike
        );
      })
      .map((contract: any) => {
        const priceEstimate = estimatePremium(
          stockPrice,
          contract.strike_price,
          daysToExp,
          contractType === "call"
        );
        
        const iv = estimateIV(stockPrice, contract.strike_price, priceEstimate.premium, daysToExp, contractType === "call");
        const volume = estimateVolume(stockPrice, contract.strike_price, daysToExp);
        const rationale = generateRationale(stockPrice, contract.strike_price, contractType, iv);
        const yahooSymbol = toYahooSymbol(underlying, contract.expiration_date, contractType, contract.strike_price);

        return {
          ticker: contract.ticker,
          yahoo_symbol: yahooSymbol,
          strike_price: contract.strike_price,
          expiration_date: contract.expiration_date,
          contract_type: contract.contract_type,
          premium: priceEstimate.premium,
          totalPremium: priceEstimate.premium * 100,
          last_quote: {
            bid: priceEstimate.bid,
            ask: priceEstimate.ask,
          },
          volume,
          implied_volatility: Math.round(iv * 1000) / 10,
          rationale,
          dataSource: "estimated",
        };
      });

    if (options.length === 0) {
      return {
        options: generateSyntheticOptions(underlying, targetExpiration, targetStrike, contractType, stockPrice, daysToExp),
        synthetic: true,
      };
    }

    return { options, synthetic: false };
  } catch (error) {
    console.error(`Error fetching ${contractType}s:`, error);
    return {
      options: generateSyntheticOptions(underlying, targetExpiration, targetStrike, contractType, stockPrice, daysToExp),
      synthetic: true,
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const underlying = searchParams.get("underlying")?.toUpperCase();
    const expiration = searchParams.get("expiration");
    const targetStrike = parseFloat(searchParams.get("strike") || "0");

    if (!underlying) {
      return NextResponse.json(
        { error: "underlying is required" },
        { status: 400 }
      );
    }

    if (!expiration) {
      return NextResponse.json(
        { error: "expiration is required" },
        { status: 400 }
      );
    }

    // Get current stock price for premium estimation
    const tickerRes = await fetch(
      `${BASE_URL}/v2/aggs/ticker/${underlying}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`,
      { cache: "no-store" }
    );

    let stockPrice = targetStrike;
    if (tickerRes.ok) {
      const tickerData = await tickerRes.json();
      if (tickerData.results?.[0]?.c) {
        stockPrice = tickerData.results[0].c;
      }
    }

    // Calculate days to expiration
    const expDate = new Date(expiration);
    const today = new Date();
    const daysToExp = Math.max(
      1,
      Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    );

    // Fetch both calls and puts in parallel
    const [callsResult, putsResult] = await Promise.all([
      fetchOptionsForType(
        underlying,
        expiration,
        targetStrike,
        "call",
        stockPrice,
        daysToExp
      ),
      fetchOptionsForType(
        underlying,
        expiration,
        targetStrike,
        "put",
        stockPrice,
        daysToExp
      ),
    ]);

    const calls = callsResult.options;
    const puts = putsResult.options;
    const isSynthetic = callsResult.synthetic || putsResult.synthetic;

    // Get unique strikes and sort them
    const allStrikes = new Set<number>();
    calls.forEach((c: any) => allStrikes.add(c.strike_price));
    puts.forEach((p: any) => allStrikes.add(p.strike_price));
    const strikes = Array.from(allStrikes).sort((a, b) => a - b);

    // Build option chain by strike
    const optionChain = strikes.map((strike) => {
      const call = calls.find((c: any) => c.strike_price === strike);
      const put = puts.find((p: any) => p.strike_price === strike);
      return {
        strike,
        call: call || null,
        put: put || null,
      };
    });

    // Get actual expiration used (from first option found)
    const actualExpiration = calls[0]?.expiration_date || puts[0]?.expiration_date || expiration;

    return NextResponse.json({
      underlying,
      expiration: actualExpiration,
      requestedExpiration: expiration,
      targetStrike,
      stockPrice,
      daysToExpiration: daysToExp,
      strikeTolerance: targetStrike * 0.15,
      totalCalls: calls.length,
      totalPuts: puts.length,
      optionChain,
      dataSource: isSynthetic ? "synthetic" : "estimated",
      note: isSynthetic 
        ? "Premiums are modeled estimates (API rate limited). Actual market prices will vary."
        : actualExpiration !== expiration 
          ? `Showing options expiring ${actualExpiration} (closest to requested date). Premiums are estimated.`
          : "Premiums are estimated. Actual market prices may vary.",
    });
  } catch (error) {
    console.error("Error fetching options:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
