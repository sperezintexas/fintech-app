/**
 * Covered Call Analyzer Service
 * Identifies covered call positions (long stock + short call) and opportunities (long stock without call).
 * Evaluates and recommends: HOLD, BUY_TO_CLOSE, SELL_NEW_CALL, ROLL, NONE.
 */

import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import {
  getOptionMetrics,
  getOptionChainDetailed,
  getIVRankOrPercentile,
  getOptionMarketConditions,
} from "@/lib/yahoo";
import type {
  Position,
  CoveredCallRecommendation,
  CoveredCallRecommendationAction,
  CoveredCallConfidence,
  RiskLevel,
} from "@/types/portfolio";

const MIN_STOCK_SHARES = 100;

type AccountDoc = { _id: ObjectId; positions?: Position[]; riskLevel?: RiskLevel };

/** Extract underlying symbol from option ticker (e.g. TSLA250117C250 -> TSLA). */
function getUnderlyingFromTicker(ticker: string): string {
  return ticker?.replace(/\d.*$/, "").toUpperCase() ?? "";
}

export type CoveredCallPair = {
  accountId: string;
  symbol: string;
  stockPositionId: string;
  stockShares: number;
  stockPurchasePrice: number;
  stockCurrentPrice?: number;
  stockUnrealizedPlPercent?: number;
  callPositionId: string;
  callStrike: number;
  callExpiration: string;
  callContracts: number;
  callPremiumReceived: number;
};

export type StockOpportunity = {
  accountId: string;
  symbol: string;
  stockPositionId: string;
  stockShares: number;
  stockPurchasePrice: number;
  stockCurrentPrice?: number;
};

/** Pure function: apply covered call rules. Unit-testable. */
export function applyCoveredCallRules(
  metrics: {
    stockPrice: number;
    strike: number;
    dte: number;
    callBid: number;
    callAsk: number;
    premiumReceived: number;
    extrinsicPercentOfPremium: number;
    unrealizedStockGainPercent: number;
    moneyness: "ITM" | "ATM" | "OTM";
    ivRank: number | null;
    symbolChangePercent: number;
    riskLevel: RiskLevel;
  }
): { recommendation: CoveredCallRecommendationAction; confidence: CoveredCallConfidence; reason: string } {
  const {
    stockPrice,
    strike,
    dte,
    callBid,
    premiumReceived,
    extrinsicPercentOfPremium,
    unrealizedStockGainPercent,
    moneyness,
    ivRank,
    symbolChangePercent,
    riskLevel,
  } = metrics;

  const stockAboveStrikePercent = ((stockPrice - strike) / strike) * 100;
  const callMid = (metrics.callBid + metrics.callAsk) / 2;

  // Stock ≥ strike + 5% & DTE ≤ 7 → BTC + consider new call
  if (stockAboveStrikePercent >= 5 && dte <= 7) {
    return {
      recommendation: "BUY_TO_CLOSE",
      confidence: "HIGH",
      reason: `Stock ${stockAboveStrikePercent.toFixed(1)}% above strike, DTE ${dte}. Deep ITM, little time value. Protect gains.`,
    };
  }

  // DTE ≤ 3 & call OTM → BTC (avoid assignment on worthless expiration)
  if (dte <= 3 && moneyness === "OTM") {
    return {
      recommendation: "BUY_TO_CLOSE",
      confidence: "HIGH",
      reason: `DTE ${dte}, call OTM. Avoid assignment risk on near-worthless expiration.`,
    };
  }

  // Call extrinsic < 5% of premium paid → BTC
  if (extrinsicPercentOfPremium < 5 && premiumReceived > 0) {
    return {
      recommendation: "BUY_TO_CLOSE",
      confidence: "HIGH",
      reason: `Time decay mostly gone (${extrinsicPercentOfPremium.toFixed(0)}% extrinsic). Free up capital or roll.`,
    };
  }

  // Account risk = conservative & DTE < 14 → BTC early
  if (riskLevel === "low" && dte < 14) {
    return {
      recommendation: "BUY_TO_CLOSE",
      confidence: "MEDIUM",
      reason: `Conservative account, DTE ${dte}. Reduce exposure sooner.`,
    };
  }

  // Unrealized stock gain > 15% & call near ATM → BTC
  if (unrealizedStockGainPercent > 15 && (moneyness === "ATM" || moneyness === "ITM")) {
    return {
      recommendation: "BUY_TO_CLOSE",
      confidence: "HIGH",
      reason: `Stock up ${unrealizedStockGainPercent.toFixed(0)}%, call near ATM. Lock in gains, avoid capping upside.`,
    };
  }

  // IV rank > 50 & stock near/below strike → HOLD or roll out
  if (ivRank != null && ivRank > 50 && (moneyness === "OTM" || moneyness === "ATM")) {
    return {
      recommendation: "HOLD",
      confidence: "HIGH",
      reason: `High IV rank (${ivRank}). Premium environment — keep collecting or consider roll out.`,
    };
  }

  // Delta ≥ 0.85 & stock rising fast — we don't have delta from Yahoo; use ITM + rising as proxy
  if (moneyness === "ITM" && stockAboveStrikePercent > 3 && symbolChangePercent > 2) {
    return {
      recommendation: "ROLL",
      confidence: "MEDIUM",
      reason: `Stock rising fast, call ITM. High assignment risk. Consider roll up/out.`,
    };
  }

  // Default: HOLD
  if (dte >= 14 && moneyness === "OTM") {
    return {
      recommendation: "HOLD",
      confidence: "HIGH",
      reason: `Adequate DTE (${dte}), call OTM. Time decay working.`,
    };
  }

  return {
    recommendation: "HOLD",
    confidence: "MEDIUM",
    reason: `Position neutral. DTE ${dte}, ${moneyness}. Monitor.`,
  };
}

