/**
 * Option Scanner Service
 * Evaluates options positions, fetches market data, and generates HOLD/BUY_TO_CLOSE recommendations.
 * Configurable rules via OptionScannerConfig. Integrates with scheduler and stores in alerts.
 */

import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getOptionMetrics, getOptionMarketConditions } from "@/lib/yahoo";
import type {
  Account,
  Position,
  OptionRecommendation,
  OptionRecommendationAction,
  OptionScannerConfig,
  RiskLevel,
} from "@/types/portfolio";

export type OptionPositionInput = {
  positionId: string;
  accountId: string;
  ticker: string;
  strike: number;
  expiration: string;
  optionType: "call" | "put";
  contracts: number;
  premium: number;
};

/** Extract underlying symbol from option ticker (e.g. TSLA250117C250 -> TSLA). */
function getUnderlyingFromTicker(ticker: string): string {
  return ticker?.replace(/\d.*$/, "").toUpperCase() ?? ticker?.toUpperCase() ?? "";
}

const DEFAULT_CONFIG: Required<Omit<OptionScannerConfig, "riskProfile">> & {
  riskProfile?: RiskLevel;
} = {
  holdDteMin: 14,
  btcDteMax: 7,
  btcStopLossPercent: -50,
  holdTimeValuePercentMin: 20,
  highVolatilityPercent: 30,
};

/** Pure function: apply rules to metrics and return recommendation. Unit-testable. */
export function applyOptionRules(
  metrics: {
    dte: number;
    plPercent: number;
    intrinsicValue: number;
    timeValue: number;
    premium: number;
    impliedVolatility?: number;
    optionType: "call" | "put";
  },
  config: OptionScannerConfig = {},
  marketConditions?: { vix: number; vixLevel: string; trend: string }
): { recommendation: OptionRecommendationAction; reason: string } {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { dte, plPercent, intrinsicValue, timeValue, premium, impliedVolatility, optionType } =
    metrics;

  // BTC: Stop loss
  if (plPercent <= (cfg.btcStopLossPercent ?? -50)) {
    return {
      recommendation: "BUY_TO_CLOSE",
      reason: `Stop loss: P/L ${plPercent.toFixed(1)}% below threshold`,
    };
  }

  // BTC: DTE < 7 (time decay risk)
  if (dte < (cfg.btcDteMax ?? 7)) {
    return {
      recommendation: "BUY_TO_CLOSE",
      reason: `Low DTE (${dte} days): time decay risk`,
    };
  }

  // BTC: OTM with no intrinsic value and high IV for puts
  const highVol = (impliedVolatility ?? 0) > (cfg.highVolatilityPercent ?? 30);
  if (optionType === "put" && intrinsicValue <= 0 && highVol && marketConditions?.vixLevel === "elevated") {
    return {
      recommendation: "BUY_TO_CLOSE",
      reason: `OTM put with elevated IV (${(impliedVolatility ?? 0).toFixed(1)}%): consider closing`,
    };
  }

  // HOLD: DTE > 14
  if (dte >= (cfg.holdDteMin ?? 14)) {
    return {
      recommendation: "HOLD",
      reason: `Adequate DTE (${dte} days)`,
    };
  }

  // HOLD: P/L positive
  if (plPercent > 0) {
    return {
      recommendation: "HOLD",
      reason: `Profitable position (${plPercent.toFixed(1)}%)`,
    };
  }

  // HOLD: Time value > 20% of premium
  const timeValuePercent = premium > 0 ? (timeValue / premium) * 100 : 0;
  if (timeValuePercent >= (cfg.holdTimeValuePercentMin ?? 20)) {
    return {
      recommendation: "HOLD",
      reason: `Time value ${timeValuePercent.toFixed(0)}% of premium`,
    };
  }

  // Default: HOLD for moderate DTE, BTC for very low
  if (dte < 10) {
    return {
      recommendation: "BUY_TO_CLOSE",
      reason: `DTE ${dte} days approaching expiry`,
    };
  }

  return {
    recommendation: "HOLD",
    reason: "No strong signal to close",
  };
}

