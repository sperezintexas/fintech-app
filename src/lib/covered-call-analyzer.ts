/**
 * Covered Call Analyzer Service
 * Identifies covered call positions (long stock + short call), opportunities (long stock without call),
 * standalone call options from account holdings, and call options from the watchlist.
 * Evaluates and recommends: HOLD, BUY_TO_CLOSE, SELL_NEW_CALL, ROLL, NONE.
 */

import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { WatchlistItem } from "@/types/portfolio";
import {
  getOptionMetrics,
  getOptionChainDetailed,
  getIVRankOrPercentile,
  getOptionMarketConditions,
} from "@/lib/yahoo";
import { callCoveredCallDecision } from "@/lib/xai-grok";
import type {
  Position,
  CoveredCallRecommendation,
  CoveredCallRecommendationAction,
  CoveredCallConfidence,
  CoveredCallRecommendationMetrics,
  RiskLevel,
  JobConfig,
} from "@/types/portfolio";

const DEFAULT_MIN_STOCK_SHARES = 100;

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

export type StandaloneCallPosition = {
  accountId: string;
  symbol: string;
  callPositionId: string;
  callStrike: number;
  callExpiration: string;
  callContracts: number;
  callPremiumReceived: number;
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

/** Map rule-based confidence to numeric for Grok threshold. */
function confidenceToNum(c: CoveredCallConfidence): number {
  if (c === "HIGH") return 90;
  if (c === "MEDIUM") return 70;
  return 50;
}

/** Filter candidates for Grok: low confidence, low DTE, high IV, or ATM. */
export function isGrokCandidate(
  rec: {
    confidence: CoveredCallConfidence;
    metrics: Pick<CoveredCallRecommendationMetrics, "dte"> &
      Partial<Pick<CoveredCallRecommendationMetrics, "ivRank" | "moneyness">>;
  },
  cfg?: CoveredCallScannerConfig
): boolean {
  const minConf = cfg?.grokConfidenceMin ?? 70;
  const maxDte = cfg?.grokDteMax ?? 14;
  const minIvRank = cfg?.grokIvRankMin ?? 50;
  const confNum = confidenceToNum(rec.confidence);
  const ivRank = rec.metrics.ivRank ?? 0;
  return (
    confNum < minConf ||
    rec.metrics.dte < maxDte ||
    ivRank >= minIvRank ||
    rec.metrics.moneyness === "ATM"
  );
}

/** Config for covered call scanner (from job.config). */
export type CoveredCallScannerConfig = {
  minPremium?: number;
  maxDelta?: number;
  symbols?: string[];
  expirationRange?: { minDays?: number; maxDays?: number };
  minStockShares?: number;
  grokEnabled?: boolean;
  grokConfidenceMin?: number;
  grokDteMax?: number;
  grokIvRankMin?: number;
  grokMaxParallel?: number;
};

/** Fetch covered call pairs (stock + short call), opportunities (stock without call), and standalone call positions. */
export async function getCoveredCallPositions(
  accountId?: string,
  config?: CoveredCallScannerConfig | JobConfig
): Promise<{
  pairs: CoveredCallPair[];
  opportunities: StockOpportunity[];
  standaloneCalls: StandaloneCallPosition[];
}> {
  const db = await getDb();
  const query = accountId ? { _id: new ObjectId(accountId) } : {};
  const accounts = await db.collection<AccountDoc>("accounts").find(query).toArray();

  const minStockShares = (config as CoveredCallScannerConfig)?.minStockShares ?? DEFAULT_MIN_STOCK_SHARES;
  const symbolFilter = (config as CoveredCallScannerConfig)?.symbols?.map((s) => s.toUpperCase());

  const pairs: CoveredCallPair[] = [];
  const opportunities: StockOpportunity[] = [];
  const standaloneCalls: StandaloneCallPosition[] = [];

  if (accounts.length === 0) {
    console.warn("CoveredCallAnalyzer: no accounts found", accountId ? `(accountId=${accountId})` : "");
    return { pairs, opportunities, standaloneCalls };
  }

  for (const acc of accounts) {
    const positions = (acc.positions ?? []) as Position[];
    const stockPositions = positions.filter(
      (p) => p.type === "stock" && p.ticker && (p.shares ?? 0) >= minStockShares
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

    const matchedCallIds = new Set<string>();

    for (const stock of stockPositions) {
      const symbol = stock.ticker!.toUpperCase();
      const shares = stock.shares ?? 0;
      const purchasePrice = stock.purchasePrice ?? 0;
      const stockPosId = stock._id ?? `${acc._id}-stock-${symbol}`;

      if (symbolFilter && symbolFilter.length > 0 && !symbolFilter.includes(symbol)) continue;

      const matchingCall = callPositions.find(
        (c) => getUnderlyingFromTicker(c.ticker ?? "") === symbol
      );
      if (matchingCall) {
        matchedCallIds.add(matchingCall._id ?? `${acc._id}-call-${symbol}-${matchingCall.strike}`);
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

    for (const call of callPositions) {
      const callPosId = call._id ?? `${acc._id}-call-${getUnderlyingFromTicker(call.ticker ?? "")}-${call.strike}`;
      if (matchedCallIds.has(callPosId)) continue;
      const symbol = getUnderlyingFromTicker(call.ticker ?? "");
      if (!symbol) continue;
      if (symbolFilter && symbolFilter.length > 0 && !symbolFilter.includes(symbol)) continue;

      standaloneCalls.push({
        accountId: acc._id.toString(),
        symbol,
        callPositionId: callPosId,
        callStrike: call.strike!,
        callExpiration: call.expiration!,
        callContracts: call.contracts ?? 0,
        callPremiumReceived: call.premium ?? 0,
      });
    }
  }

  const totalStocks = accounts.reduce((n, a) => n + (a.positions ?? []).filter((p) => p.type === "stock" && (p.shares ?? 0) >= minStockShares).length, 0);
  const totalCalls = accounts.reduce((n, a) => n + (a.positions ?? []).filter((p) => p.type === "option" && p.optionType === "call").length, 0);
  if (pairs.length === 0 && standaloneCalls.length === 0 && (totalStocks > 0 || totalCalls > 0)) {
    console.warn(
      `CoveredCallAnalyzer: 0 pairs matched (${accounts.length} accounts, ${totalStocks} stocks ≥${minStockShares} shares, ${totalCalls} call positions). Check ticker format (use underlying symbol e.g. TSLA, or OCC format TSLA250117C250).`
    );
  }

  return { pairs, opportunities, standaloneCalls };
}

/** Fetch call/covered-call items from watchlist for evaluation. */
export async function getWatchlistCallItems(): Promise<Array<WatchlistItem & { _id: string }>> {
  const db = await getDb();
  const items = await db
    .collection("watchlist")
    .find({ $or: [{ type: "call" }, { type: "covered-call" }] })
    .toArray();
  return items.map((item) => ({
    ...item,
    _id: item._id.toString(),
  })) as Array<WatchlistItem & { _id: string }>;
}

function getMoneyness(stockPrice: number, strike: number): "ITM" | "ATM" | "OTM" {
  const pct = ((stockPrice - strike) / strike) * 100;
  if (pct > 2) return "ITM";
  if (pct < -2) return "OTM";
  return "ATM";
}

/** Main analysis: evaluate pairs, opportunities, standalone calls, and watchlist calls. */
export async function analyzeCoveredCalls(
  accountId?: string,
  config?: CoveredCallScannerConfig | JobConfig
): Promise<CoveredCallRecommendation[]> {
  const { pairs, opportunities, standaloneCalls } = await getCoveredCallPositions(accountId, config);
  const watchlistCalls = await getWatchlistCallItems();
  const recommendations: CoveredCallRecommendation[] = [];
  const cfg = config as CoveredCallScannerConfig | undefined;

  for (const pair of pairs) {
    try {
      const expDate = new Date(pair.callExpiration + "T12:00:00Z");
      const dte = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      if (cfg?.minPremium != null && pair.callPremiumReceived < cfg.minPremium) continue;
      if (cfg?.expirationRange?.minDays != null && dte < cfg.expirationRange.minDays) continue;
      if (cfg?.expirationRange?.maxDays != null && dte > cfg.expirationRange.maxDays) continue;

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

      const delta = (metrics as { delta?: number }).delta;
      if (cfg?.maxDelta != null && delta != null && delta > cfg.maxDelta) continue;

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
        source: "holdings",
        recommendation,
        confidence,
        reason,
        strikePrice: pair.callStrike,
        expirationDate: pair.callExpiration,
        entryPremium: pair.callPremiumReceived,
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
        source: "holdings",
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

  for (const call of standaloneCalls) {
    try {
      const expDate = new Date(call.callExpiration + "T12:00:00Z");
      const dte = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      if (cfg?.minPremium != null && call.callPremiumReceived < cfg.minPremium) continue;
      if (cfg?.expirationRange?.minDays != null && dte < cfg.expirationRange.minDays) continue;
      if (cfg?.expirationRange?.maxDays != null && dte > cfg.expirationRange.maxDays) continue;

      const metrics = await getOptionMetrics(
        call.symbol,
        call.callExpiration,
        call.callStrike,
        "call"
      );
      if (!metrics) {
        console.warn(
          `CoveredCallAnalyzer: no metrics for standalone call ${call.symbol} ${call.callExpiration} ${call.callStrike}`
        );
        continue;
      }

      const stockPrice = metrics.underlyingPrice;
      const callMid = (metrics.bid + metrics.ask) / 2;
      const extrinsicValue = Math.max(0, callMid - metrics.intrinsicValue);
      const extrinsicPercentOfPremium =
        call.callPremiumReceived > 0
          ? (extrinsicValue / call.callPremiumReceived) * 100
          : 100;
      const netPremium = call.callPremiumReceived - callMid;
      const unrealizedPl = (call.callPremiumReceived - callMid) * 100 * call.callContracts;

      const marketConditions = await getOptionMarketConditions(call.symbol);
      const ivRank = await getIVRankOrPercentile(call.symbol);

      const account = await getDb().then((db) =>
        db.collection<AccountDoc>("accounts").findOne({ _id: new ObjectId(call.accountId) })
      );
      const riskLevel = account?.riskLevel ?? "medium";

      const { recommendation, confidence, reason } = applyCoveredCallRules({
        stockPrice,
        strike: call.callStrike,
        dte,
        callBid: metrics.bid,
        callAsk: metrics.ask,
        premiumReceived: call.callPremiumReceived,
        extrinsicPercentOfPremium,
        unrealizedStockGainPercent: 0,
        moneyness: getMoneyness(stockPrice, call.callStrike),
        ivRank,
        symbolChangePercent: marketConditions.symbolChangePercent ?? 0,
        riskLevel,
      });

      recommendations.push({
        accountId: call.accountId,
        symbol: call.symbol,
        callPositionId: call.callPositionId,
        source: "holdings",
        recommendation,
        confidence,
        reason,
        strikePrice: call.callStrike,
        expirationDate: call.callExpiration,
        entryPremium: call.callPremiumReceived,
        metrics: {
          stockPrice,
          callBid: metrics.bid,
          callAsk: metrics.ask,
          dte,
          netPremium,
          unrealizedPl,
          breakeven: stockPrice,
          extrinsicValue,
          extrinsicPercentOfPremium,
          moneyness: getMoneyness(stockPrice, call.callStrike),
          iv: metrics.impliedVolatility,
          ivRank: ivRank ?? undefined,
        },
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`CoveredCallAnalyzer: error for standalone call ${call.symbol}:`, err);
    }
  }

  for (const item of watchlistCalls) {
    const rawSymbol = item.underlyingSymbol || item.symbol;
    if (!rawSymbol) {
      console.warn(`CoveredCallAnalyzer: watchlist item ${item._id} missing symbol`);
      continue;
    }
    const symbol = rawSymbol.toUpperCase();
    if (cfg?.symbols?.length && !cfg.symbols.map((s) => s.toUpperCase()).includes(symbol)) continue;

    const strike = item.strikePrice;
    const expiration = item.expirationDate;
    if (!strike || !expiration) {
      console.warn(`CoveredCallAnalyzer: watchlist item ${item._id} missing strike or expiration`);
      continue;
    }
    try {
      const metrics = await getOptionMetrics(symbol, expiration, strike, "call");
      if (!metrics) {
        console.warn(
          `CoveredCallAnalyzer: no metrics for watchlist call ${symbol} ${expiration} ${strike}`
        );
        continue;
      }

      const stockPrice = metrics.underlyingPrice;
      const expDate = new Date(expiration + "T12:00:00Z");
      const dte = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      const callMid = (metrics.bid + metrics.ask) / 2;
      const premiumReceived = item.entryPremium ?? 0;
      const extrinsicValue = Math.max(0, callMid - metrics.intrinsicValue);
      const extrinsicPercentOfPremium =
        premiumReceived > 0 ? (extrinsicValue / premiumReceived) * 100 : 100;
      const netPremium = premiumReceived - callMid;
      const contracts = item.quantity || 1;
      const unrealizedPl = (premiumReceived - callMid) * 100 * contracts;
      const stockPurchasePrice = item.type === "covered-call" ? item.entryPrice : stockPrice;
      const unrealizedStockGainPercent =
        stockPurchasePrice > 0
          ? ((stockPrice - stockPurchasePrice) / stockPurchasePrice) * 100
          : 0;

      const marketConditions = await getOptionMarketConditions(symbol);
      const ivRank = await getIVRankOrPercentile(symbol);

      const accId = item.accountId || (accountId ?? "");
      const account =
        accId && ObjectId.isValid(accId) && accId.length === 24
          ? await getDb().then((db) =>
              db.collection<AccountDoc>("accounts").findOne({ _id: new ObjectId(accId) })
            )
          : null;
      const riskLevel = account?.riskLevel ?? "medium";

      const { recommendation, confidence, reason } = applyCoveredCallRules({
        stockPrice,
        strike,
        dte,
        callBid: metrics.bid,
        callAsk: metrics.ask,
        premiumReceived,
        extrinsicPercentOfPremium,
        unrealizedStockGainPercent,
        moneyness: getMoneyness(stockPrice, strike),
        ivRank,
        symbolChangePercent: marketConditions.symbolChangePercent ?? 0,
        riskLevel,
      });

      recommendations.push({
        accountId: accId || "portfolio",
        symbol,
        watchlistItemId: item._id,
        source: "watchlist",
        recommendation,
        confidence,
        reason,
        strikePrice: strike,
        expirationDate: expiration,
        entryPremium: premiumReceived,
        metrics: {
          stockPrice,
          callBid: metrics.bid,
          callAsk: metrics.ask,
          dte,
          netPremium,
          unrealizedPl,
          breakeven: stockPurchasePrice,
          extrinsicValue,
          extrinsicPercentOfPremium,
          moneyness: getMoneyness(stockPrice, strike),
          iv: metrics.impliedVolatility,
          ivRank: ivRank ?? undefined,
        },
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`CoveredCallAnalyzer: error for watchlist call ${item.symbol}:`, err);
    }
  }

  return enhanceRecommendationsWithGrok(recommendations, cfg);
}

/** Post-process: enhance borderline candidates with Grok. */
async function enhanceRecommendationsWithGrok(
  recs: CoveredCallRecommendation[],
  cfg?: CoveredCallScannerConfig
): Promise<CoveredCallRecommendation[]> {
  if (cfg?.grokEnabled === false) return recs;
  const candidates = recs.filter((r) => r.strikePrice != null && r.expirationDate != null && isGrokCandidate(r, cfg));
  if (candidates.length === 0) return recs;

  const grokMax = cfg?.grokMaxParallel ?? 6;
  const results = new Map<number, CoveredCallRecommendation | null>();

  for (let i = 0; i < candidates.length; i += grokMax) {
    const batch = candidates.slice(i, i + grokMax);
    const grokPromises = batch.map(async (rec, batchIdx) => {
      const globalIdx = recs.indexOf(rec);
      try {
        const grokResult = await callCoveredCallDecision({
          position: {
            symbol: rec.symbol,
            strike: rec.strikePrice!,
            expiration: rec.expirationDate!,
            premiumReceived: rec.entryPremium ?? rec.metrics.callBid,
            quantity: 1,
          },
          marketData: {
            stockPrice: rec.metrics.stockPrice,
            callBid: rec.metrics.callBid,
            callAsk: rec.metrics.callAsk,
            dte: rec.metrics.dte,
            unrealizedPl: rec.metrics.unrealizedPl,
            extrinsicPercentOfPremium: rec.metrics.extrinsicPercentOfPremium,
            ivRank: rec.metrics.ivRank,
            moneyness: rec.metrics.moneyness,
          },
          preliminary: { recommendation: rec.recommendation, reason: rec.reason },
        });
        if (grokResult) {
          const grokConf: CoveredCallConfidence =
            grokResult.confidence >= 0.8 ? "HIGH" : grokResult.confidence >= 0.6 ? "MEDIUM" : "LOW";
          return {
            ...rec,
            recommendation: grokResult.recommendation as CoveredCallRecommendationAction,
            confidence: grokConf,
            reason: grokResult.reasoning || rec.reason,
            grokEvaluated: true,
            grokReasoning: grokResult.reasoning,
          };
        }
      } catch (err) {
        console.error(`CoveredCallAnalyzer: Grok failed for ${rec.symbol}:`, err);
      }
      return null;
    });
    const batchResults = await Promise.all(grokPromises);
    batchResults.forEach((r, batchIdx) => {
      if (r) results.set(recs.indexOf(batch[batchIdx]), r);
    });
  }

  return recs.map((rec, idx) => results.get(idx) ?? rec);
}

export type AdHocOptionInput = {
  symbol: string;
  strike: number;
  expiration: string;
  entryPremium?: number;
  quantity?: number;
  stockPurchasePrice?: number;
  accountId?: string;
};

/** Analyze a single option (e.g. from xStrategyBuilder Review Order). Uses same rules as full scanner. */
export async function analyzeCoveredCallForOption(
  input: AdHocOptionInput,
  config?: CoveredCallScannerConfig | JobConfig
): Promise<CoveredCallRecommendation[]> {
  const { symbol, strike, expiration, entryPremium = 0, quantity = 1, stockPurchasePrice, accountId } = input;
  const sym = symbol.toUpperCase();
  const cfg = config as CoveredCallScannerConfig | undefined;

  if (cfg?.symbols?.length && !cfg.symbols.map((s) => s.toUpperCase()).includes(sym)) {
    return [];
  }

  const metrics = await getOptionMetrics(sym, expiration, strike, "call");
  if (!metrics) {
    console.warn(`CoveredCallAnalyzer: no metrics for ${sym} ${expiration} ${strike}`);
    return [];
  }

  const stockPrice = metrics.underlyingPrice;
  const expDate = new Date(expiration + "T12:00:00Z");
  const dte = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const callMid = (metrics.bid + metrics.ask) / 2;
  const premiumReceived = entryPremium > 0 ? entryPremium : callMid;
  const extrinsicValue = Math.max(0, callMid - metrics.intrinsicValue);
  const extrinsicPercentOfPremium =
    premiumReceived > 0 ? (extrinsicValue / premiumReceived) * 100 : 100;
  const stockPurchase = stockPurchasePrice ?? stockPrice;
  const unrealizedStockGainPercent =
    stockPurchase > 0 ? ((stockPrice - stockPurchase) / stockPurchase) * 100 : 0;

  if (cfg?.minPremium != null && premiumReceived < cfg.minPremium) return [];
  if (cfg?.expirationRange?.minDays != null && dte < cfg.expirationRange.minDays) return [];
  if (cfg?.expirationRange?.maxDays != null && dte > cfg.expirationRange.maxDays) return [];

  const delta = (metrics as { delta?: number }).delta;
  if (cfg?.maxDelta != null && delta != null && delta > cfg.maxDelta) return [];

  const marketConditions = await getOptionMarketConditions(sym);
  const ivRank = await getIVRankOrPercentile(sym);

  const accId = accountId ?? "";
  const account =
    accId && ObjectId.isValid(accId) && accId.length === 24
      ? await getDb().then((db) =>
          db.collection<AccountDoc>("accounts").findOne({ _id: new ObjectId(accId) })
        )
      : null;
  const riskLevel = account?.riskLevel ?? "medium";

  const { recommendation, confidence, reason } = applyCoveredCallRules({
    stockPrice,
    strike,
    dte,
    callBid: metrics.bid,
    callAsk: metrics.ask,
    premiumReceived,
    extrinsicPercentOfPremium,
    unrealizedStockGainPercent,
    moneyness: getMoneyness(stockPrice, strike),
    ivRank,
    symbolChangePercent: marketConditions.symbolChangePercent ?? 0,
    riskLevel,
  });

  const baseRec: CoveredCallRecommendation = {
    accountId: accId || "portfolio",
    symbol: sym,
    source: "watchlist",
    recommendation,
    confidence,
    reason,
    metrics: {
      stockPrice,
      callBid: metrics.bid,
      callAsk: metrics.ask,
      dte,
      netPremium: premiumReceived - callMid,
      unrealizedPl: (premiumReceived - callMid) * 100 * quantity,
      breakeven: stockPurchase,
      extrinsicValue,
      extrinsicPercentOfPremium,
      moneyness: getMoneyness(stockPrice, strike),
      iv: metrics.impliedVolatility,
      ivRank: ivRank ?? undefined,
    },
    createdAt: new Date().toISOString(),
  };

  if (cfg?.grokEnabled !== false && isGrokCandidate(baseRec, cfg)) {
    try {
      const grokResult = await callCoveredCallDecision({
        position: {
          symbol: sym,
          strike,
          expiration,
          premiumReceived,
          quantity,
        },
        marketData: {
          stockPrice,
          callBid: metrics.bid,
          callAsk: metrics.ask,
          dte,
          unrealizedPl: (premiumReceived - callMid) * 100 * quantity,
          extrinsicPercentOfPremium,
          ivRank: ivRank ?? undefined,
          moneyness: getMoneyness(stockPrice, strike),
        },
        preliminary: { recommendation, reason },
        accountContext: account ? { riskProfile: account.riskLevel } : undefined,
      });
      if (grokResult) {
        const grokConf: CoveredCallConfidence =
          grokResult.confidence >= 0.8 ? "HIGH" : grokResult.confidence >= 0.6 ? "MEDIUM" : "LOW";
        return [
          {
            ...baseRec,
            recommendation: grokResult.recommendation as CoveredCallRecommendationAction,
            confidence: grokConf,
            reason: grokResult.reasoning || baseRec.reason,
            grokEvaluated: true,
            grokReasoning: grokResult.reasoning,
          },
        ];
      }
    } catch (err) {
      console.error("CoveredCallAnalyzer: Grok evaluation failed, using rule-based:", err);
    }
  }

  return [baseRec];
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
      const alert: Record<string, unknown> = {
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
      if (rec.watchlistItemId) alert.watchlistItemId = rec.watchlistItemId;
      if (rec.source) alert.source = rec.source;
      await db.collection("alerts").insertOne(alert);
      alertsCreated++;
    }
  }

  return { stored, alertsCreated };
}