/** Fetch covered call pairs (stock + short call) and opportunities (stock without call). */
export async function getCoveredCallPositions(
  accountId?: string
): Promise<{ pairs: CoveredCallPair[]; opportunities: StockOpportunity[] }> {
  const db = await getDb();
  const query = accountId ? { _id: new ObjectId(accountId) } : {};
  const accounts = await db.collection<AccountDoc>("accounts").find(query).toArray();

  const pairs: CoveredCallPair[] = [];
  const opportunities: StockOpportunity[] = [];

  if (accounts.length === 0) {
    console.warn("CoveredCallAnalyzer: no accounts found", accountId ? `(accountId=${accountId})` : "");
    return { pairs, opportunities };
  }

  for (const acc of accounts) {
    const positions = (acc.positions ?? []) as Position[];
    const stockPositions = positions.filter(
      (p) => p.type === "stock" && p.ticker && (p.shares ?? 0) >= MIN_STOCK_SHARES
    );
    const callPositions = positions.filter(
      (p) =>
        p.type === "option" &&
        p.optionType === "call" &&
        p.ticker &&
        p.strike != null &&
        p.expiration &&
        (p.contracts ?? 0) > 0
    );

    for (const stock of stockPositions) {
      const symbol = stock.ticker!.toUpperCase();
      const shares = stock.shares ?? 0;
      const purchasePrice = stock.purchasePrice ?? 0;
      const stockPosId = stock._id ?? `${acc._id}-stock-${symbol}`;

      const matchingCall = callPositions.find(
        (c) => getUnderlyingFromTicker(c.ticker ?? "") === symbol
      );
      if (matchingCall) {
        pairs.push({
          accountId: acc._id.toString(),
          symbol,
          stockPositionId: stockPosId,
          stockShares: shares,
          stockPurchasePrice: purchasePrice,
          stockCurrentPrice: stock.currentPrice,
          stockUnrealizedPlPercent: stock.unrealizedPLPercent,
          callPositionId:
            matchingCall._id ?? `${acc._id}-call-${symbol}-${matchingCall.strike}`,
          callStrike: matchingCall.strike!,
          callExpiration: matchingCall.expiration!,
          callContracts: matchingCall.contracts ?? 0,
          callPremiumReceived: matchingCall.premium ?? 0,
        });
      } else {
        opportunities.push({
          accountId: acc._id.toString(),
          symbol,
          stockPositionId: stockPosId,
          stockShares: shares,
          stockPurchasePrice: purchasePrice,
          stockCurrentPrice: stock.currentPrice,
        });
      }
    }
  }

  const totalStocks = accounts.reduce((n, a) => n + (a.positions ?? []).filter((p) => p.type === "stock" && (p.shares ?? 0) >= MIN_STOCK_SHARES).length, 0);
  const totalCalls = accounts.reduce((n, a) => n + (a.positions ?? []).filter((p) => p.type === "option" && p.optionType === "call").length, 0);
  if (pairs.length === 0 && (totalStocks > 0 || totalCalls > 0)) {
    console.warn(
      `CoveredCallAnalyzer: 0 pairs matched (${accounts.length} accounts, ${totalStocks} stocks ≥${MIN_STOCK_SHARES} shares, ${totalCalls} call positions). Check ticker format (use underlying symbol e.g. TSLA, or OCC format TSLA250117C250).`
    );
  }

  return { pairs, opportunities };
}

function getMoneyness(stockPrice: number, strike: number): "ITM" | "ATM" | "OTM" {
  const pct = ((stockPrice - strike) / strike) * 100;
  if (pct > 2) return "ITM";
  if (pct < -2) return "OTM";
  return "ATM";
}