/** Fetch all option positions from accounts (optionally filtered by accountId). */
export async function getOptionPositions(accountId?: string): Promise<OptionPositionInput[]> {
  const db = await getDb();
  const query = accountId ? { _id: new ObjectId(accountId) } : {};
  type AccountDoc = { _id: ObjectId; positions?: Position[] };
  const accounts = await db.collection<AccountDoc>("accounts").find(query).toArray();

  const result: OptionPositionInput[] = [];
  for (const acc of accounts) {
    const positions = (acc.positions ?? []) as Position[];
    for (const pos of positions) {
      if (pos.type !== "option" || !pos.ticker || pos.strike == null || !pos.expiration) continue;
      const optionType = (pos.optionType ?? "call") as "call" | "put";
      const positionId =
        pos._id ?? `${acc._id.toString()}-${pos.ticker}-${pos.expiration}-${pos.strike}-${optionType}`;
      result.push({
        positionId,
        accountId: acc._id.toString(),
        ticker: pos.ticker,
        strike: pos.strike,
        expiration: pos.expiration,
        optionType,
        contracts: pos.contracts ?? 0,
        premium: pos.premium ?? 0,
      });
    }
  }
  return result;
}

/** Main scan: fetch positions, get metrics, apply rules, return recommendations. */
export async function scanOptions(
  accountId?: string,
  config?: OptionScannerConfig
): Promise<OptionRecommendation[]> {
  const positions = await getOptionPositions(accountId);
  if (positions.length === 0) return [];

  const recommendations: OptionRecommendation[] = [];
  const cfg = { ...DEFAULT_CONFIG, ...config };

  for (const pos of positions) {
    try {
      const underlying = getUnderlyingFromTicker(pos.ticker);
      const metrics = await getOptionMetrics(
        underlying,
        pos.expiration,
        pos.strike,
        pos.optionType
      );
      if (!metrics) {
        console.warn(`OptionScanner: no metrics for ${pos.ticker} (${underlying}) ${pos.expiration} ${pos.strike}`);
        continue;
      }

      const expDate = new Date(pos.expiration + "T12:00:00Z");
      const dte = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      const totalCost = pos.contracts * pos.premium * 100;
      const marketValue = pos.contracts * metrics.price * 100;
      const pl = marketValue - totalCost;
      const plPercent = totalCost > 0 ? (pl / totalCost) * 100 : 0;

      const marketConditions = await getOptionMarketConditions(underlying);

      const { recommendation, reason } = applyOptionRules(
        {
          dte,
          plPercent,
          intrinsicValue: metrics.intrinsicValue,
          timeValue: metrics.timeValue,
          premium: pos.premium,
          impliedVolatility: metrics.impliedVolatility,
          optionType: pos.optionType,
        },
        cfg,
        marketConditions
      );

      const symbol = `${pos.ticker} ${pos.expiration} ${pos.optionType === "call" ? "C" : "P"} $${pos.strike}`;
      recommendations.push({
        positionId: pos.positionId,
        accountId: pos.accountId,
        symbol,
        underlyingSymbol: pos.ticker,
        strike: pos.strike,
        expiration: pos.expiration,
        optionType: pos.optionType,
        contracts: pos.contracts,
        recommendation,
        reason,
        metrics: {
          price: metrics.price,
          underlyingPrice: metrics.underlyingPrice,
          dte,
          pl,
          plPercent,
          intrinsicValue: metrics.intrinsicValue,
          timeValue: metrics.timeValue,
          impliedVolatility: metrics.impliedVolatility,
        },
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`OptionScanner: error for ${pos.ticker} ${pos.expiration}:`, err);
    }
  }

  return recommendations;
}

/** Store recommendations in optionRecommendations collection and optionally create alerts. */
export async function storeOptionRecommendations(
  recommendations: OptionRecommendation[],
  options?: { createAlerts?: boolean }
): Promise<{ stored: number; alertsCreated: number }> {
  const db = await getDb();
  let stored = 0;
  let alertsCreated = 0;

  for (const rec of recommendations) {
    await db.collection("optionRecommendations").insertOne({
      ...rec,
      storedAt: new Date().toISOString(),
    });
    stored++;

    if (options?.createAlerts && rec.recommendation === "BUY_TO_CLOSE") {
      const alert = {
        type: "option-scanner",
        positionId: rec.positionId,
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
