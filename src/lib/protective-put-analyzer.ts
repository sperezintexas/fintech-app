/**
 * Protective Put Analyzer Service
 * Identifies protective put positions (long stock + long put) and opportunities (long stock without put).
 * Evaluates and recommends: HOLD, SELL_TO_CLOSE, ROLL, BUY_NEW_PUT, NONE.
 */

import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import {
  getOptionMetrics,
  getOptionChainDetailed,
  getIVRankOrPercentile,
  type OptionChainDetailedData,
} from "@/lib/yahoo";
import type {
  Position,
  ProtectivePutRecommendation,
  ProtectivePutRecommendationAction,
  ProtectivePutConfidence,
  RiskLevel,
  JobConfig,
} from "@/types/portfolio";

const DEFAULT_MIN_STOCK_SHARES = 100;

export type CspAnalysisConfig = {
  minYield?: number;
  riskTolerance?: "low" | "medium" | "high";
  watchlistId?: string;
  minStockShares?: number;
  /** Single-stock mode: analyze only this symbol (mutually exclusive with account-based scan). */
  symbol?: string;
  /** Include watchlist items when supported. Default true. */
  includeWatchlist?: boolean;
};

type AccountDoc = { _id: ObjectId; positions?: Position[]; riskLevel?: RiskLevel };

/** Extract underlying symbol from option ticker (e.g. TSLA250117P250 -> TSLA). */
function getUnderlyingFromTicker(ticker: string): string {
  return ticker?.replace(/\d.*$/, "").toUpperCase() ?? "";
}

export type ProtectivePutPair = {
  accountId: string;
  symbol: string;
  stockPositionId: string;
  stockShares: number;
  stockPurchasePrice: number;
  stockCurrentPrice?: number;
  stockUnrealizedPlPercent?: number;
  putPositionId: string;
  putStrike: number;
  putExpiration: string;
  putContracts: number;
  putPremiumPaid: number;
};

export type StockWithoutPut = {
  accountId: string;
  symbol: string;
  stockPositionId: string;
  stockShares: number;
  stockPurchasePrice: number;
  stockCurrentPrice?: number;
};

/** Put moneyness: ITM when stock < strike, OTM when stock > strike. */
function getPutMoneyness(stockPrice: number, strike: number): "ITM" | "ATM" | "OTM" {
  const pct = ((strike - stockPrice) / strike) * 100;
  if (pct > 2) return "ITM";
  if (pct < -2) return "OTM";
  return "ATM";
}