/** Main analysis: evaluate pairs and opportunities, return recommendations. */
export async function analyzeCoveredCalls(
  accountId?: string
): Promise<CoveredCallRecommendation[]> {
  const { pairs, opportunities } = await getCoveredCallPositions(accountId);
  const recommendations: CoveredCallRecommendation[] = [];

  for (const pair of pairs) {
    try {
      const metrics = await getOptionMetrics(
        pair.symbol,
        pair.callExpiration,
        pair.callStrike,
        "call"
      );
      if (!metrics) {
        console.warn(
          `CoveredCallAnalyzer: no metrics for ${pair.symbol} ${pair.callExpiration} ${pair.callStrike}`
        );
        continue;
      }

      const stockPrice = metrics.underlyingPrice;
      const expDate = new Date(pair.callExpiration + "T12:00:00Z");
      const dte = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      const callMid = (metrics.bid + metrics.ask) / 2;
      const extrinsicValue = Math.max(0, callMid - metrics.intrinsicValue);
      const extrinsicPercentOfPremium =
        pair.callPremiumReceived > 0
          ? (extrinsicValue / pair.callPremiumReceived) * 100
          : 100;
      const netPremium = pair.callPremiumReceived - callMid;
      const unrealizedPl = (pair.callPremiumReceived - callMid) * 100 * pair.callContracts;
      const breakeven = pair.stockPurchasePrice - pair.callPremiumReceived;
      const unrealizedStockGainPercent =
        pair.stockPurchasePrice > 0
          ? ((stockPrice - pair.stockPurchasePrice) / pair.stockPurchasePrice) * 100
          : 0;

      const marketConditions = await getOptionMarketConditions(pair.symbol);
      const ivRank = await getIVRankOrPercentile(pair.symbol);

      const db = await getDb();
      const account = await db
        .collection<AccountDoc>("accounts")
        .findOne({ _id: new ObjectId(pair.accountId) });
      const riskLevel = account?.riskLevel ?? "medium";

      const { recommendation, confidence, reason } = applyCoveredCallRules({
        stockPrice,
        strike: pair.callStrike,
        dte,
        callBid: metrics.bid,
        callAsk: metrics.ask,
        premiumReceived: pair.callPremiumReceived,
        extrinsicPercentOfPremium,
        unrealizedStockGainPercent,
        moneyness: getMoneyness(stockPrice, pair.callStrike),
        ivRank,
        symbolChangePercent: marketConditions.symbolChangePercent ?? 0,
        riskLevel,
      });

      const daysHeld = 1;
      const annualizedReturn =
        pair.callPremiumReceived > 0 && daysHeld > 0
          ? (netPremium / pair.callPremiumReceived) * (365 / daysHeld) * 100
          : undefined;

      recommendations.push({
        accountId: pair.accountId,
        symbol: pair.symbol,
        stockPositionId: pair.stockPositionId,
        callPositionId: pair.callPositionId,
        recommendation,
        confidence,
        reason,
        metrics: {
          stockPrice,
          callBid: metrics.bid,
          callAsk: metrics.ask,
          dte,
          netPremium,
          unrealizedPl,
          annualizedReturn,
          breakeven,
          extrinsicValue,
          extrinsicPercentOfPremium,
          moneyness: getMoneyness(stockPrice, pair.callStrike),
          iv: metrics.impliedVolatility,
          ivRank: ivRank ?? undefined,
        },
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`CoveredCallAnalyzer: error for ${pair.symbol}:`, err);
    }
  }

  for (const opp of opportunities) {
    try {
      const chain = await getOptionChainDetailed(opp.symbol);
      if (!chain) continue;

      const stockPrice = chain.stock.price;

      recommendations.push({
        accountId: opp.accountId,
        symbol: opp.symbol,
        stockPositionId: opp.stockPositionId,
        recommendation: "SELL_NEW_CALL",
        confidence: "MEDIUM",
        reason: `${opp.stockShares} shares with no covered call. Opportunity to generate income.`,
        metrics: {
          stockPrice,
          callBid: 0,
          callAsk: 0,
          dte: 0,
          netPremium: 0,
          unrealizedPl: 0,
          breakeven: opp.stockPurchasePrice,
        },
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`CoveredCallAnalyzer: error for opportunity ${opp.symbol}:`, err);
    }
  }

  return recommendations;
}

/** Store recommendations in coveredCallRecommendations collection and create alerts. */
export async function storeCoveredCallRecommendations(
  recommendations: CoveredCallRecommendation[],
  options?: { createAlerts?: boolean }
): Promise<{ stored: number; alertsCreated: number }> {
  const db = await getDb();
  let stored = 0;
  let alertsCreated = 0;

  for (const rec of recommendations) {
    if (rec.recommendation === "NONE") continue;

    await db.collection("coveredCallRecommendations").insertOne({
      ...rec,
      storedAt: new Date().toISOString(),
    });
    stored++;

    if (
      options?.createAlerts &&
      (rec.recommendation === "BUY_TO_CLOSE" || rec.recommendation === "SELL_NEW_CALL" || rec.recommendation === "ROLL")
    ) {
      const alert = {
        type: "covered-call",
        accountId: rec.accountId,
        symbol: rec.symbol,
        recommendation: rec.recommendation,
        reason: rec.reason,
        metrics: rec.metrics,
        severity: "warning",
        createdAt: new Date().toISOString(),
        acknowledged: false,
      };
      await db.collection("alerts").insertOne(alert);
      alertsCreated++;
    }
  }

  return { stored, alertsCreated };
}
