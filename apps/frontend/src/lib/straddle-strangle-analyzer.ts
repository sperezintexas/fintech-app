/**
 * Straddle & Strangle Analyzer Service
 * Identifies long straddle (ATM call + ATM put) and long strangle (OTM call + OTM put) positions.
 * Evaluates and recommends: HOLD, SELL_TO_CLOSE, ROLL, ADD, NONE.
 */

import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getOptionMetrics, getIVRankOrPercentile } from "@/lib/yahoo";
import type { Position, RiskLevel } from "@/types/portfolio";

type AccountDoc = { _id: ObjectId; positions?: Position[]; riskLevel?: RiskLevel };

export type StraddleStrangleRecommendationAction =
  | "HOLD"
  | "SELL_TO_CLOSE"
  | "ROLL"
  | "ADD"
  | "NONE";

export type StraddleStrangleConfidence = "HIGH" | "MEDIUM" | "LOW";

export type StraddleStrangleRecommendation = {
  accountId: string;
  symbol: string;
  callPositionId?: string;
  putPositionId?: string;
  isStraddle: boolean;
  recommendation: StraddleStrangleRecommendationAction;
  confidence: StraddleStrangleConfidence;
  reason: string;
  suggestedCallStrike?: number;
  suggestedPutStrike?: number;
  suggestedExpiration?: string;
  metrics: {
    stockPrice: number;
    callBid: number;
    callAsk: number;
    putBid: number;
    putAsk: number;
    dte: number;
    netCurrentValue: number;
    combinedTheta: number;
    netVega: number;
    upperBreakeven: number;
    lowerBreakeven: number;
    requiredMovePercent: number;
    ivRankCurrent: number;
    ivVsHvDiff: number;
    unrealizedPl: number;
  };
  createdAt: string;
};

type StraddleStranglePair = {
  accountId: string;
  symbol: string;
  callPositionId: string;
  callStrike: number;
  callExpiration: string;
  callContracts: number;
  callPremiumPaid: number;
  putPositionId: string;
  putStrike: number;
  putExpiration: string;
  putContracts: number;
  putPremiumPaid: number;
  isStraddle: boolean;
};

/** Extract underlying symbol from option ticker (e.g. TSLA240320C250 -> TSLA). */
function getUnderlyingFromTicker(ticker: string): string {
  return ticker?.replace(/\d.*$/, "").toUpperCase() ?? "";
}

/** Pure function: apply straddle/strangle rules. Unit-testable. */
export function applyStraddleStrangleRules(
  metrics: {
    dte: number;
    netCurrentValue: number;
    entryCost: number;
    extrinsicPercentOfEntry: number;
    unrealizedPlPercent: number;
    ivRankCurrent: number | null;
    ivVsHvDiff: number;
    stockAboveUpperBreakeven: boolean;
    stockBelowLowerBreakeven: boolean;
    requiredMovePercent: number;
    riskLevel: RiskLevel;
  }
): {
  recommendation: StraddleStrangleRecommendationAction;
  confidence: StraddleStrangleConfidence;
  reason: string;
} {
  const {
    dte,
    entryCost,
    extrinsicPercentOfEntry,
    unrealizedPlPercent,
    ivRankCurrent,
    stockAboveUpperBreakeven,
    stockBelowLowerBreakeven,
    requiredMovePercent,
    riskLevel,
  } = metrics;

  // DTE ≤ 7–10 & combined extrinsic < 20–25% of entry cost → SELL_TO_CLOSE
  if (dte <= 10 && extrinsicPercentOfEntry < 25 && entryCost > 0) {
    return {
      recommendation: "SELL_TO_CLOSE",
      confidence: "HIGH",
      reason: `Heavy theta burn: DTE ${dte}, extrinsic ${extrinsicPercentOfEntry.toFixed(0)}% of entry. Little vol left to capture.`,
    };
  }

  // Stock moved past breakeven & position profitable → SELL_TO_CLOSE
  if ((stockAboveUpperBreakeven || stockBelowLowerBreakeven) && unrealizedPlPercent > 0) {
    return {
      recommendation: "SELL_TO_CLOSE",
      confidence: "HIGH",
      reason: `Position profitable (${unrealizedPlPercent.toFixed(0)}%), stock past breakeven. Take profit.`,
    };
  }

  // IV rank dropped > 20–30 points (proxy: IV rank < 30 when position losing) → SELL_TO_CLOSE
  if (ivRankCurrent != null && ivRankCurrent < 30 && unrealizedPlPercent < -15) {
    return {
      recommendation: "SELL_TO_CLOSE",
      confidence: "MEDIUM",
      reason: `IV rank low (${ivRankCurrent}), position down ${unrealizedPlPercent.toFixed(0)}%. Volatility contraction realized.`,
    };
  }

  // IV rank > 70–80 & DTE > 30 → HOLD or ADD
  if (ivRankCurrent != null && ivRankCurrent > 70 && dte > 30) {
    return {
      recommendation: "HOLD",
      confidence: "HIGH",
      reason: `High IV rank (${ivRankCurrent}), DTE ${dte}. Ideal for long straddle/strangle.`,
    };
  }

  // Conservative account & DTE < 14 → SELL_TO_CLOSE
  if (riskLevel === "low" && dte < 14) {
    return {
      recommendation: "SELL_TO_CLOSE",
      confidence: "MEDIUM",
      reason: `Conservative account, DTE ${dte}. Reduce exposure.`,
    };
  }

  // Default: HOLD
  return {
    recommendation: "HOLD",
    confidence: "MEDIUM",
    reason: `Position neutral. DTE ${dte}, required move ${requiredMovePercent.toFixed(1)}% to breakeven. Monitor.`,
  };
}