/** Pure function: apply protective put rules. Unit-testable. */
export function applyProtectivePutRules(
  metrics: {
    stockPrice: number;
    strike: number;
    dte: number;
    putBid: number;
    putAsk: number;
    premiumPaid: number;
    extrinsicPercentOfPremium: number;
    stockUnrealizedPlPercent: number;
    moneyness: "ITM" | "ATM" | "OTM";
    putDelta: number | null;
    ivRank: number | null;
    riskLevel: RiskLevel;
    stockAboveBreakeven: boolean;
  }
): { recommendation: ProtectivePutRecommendationAction; confidence: ProtectivePutConfidence; reason: string } {
  const {
    stockPrice,
    strike,
    dte,
    putBid: _putBid,
    premiumPaid,
    extrinsicPercentOfPremium,
    stockUnrealizedPlPercent,
    moneyness,
    putDelta,
    ivRank,
    riskLevel,
    stockAboveBreakeven,
  } = metrics;

  const stockAboveStrikePercent = ((stockPrice - strike) / strike) * 100;

  // Stock > put strike + 10–15% buffer → STC (protection no longer cost-effective)
  if (stockAboveStrikePercent >= 12) {
    return {
      recommendation: "SELL_TO_CLOSE",
      confidence: "HIGH",
      reason: `Stock ${stockAboveStrikePercent.toFixed(1)}% above strike. Protection no longer cost-effective.`,
    };
  }

  // Put extrinsic < 10% of original premium → STC or roll out
  if (extrinsicPercentOfPremium < 10 && premiumPaid > 0) {
    return {
      recommendation: "SELL_TO_CLOSE",
      confidence: "HIGH",
      reason: `Most time value decayed (${extrinsicPercentOfPremium.toFixed(0)}% extrinsic). Hedge expensive relative to remaining protection.`,
    };
  }

  // DTE ≤ 10 & put OTM → STC
  if (dte <= 10 && moneyness === "OTM") {
    return {
      recommendation: "SELL_TO_CLOSE",
      confidence: "HIGH",
      reason: `DTE ${dte}, put OTM. Little protection left; avoid paying for near-worthless insurance.`,
    };
  }

  // Stock dropped > 8–12% & put ITM → HOLD or roll down/out
  if (stockUnrealizedPlPercent < -10 && moneyness === "ITM") {
    return {
      recommendation: "HOLD",
      confidence: "HIGH",
      reason: `Stock down ${Math.abs(stockUnrealizedPlPercent).toFixed(0)}%, put ITM. Hedge is working — keep protection.`,
    };
  }

  // IV rank high (spike proxy) → HOLD
  if (ivRank != null && ivRank > 50) {
    return {
      recommendation: "HOLD",
      confidence: "MEDIUM",
      reason: `High IV rank (${ivRank}). Put value elevated — good time to keep hedge.`,
    };
  }

  // Account aggressive & stock > breakeven → STC
  if (riskLevel === "high" && stockAboveBreakeven) {
    return {
      recommendation: "SELL_TO_CLOSE",
      confidence: "MEDIUM",
      reason: `Aggressive account, stock above breakeven. Remove hedge to free capital.`,
    };
  }

  // Put delta ≤ -0.25 & stock stable (OTM) → STC
  if (putDelta != null && putDelta >= -0.25 && moneyness === "OTM") {
    return {
      recommendation: "SELL_TO_CLOSE",
      confidence: "MEDIUM",
      reason: `Put far OTM (delta ${putDelta.toFixed(2)}). Protection ineffective relative to cost.`,
    };
  }

  // Stock > strike + 10% (approaching STC zone)
  if (stockAboveStrikePercent >= 10) {
    return {
      recommendation: "SELL_TO_CLOSE",
      confidence: "MEDIUM",
      reason: `Stock ${stockAboveStrikePercent.toFixed(1)}% above strike. Consider closing hedge.`,
    };
  }

  // Default: HOLD
  if (moneyness === "ITM" || (dte > 10 && moneyness === "ATM")) {
    return {
      recommendation: "HOLD",
      confidence: "MEDIUM",
      reason: `Protection active. DTE ${dte}, ${moneyness}. Monitor.`,
    };
  }

  return {
    recommendation: "HOLD",
    confidence: "LOW",
    reason: `Position neutral. DTE ${dte}, ${moneyness}. Monitor.`,
  };
}

