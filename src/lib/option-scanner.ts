/**
 * Option Scanner Service
 * Hybrid: Stage 1 rule-based scan, Stage 2 Grok for edge candidates.
 * Evaluates options positions, fetches market data, generates HOLD/BUY_TO_CLOSE recommendations.
 */

import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getOptionMetrics, getOptionMarketConditions } from "@/lib/yahoo";
import { callOptionDecision } from "@/lib/xai-grok";
import type {
  Account,
  Position,
  OptionRecommendation,
  OptionRecommendationAction,
  OptionScannerConfig,
  RiskLevel,
} from "@/types/portfolio";

const MARKET_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const marketCache = new Map<string, { data: unknown; expires: number }>();

/** Clear market cache (for tests). */
export function clearMarketCache(): void {
  marketCache.clear();
}

function getCachedOrFetch<T>(key: string, fetch: () => Promise<T>): Promise<T> {
  const entry = marketCache.get(key);
  if (entry && Date.now() < entry.expires) return Promise.resolve(entry.data as T);
  return fetch().then((data) => {
    marketCache.set(key, { data, expires: Date.now() + MARKET_CACHE_TTL_MS });
    return data;
  });
}

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

const DEFAULT_CONFIG: Required<Omit<OptionScannerConfig, "riskProfile" | "grokSystemPromptOverride">> & {
  riskProfile?: RiskLevel;
  grokSystemPromptOverride?: string;
} = {
  holdDteMin: 14,
  btcDteMax: 7,
  btcStopLossPercent: -50,
  holdTimeValuePercentMin: 20,
  highVolatilityPercent: 30,
  grokEnabled: true,
  grokCandidatesPlPercent: 12,
  grokCandidatesDteMax: 14,
  grokCandidatesIvMin: 55,
  grokMaxParallel: 6,
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

type PrelimResult = {
  pos: OptionPositionInput;
  underlying: string;
  metrics: NonNullable<Awaited<ReturnType<typeof getOptionMetrics>>>;
  dte: number;
  pl: number;
  plPercent: number;
  prelim: { recommendation: OptionRecommendationAction; reason: string };
  symbol: string;
};

/** Stage 1: Fast rule-based scan. Returns preliminary recommendations with metrics. */
async function fastRuleBasedScan(
  positions: OptionPositionInput[],
  config: OptionScannerConfig
): Promise<PrelimResult[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const results: PrelimResult[] = [];

  for (const pos of positions) {
    try {
      const underlying = getUnderlyingFromTicker(pos.ticker);
      const cacheKey = `metrics:${underlying}:${pos.expiration}:${pos.strike}:${pos.optionType}`;
      const metrics = await getCachedOrFetch(cacheKey, () =>
        getOptionMetrics(underlying, pos.expiration, pos.strike, pos.optionType)
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

      const marketConditions = await getCachedOrFetch(`market:${underlying}`, () =>
        getOptionMarketConditions(underlying)
      );

      const prelim = applyOptionRules(
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
      results.push({ pos, underlying, metrics, dte, pl, plPercent, prelim, symbol });
    } catch (err) {
      console.error(`OptionScanner: error for ${pos.ticker} ${pos.expiration}:`, err);
    }
  }

  return results;
}

/** Filter candidates for Grok stage: high P/L, low DTE, high IV. */
function isGrokCandidate(
  r: PrelimResult,
  config: OptionScannerConfig
): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const plAbs = Math.abs(r.plPercent);
  const iv = r.metrics.impliedVolatility ?? 0;
  return (
    plAbs >= (cfg.grokCandidatesPlPercent ?? 12) ||
    r.dte < (cfg.grokCandidatesDteMax ?? 14) ||
    iv >= (cfg.grokCandidatesIvMin ?? 55)
  );
}

/** Main scan: Stage 1 rules, Stage 2 Grok for candidates. */
export async function scanOptions(
  accountId?: string,
  config?: OptionScannerConfig
): Promise<OptionRecommendation[]> {
  const positions = await getOptionPositions(accountId);
  if (positions.length === 0) return [];

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const prelimResults = await fastRuleBasedScan(positions, cfg);

  const candidates = cfg.grokEnabled
    ? prelimResults.filter((r) => isGrokCandidate(r, cfg))
    : [];

  const grokMax = cfg.grokMaxParallel ?? 6;
  const grokResults = new Map<number, { recommendation: OptionRecommendationAction; reason: string } | null>();

  if (candidates.length > 0) {
    const batches: PrelimResult[][] = [];
    for (let i = 0; i < candidates.length; i += grokMax) {
      batches.push(candidates.slice(i, i + grokMax));
    }
    for (const batch of batches) {
      const promises = batch.map(async (r, idx) => {
        const globalIdx = prelimResults.indexOf(r);
        const account =
          ObjectId.isValid(r.pos.accountId) && r.pos.accountId.length === 24
            ? await getDb().then((db) =>
                db.collection("accounts").findOne({ _id: new ObjectId(r.pos.accountId) })
              )
            : null;
        const riskProfile = (account as { riskLevel?: string })?.riskLevel ?? "medium";

        const grokResult = await callOptionDecision(
          {
            position: {
              type: r.pos.ticker,
              strike: r.pos.strike,
              expiration: r.pos.expiration,
              qty: r.pos.contracts,
              costBasis: r.pos.premium * 100,
              optionType: r.pos.optionType,
            },
            marketData: {
              underlyingPrice: r.metrics.underlyingPrice,
              optionPrice: r.metrics.price,
              iv: r.metrics.impliedVolatility,
              dte: r.dte,
              plPercent: r.plPercent,
            },
            preliminary: r.prelim,
            accountContext: { riskProfile },
          },
          { grokSystemPromptOverride: cfg.grokSystemPromptOverride }
        );

        if (grokResult) {
          grokResults.set(globalIdx, {
            recommendation: grokResult.recommendation,
            reason: grokResult.explanation || r.prelim.reason,
          });
        } else {
          grokResults.set(globalIdx, null);
        }
      });
      await Promise.all(promises);
    }
  }

  const recommendations: OptionRecommendation[] = prelimResults.map((r, idx) => {
    const grok = grokResults.get(idx);
    const useGrok = candidates.includes(r) && grok;
    return {
      positionId: r.pos.positionId,
      accountId: r.pos.accountId,
      symbol: r.symbol,
      underlyingSymbol: r.pos.ticker,
      strike: r.pos.strike,
      expiration: r.pos.expiration,
      optionType: r.pos.optionType,
      contracts: r.pos.contracts,
      recommendation: useGrok ? grok.recommendation : r.prelim.recommendation,
      reason: useGrok ? grok.reason : r.prelim.reason + (candidates.includes(r) && !grok ? " (Grok unavailable)" : ""),
      source: useGrok ? "grok" : "rules",
      preliminaryRecommendation: r.prelim.recommendation,
      preliminaryReason: r.prelim.reason,
      metrics: {
        price: r.metrics.price,
        underlyingPrice: r.metrics.underlyingPrice,
        dte: r.dte,
        pl: r.pl,
        plPercent: r.plPercent,
        intrinsicValue: r.metrics.intrinsicValue,
        timeValue: r.metrics.timeValue,
        impliedVolatility: r.metrics.impliedVolatility,
      },
      createdAt: new Date().toISOString(),
    };
  });

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