/** Fetch straddle/strangle pairs (long call + long put, same underlying, same expiration). */
export async function getStraddleStranglePositions(
  accountId?: string
): Promise<StraddleStranglePair[]> {
  const db = await getDb();
  const query = accountId ? { _id: new ObjectId(accountId) } : {};
  const accounts = await db.collection<AccountDoc>("accounts").find(query).toArray();

  const pairs: StraddleStranglePair[] = [];

  for (const acc of accounts) {
    const positions = (acc.positions ?? []) as Position[];
    const callPositions = positions.filter(
      (p) =>
        p.type === "option" &&
        p.optionType === "call" &&
        p.ticker &&
        p.strike != null &&
        p.expiration &&
        (p.contracts ?? 0) > 0
    );
    const putPositions = positions.filter(
      (p) =>
        p.type === "option" &&
        p.optionType === "put" &&
        p.ticker &&
        p.strike != null &&
        p.expiration &&
        (p.contracts ?? 0) > 0
    );

    const usedPutIds = new Set<string>();
    for (const call of callPositions) {
      const underlying = getUnderlyingFromTicker(call.ticker!);
      if (!underlying) continue;

      const put = putPositions.find(
        (p) =>
          !usedPutIds.has(p._id ?? "") &&
          getUnderlyingFromTicker(p.ticker!) === underlying &&
          p.expiration === call.expiration
      );
      if (!put) continue;
      usedPutIds.add(put._id ?? `${put.ticker}-${put.strike}-${put.expiration}`);

      const stockPrice = call.currentPrice ?? put.currentPrice ?? 0;
      const strikeDiff = Math.abs(call.strike! - put.strike!);
      const isStraddle = strikeDiff <= (stockPrice || call.strike!) * 0.05;

      pairs.push({
        accountId: acc._id.toString(),
        symbol: underlying,
        callPositionId: call._id ?? `${acc._id}-call-${call.ticker}-${call.strike}`,
        callStrike: call.strike!,
        callExpiration: call.expiration!,
        callContracts: call.contracts ?? 0,
        callPremiumPaid: (call.premium ?? 0) * (call.contracts ?? 0) * 100,
        putPositionId: put._id ?? `${acc._id}-put-${put.ticker}-${put.strike}`,
        putStrike: put.strike!,
        putExpiration: put.expiration!,
        putContracts: put.contracts ?? 0,
        putPremiumPaid: (put.premium ?? 0) * (put.contracts ?? 0) * 100,
        isStraddle,
      });
    }
  }

  return pairs;
}

/** Config for straddle/strangle scanner (e.g. from unified job config). */
export type StraddleStrangleRunConfig = { riskLevel?: "low" | "medium" | "high" };