/** Fetch protective put pairs (stock + long put) and opportunities (stock without put). */
export async function getProtectivePutPositions(
  accountId?: string,
  config?: CspAnalysisConfig | JobConfig
): Promise<{ pairs: ProtectivePutPair[]; opportunities: StockWithoutPut[] }> {
  const cfg = config as CspAnalysisConfig | undefined;
  const minStockShares = cfg?.minStockShares ?? DEFAULT_MIN_STOCK_SHARES;
  const pairs: ProtectivePutPair[] = [];
  const opportunities: StockWithoutPut[] = [];

  if (cfg?.symbol) {
    const sym = cfg.symbol.trim().toUpperCase();
    if (!sym) return { pairs, opportunities };
    opportunities.push({
      accountId: "symbol-mode",
      symbol: sym,
      stockPositionId: `syn-${sym}`,
      stockShares: minStockShares,
      stockPurchasePrice: 0,
    });
    return { pairs, opportunities };
  }

  const db = await getDb();
  const query = accountId ? { _id: new ObjectId(accountId) } : {};
  const accounts = await db.collection<AccountDoc>("accounts").find(query).toArray();

  for (const acc of accounts) {
    const positions = (acc.positions ?? []) as Position[];
    const stockPositions = positions.filter(
      (p) => p.type === "stock" && p.ticker && (p.shares ?? 0) >= minStockShares
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

    for (const stock of stockPositions) {
      const symbol = stock.ticker!.toUpperCase();
      const shares = stock.shares ?? 0;
      const purchasePrice = stock.purchasePrice ?? 0;
      const stockPosId = stock._id ?? `${acc._id}-stock-${symbol}`;

      const matchingPut = putPositions.find(
        (p) => getUnderlyingFromTicker(p.ticker ?? "") === symbol
      );
      if (matchingPut) {
        pairs.push({
          accountId: acc._id.toString(),
          symbol,
          stockPositionId: stockPosId,
          stockShares: shares,
          stockPurchasePrice: purchasePrice,
          stockCurrentPrice: stock.currentPrice,
          stockUnrealizedPlPercent: stock.unrealizedPLPercent,
          putPositionId:
            matchingPut._id ?? `${acc._id}-put-${symbol}-${matchingPut.strike}`,
          putStrike: matchingPut.strike!,
          putExpiration: matchingPut.expiration!,
          putContracts: matchingPut.contracts ?? 0,
          putPremiumPaid: Math.abs(matchingPut.premium ?? 0),
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

  return { pairs, opportunities };
}

type AccountWithPositions = { _id: ObjectId; balance?: number; positions?: Position[] };

/** Total cash across scanned account(s): balance + cash positions. */
export async function getTotalCash(accountId?: string): Promise<number> {
  const db = await getDb();
  const query = accountId ? { _id: new ObjectId(accountId) } : {};
  const accounts = await db
    .collection<AccountWithPositions>("accounts")
    .find(query)
    .toArray();
  let total = 0;
  for (const acc of accounts) {
    total += acc.balance ?? 0;
    const positions = (acc.positions ?? []) as Position[];
    for (const p of positions) {
      if (p.type === "cash" && p.amount != null) total += p.amount;
    }
  }
  return total;
}

/** Main analysis: evaluate pairs and opportunities, return recommendations. */
export async function analyzeProtectivePuts(
  accountId?: string,
  config?: CspAnalysisConfig | JobConfig,
  optionChainCache?: Map<string, OptionChainDetailedData>
): Promise<ProtectivePutRecommendation[]> {
  const { pairs, opportunities } = await getProtectivePutPositions(accountId, config);
  const totalCash = await getTotalCash(accountId);
  const recommendations: ProtectivePutRecommendation[] = [];

  for (const pair of pairs) {
    try {
      const metrics = await getOptionMetrics(
        pair.symbol,
        pair.putExpiration,
        pair.putStrike,
        "put"
      );
      if (!metrics) {
        console.warn(
          `ProtectivePutAnalyzer: no metrics for ${pair.symbol} ${pair.putExpiration} ${pair.putStrike}`
        );
        continue;
      }

      const stockPrice = metrics.underlyingPrice;
      const expDate = new Date(pair.putExpiration + "T12:00:00Z");
      const dte = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      const putMid = (metrics.bid + metrics.ask) / 2;
      const extrinsicValue = Math.max(0, putMid - metrics.intrinsicValue);
      const extrinsicPercentOfPremium =
        pair.putPremiumPaid > 0
          ? (extrinsicValue / pair.putPremiumPaid) * 100
          : 100;
      const netProtectionCost = pair.putPremiumPaid - putMid;
      const effectiveFloor = pair.putStrike - netProtectionCost;
      const stockUnrealizedPlPercent =
        pair.stockPurchasePrice > 0
          ? ((stockPrice - pair.stockPurchasePrice) / pair.stockPurchasePrice) * 100
          : 0;
      const protectionCostPercent =
        stockPrice > 0 ? (netProtectionCost / stockPrice) * 100 : 0;

      const ivRank = await getIVRankOrPercentile(pair.symbol);

      const db = await getDb();
      const account = await db
        .collection<AccountDoc>("accounts")
        .findOne({ _id: new ObjectId(pair.accountId) });
      const riskLevel = account?.riskLevel ?? "medium";

      const putDelta = metrics.delta ?? null;
      const { recommendation, confidence, reason } = applyProtectivePutRules({
        stockPrice,
        strike: pair.putStrike,
        dte,
        putBid: metrics.bid,
        putAsk: metrics.ask,
        premiumPaid: pair.putPremiumPaid,
        extrinsicPercentOfPremium,
        stockUnrealizedPlPercent,
        moneyness: getPutMoneyness(stockPrice, pair.putStrike),
        putDelta,
        ivRank,
        riskLevel,
        stockAboveBreakeven: stockPrice >= pair.stockPurchasePrice,
      });

      recommendations.push({
        accountId: pair.accountId,
        symbol: pair.symbol,
        stockPositionId: pair.stockPositionId,
        putPositionId: pair.putPositionId,
        recommendation,
        confidence,
        reason,
        metrics: {
          stockPrice,
          putBid: metrics.bid,
          putAsk: metrics.ask,
          dte,
          netProtectionCost,
          effectiveFloor,
          putDelta: metrics.delta,
          iv: metrics.impliedVolatility,
          ivRank: ivRank ?? undefined,
          stockUnrealizedPl: (stockPrice - pair.stockPurchasePrice) * pair.stockShares,
          stockUnrealizedPlPercent,
          protectionCostPercent,
          extrinsicValue,
          extrinsicPercentOfPremium,
          moneyness: getPutMoneyness(stockPrice, pair.putStrike),
        },
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`ProtectivePutAnalyzer: error for ${pair.symbol}:`, err);
    }
  }

  for (const opp of opportunities) {
    try {
      const chain =
        optionChainCache?.get(opp.symbol) ?? (await getOptionChainDetailed(opp.symbol));
      if (!chain) continue;

      const stockPrice = chain.stock.price;
      const purchasePrice = opp.stockPurchasePrice > 0 ? opp.stockPurchasePrice : stockPrice;
      const stockUnrealizedPlPercent =
        purchasePrice > 0 ? ((stockPrice - purchasePrice) / purchasePrice) * 100 : 0;

      const avgIV =
        chain.puts.filter((p) => p.impliedVolatility != null).length > 0
          ? chain.puts
              .filter((p) => p.impliedVolatility != null)
              .reduce((s, p) => s + (p.impliedVolatility ?? 0), 0) /
            chain.puts.filter((p) => p.impliedVolatility != null).length
          : 0;
      const volPercent = avgIV > 0 ? Math.min(100, avgIV * 100) : 0;
      const volNote =
        Number.isFinite(volPercent) && volPercent > 0
          ? ` Volatility ~${volPercent.toFixed(0)}% — consider downside protection.`
          : " Consider downside protection.";

      if (volPercent >= 35) {
        const block100Cost = Math.round(stockPrice * 100);
        const cashNote =
          totalCash > 0
            ? ` 100-share block ~$${block100Cost.toLocaleString()}; cash $${Math.round(totalCash).toLocaleString()}.`
            : ` 100-share block ~$${block100Cost.toLocaleString()}.`;
        recommendations.push({
          accountId: opp.accountId,
          symbol: opp.symbol,
          stockPositionId: opp.stockPositionId,
          recommendation: "BUY_NEW_PUT",
          confidence: "MEDIUM",
          reason: `${opp.stockShares} shares, no protective put.${cashNote}${volNote}`,
          metrics: {
            stockPrice,
            putBid: 0,
            putAsk: 0,
            dte: 0,
            netProtectionCost: 0,
            effectiveFloor: 0,
            stockUnrealizedPl: (stockPrice - purchasePrice) * opp.stockShares,
            stockUnrealizedPlPercent,
            protectionCostPercent: 0,
          },
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`ProtectivePutAnalyzer: error for opportunity ${opp.symbol}:`, err);
    }
  }

  const opportunitySymbols = new Set(opportunities.map((o) => o.symbol.toUpperCase()));
  const cfg = config as CspAnalysisConfig | undefined;
  if (cfg?.includeWatchlist !== false && totalCash > 0) {
    const db = await getDb();
    const watchlistItems = (await db
      .collection("watchlist")
      .find({ $or: [{ type: "stock" }, { type: "long-stock" }] })
      .toArray()) as Array<{ symbol?: string; underlyingSymbol?: string }>;
    const watchlistSymbols = [
      ...new Set(
        watchlistItems
          .map((item) => (item.symbol ?? item.underlyingSymbol ?? "").toUpperCase())
          .filter(Boolean)
      ),
    ].filter((s) => !opportunitySymbols.has(s));

    for (const symbol of watchlistSymbols) {
      try {
        const chain =
          optionChainCache?.get(symbol) ?? (await getOptionChainDetailed(symbol));
        if (!chain) continue;

        const stockPrice = chain.stock.price;
        const block100Cost = stockPrice * 100;
        if (block100Cost > totalCash) continue;

        const avgIV =
          chain.puts.filter((p) => p.impliedVolatility != null).length > 0
            ? chain.puts
                .filter((p) => p.impliedVolatility != null)
                .reduce((s, p) => s + (p.impliedVolatility ?? 0), 0) /
              chain.puts.filter((p) => p.impliedVolatility != null).length
            : 0;
        const volPercent = avgIV > 0 ? Math.min(100, avgIV * 100) : 0;
        if (volPercent < 35) continue;
        const volNote =
          Number.isFinite(volPercent) && volPercent > 0
            ? ` Volatility ~${volPercent.toFixed(0)}% — consider downside protection.`
            : " Consider downside protection.";

        recommendations.push({
          accountId: accountId ?? "portfolio",
          symbol,
          recommendation: "BUY_NEW_PUT",
          confidence: "MEDIUM",
          reason: `Watchlist: 100-share block ~$${Math.round(block100Cost).toLocaleString()}; fits your cash $${Math.round(totalCash).toLocaleString()}.${volNote}`,
          metrics: {
            stockPrice,
            putBid: 0,
            putAsk: 0,
            dte: 0,
            netProtectionCost: 0,
            effectiveFloor: 0,
            stockUnrealizedPl: 0,
            stockUnrealizedPlPercent: 0,
            protectionCostPercent: 0,
          },
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`ProtectivePutAnalyzer: error for watchlist ${symbol}:`, err);
      }
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
export async function storeProtectivePutRecommendations(
  recommendations: ProtectivePutRecommendation[],
  options?: { createAlerts?: boolean }
): Promise<{ stored: number; alertsCreated: number }> {
  const db = await getDb();
  let stored = 0;
  let alertsCreated = 0;

  for (const rec of recommendations) {
    if (rec.recommendation === "NONE") continue;

    await db.collection("protectivePutRecommendations").insertOne({
      ...rec,
      storedAt: new Date().toISOString(),
    });
    stored++;

    const isFromHoldings =
      rec.accountId !== "portfolio" && rec.accountId !== "symbol-mode";
    if (
      options?.createAlerts &&
      isFromHoldings &&
      (rec.recommendation === "SELL_TO_CLOSE" ||
        rec.recommendation === "ROLL" ||
        rec.recommendation === "BUY_NEW_PUT")
    ) {
      const accountName = await getAccountDisplayName(db, rec.accountId);
      const metrics = {
        ...rec.metrics,
        ...(rec.metrics.netProtectionCost != null && { unitCost: rec.metrics.netProtectionCost }),
      };
      const alert = {
        type: "protective-put",
        accountId: rec.accountId,
        accountName: accountName ?? undefined,
        symbol: rec.symbol,
        recommendation: rec.recommendation,
        reason: rec.reason,
        metrics,
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