/** Main analysis: evaluate pairs, return recommendations. */
export async function analyzeStraddlesAndStrangles(
  accountId?: string,
  config?: StraddleStrangleRunConfig
): Promise<StraddleStrangleRecommendation[]> {
  const pairs = await getStraddleStranglePositions(accountId);
  const recommendations: StraddleStrangleRecommendation[] = [];

  for (const pair of pairs) {
    try {
      const [callMetrics, putMetrics] = await Promise.all([
        getOptionMetrics(pair.symbol, pair.callExpiration, pair.callStrike, "call"),
        getOptionMetrics(pair.symbol, pair.putExpiration, pair.putStrike, "put"),
      ]);

      if (!callMetrics || !putMetrics) {
        console.warn(
          `StraddleStrangleAnalyzer: no metrics for ${pair.symbol} ${pair.callExpiration}`
        );
        continue;
      }

      const stockPrice = callMetrics.underlyingPrice;
      const callMid = (callMetrics.bid + callMetrics.ask) / 2;
      const putMid = (putMetrics.bid + putMetrics.ask) / 2;
      const netCurrentValue = (callMid + putMid) * Math.min(pair.callContracts, pair.putContracts) * 100;
      const entryCost = pair.callPremiumPaid + pair.putPremiumPaid;
      const unrealizedPl = netCurrentValue - entryCost;
      const unrealizedPlPercent = entryCost > 0 ? (unrealizedPl / entryCost) * 100 : 0;

      const expDate = new Date(pair.callExpiration + "T12:00:00Z");
      const dte = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

      const contracts = Math.min(pair.callContracts, pair.putContracts);
      const perSharePremium = entryCost / (contracts * 100);
      const upperBreakeven = Math.max(pair.callStrike, pair.putStrike) + perSharePremium;
      const lowerBreakeven = Math.min(pair.callStrike, pair.putStrike) - perSharePremium;
      const requiredMovePercent = Math.min(
        Math.abs((upperBreakeven - stockPrice) / stockPrice) * 100,
        Math.abs((stockPrice - lowerBreakeven) / stockPrice) * 100
      );

      const extrinsicCall = Math.max(0, callMid - callMetrics.intrinsicValue);
      const extrinsicPut = Math.max(0, putMid - putMetrics.intrinsicValue);
      const combinedExtrinsic = (extrinsicCall + extrinsicPut) * Math.min(pair.callContracts, pair.putContracts) * 100;
      const extrinsicPercentOfEntry = entryCost > 0 ? (combinedExtrinsic / entryCost) * 100 : 100;

      const ivRank = await getIVRankOrPercentile(pair.symbol);
      const ivVsHvDiff = (callMetrics.impliedVolatility ?? 0) * 100 - 25;

      const db = await getDb();
      const account = await db.collection<AccountDoc>("accounts").findOne({ _id: new ObjectId(pair.accountId) });
      const riskLevel = config?.riskLevel ?? account?.riskLevel ?? "medium";

      const { recommendation, confidence, reason } = applyStraddleStrangleRules({
        dte,
        netCurrentValue,
        entryCost,
        extrinsicPercentOfEntry,
        unrealizedPlPercent,
        ivRankCurrent: ivRank,
        ivVsHvDiff,
        stockAboveUpperBreakeven: stockPrice >= upperBreakeven,
        stockBelowLowerBreakeven: stockPrice <= lowerBreakeven,
        requiredMovePercent,
        riskLevel,
      });

      recommendations.push({
        accountId: pair.accountId,
        symbol: pair.symbol,
        callPositionId: pair.callPositionId,
        putPositionId: pair.putPositionId,
        isStraddle: pair.isStraddle,
        recommendation,
        confidence,
        reason,
        metrics: {
          stockPrice,
          callBid: callMetrics.bid,
          callAsk: callMetrics.ask,
          putBid: putMetrics.bid,
          putAsk: putMetrics.ask,
          dte,
          netCurrentValue,
          combinedTheta: -(callMetrics.timeValue + putMetrics.timeValue) * 0.1,
          netVega: (callMetrics.impliedVolatility ?? 0) + (putMetrics.impliedVolatility ?? 0),
          upperBreakeven,
          lowerBreakeven,
          requiredMovePercent,
          ivRankCurrent: ivRank ?? 0,
          ivVsHvDiff,
          unrealizedPl,
        },
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`StraddleStrangleAnalyzer: error for ${pair.symbol}:`, err);
    }
  }

  return recommendations;
}

async function getAccountDisplayName(
  db: Awaited<ReturnType<typeof getDb>>,
  accountId: string
): Promise<string | undefined> {
  try {
    const acc = await db.collection("accounts").findOne(
      { _id: new ObjectId(accountId) },
      { projection: { name: 1, broker: 1 } }
    );
    if (!acc) return undefined;
    const a = acc as { name?: string; broker?: string };
    return a.broker ?? a.name;
  } catch {
    return undefined;
  }
}

/** Store recommendations and create alerts. */
export async function storeStraddleStrangleRecommendations(
  recommendations: StraddleStrangleRecommendation[],
  options?: { createAlerts?: boolean }
): Promise<{ stored: number; alertsCreated: number }> {
  const db = await getDb();
  let stored = 0;
  let alertsCreated = 0;

  for (const rec of recommendations) {
    if (rec.recommendation === "NONE") continue;

    await db.collection("straddleStrangleRecommendations").insertOne({
      ...rec,
      storedAt: new Date().toISOString(),
    });
    stored++;

    if (
      options?.createAlerts &&
      (rec.recommendation === "SELL_TO_CLOSE" || rec.recommendation === "ROLL" || rec.recommendation === "ADD")
    ) {
      const accountName = await getAccountDisplayName(db, rec.accountId);
      const alert = {
        type: "straddle-strangle",
        accountId: rec.accountId,
        accountName: accountName ?? undefined,
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
