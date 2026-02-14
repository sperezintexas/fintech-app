/**
 * Unified Options Scanner
 * Runs OptionScanner, CoveredCallScanner, ProtectivePutScanner, and StraddleStrangleScanner
 * in parallel where possible; centralizes option-chain fetches; validates config with Zod.
 * Each sub-scanner is wrapped in try/catch so one failure doesn't abort the rest; errors are accumulated.
 */

import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import {
  getOptionChainDetailed,
  getOptionMetrics,
  getOptionMarketConditions,
  type OptionChainDetailedData,
  type OptionMarketConditions,
} from "@/lib/yahoo";
import { parseUnifiedOptionsScannerConfig } from "@/lib/job-config-schemas";
import { getCoveredCallPositions } from "./covered-call-analyzer";
import { getProtectivePutPositions } from "./protective-put-analyzer";
import {
  scanOptions,
  storeOptionRecommendations,
  getOptionPositions,
  type OptionScannerPreload,
} from "./option-scanner";
import { analyzeCoveredCalls, storeCoveredCallRecommendations } from "./covered-call-analyzer";
import { analyzeProtectivePuts, storeProtectivePutRecommendations } from "./protective-put-analyzer";
import {
  analyzeStraddlesAndStrangles,
  storeStraddleStrangleRecommendations,
} from "./straddle-strangle-analyzer";
import type { OptionScannerConfig } from "@/types/portfolio";
import type {
  CoveredCallScannerConfig,
  CspAnalysisConfig,
  StraddleStrangleScannerConfig,
} from "@/lib/job-config-schemas";

export type UnifiedOptionsScannerConfig = {
  optionScanner?: OptionScannerConfig;
  coveredCall?: CoveredCallScannerConfig;
  protectivePut?: CspAnalysisConfig;
  straddleStrangle?: StraddleStrangleScannerConfig;
};

export type ScannerError = { scanner: string; message: string };

export type UnifiedOptionsScannerResult = {
  optionScanner: { scanned: number; stored: number; alertsCreated: number };
  coveredCallScanner: { analyzed: number; stored: number; alertsCreated: number };
  protectivePutScanner: { analyzed: number; stored: number; alertsCreated: number };
  straddleStrangleScanner: { analyzed: number; stored: number; alertsCreated: number };
  totalScanned: number;
  totalStored: number;
  totalAlertsCreated: number;
  /** Per-scanner errors; run can still be partially successful. */
  errors: ScannerError[];
  /** Concise per-holding recommendations for UI/report (options: hold/close, stocks: CC, cash: CSP). */
  recommendationSummary?: string;
};

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function truncate(s: string | undefined, maxLen: number): string {
  const t = s ?? "";
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1).trim() + "…";
}

type RecWithAccountAndMetrics = {
  accountId?: string;
  symbol: string;
  strike?: number;
  optionType?: string;
  recommendation: string;
  reason: string;
  metrics?: { dte?: number; assignmentProbability?: number };
};

function formatOptionSuffix(metrics?: { dte?: number; assignmentProbability?: number }): string {
  if (!metrics) return "";
  const dte = metrics.dte;
  const assign = metrics.assignmentProbability;
  const parts: string[] = [];
  if (dte != null) parts.push(`DTE ${dte}`);
  if (assign != null) parts.push(`Assign ${assign}%`);
  return parts.length === 0 ? "" : ` (${parts.join(", ")})`;
}

/** Build a concise recommendation summary from scanner results (for UI/report). Includes account name, DTE, and assignment prob when applicable. */
function buildRecommendationSummary(
  optResult: { recs: unknown[]; error?: unknown },
  ccResult: { recs: unknown[]; error?: unknown },
  ppResult: { recs: unknown[]; error?: unknown },
  ssResult: { recs: unknown[]; error?: unknown },
  accountIdToName: Record<string, string>
): string {
  const lines: string[] = [];
  const accountLabel = (r: RecWithAccountAndMetrics) =>
    accountIdToName[r.accountId ?? ""] ?? r.accountId ?? "—";

  if (!optResult.error && Array.isArray(optResult.recs) && optResult.recs.length > 0) {
    lines.push("Options (hold / close):");
    for (const r of optResult.recs as RecWithAccountAndMetrics[]) {
      const suffix = formatOptionSuffix(r.metrics);
      lines.push(
        `  [${accountLabel(r)}] ${r.symbol} $${r.strike ?? "?"} ${(r.optionType ?? "?").toUpperCase()} — ${r.recommendation} — ${truncate(r.reason, 55)}${suffix}`
      );
    }
  }
  if (!ccResult.error && Array.isArray(ccResult.recs) && ccResult.recs.length > 0) {
    lines.push("Covered calls (hold / BTC / sell new / roll):");
    for (const r of ccResult.recs as RecWithAccountAndMetrics[]) {
      const suffix = formatOptionSuffix(r.metrics);
      lines.push(
        `  [${accountLabel(r)}] ${r.symbol} — ${r.recommendation} — ${truncate(r.reason, 55)}${suffix}`
      );
    }
  }
  if (!ppResult.error && Array.isArray(ppResult.recs) && ppResult.recs.length > 0) {
    lines.push("Protective puts (hold / STC / roll / buy new):");
    for (const r of ppResult.recs as RecWithAccountAndMetrics[]) {
      const suffix = formatOptionSuffix(r.metrics);
      lines.push(
        `  [${accountLabel(r)}] ${r.symbol} — ${r.recommendation} — ${truncate(r.reason, 55)}${suffix}`
      );
    }
  }
  if (!ssResult.error && Array.isArray(ssResult.recs) && ssResult.recs.length > 0) {
    lines.push("Straddle/Strangle (hold / STC / roll / add):");
    for (const r of ssResult.recs as RecWithAccountAndMetrics[]) {
      const suffix = formatOptionSuffix(r.metrics);
      lines.push(
        `  [${accountLabel(r)}] ${r.symbol} — ${r.recommendation} — ${truncate(r.reason, 55)}${suffix}`
      );
    }
  }
  return lines.length === 0 ? "" : lines.join("\n");
}

/** Resolve account IDs to display names for alert summary. */
async function getAccountIdToName(accountIds: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(accountIds)].filter((id) => id && ObjectId.isValid(id) && id.length === 24);
  if (unique.length === 0) return {};
  const db = await getDb();
  const accounts = await db
    .collection<{ _id: ObjectId; name?: string; broker?: string }>("accounts")
    .find({ _id: { $in: unique.map((id) => new ObjectId(id)) } })
    .toArray();
  const map: Record<string, string> = {};
  for (const a of accounts) {
    const id = a._id.toString();
    map[id] = a.broker ?? a.name ?? id;
  }
  return map;
}

/** Collect unique symbols that need option-chain data (covered-call + protective-put opportunities). */
async function getSymbolsForOptionChainCache(
  accountId: string | undefined,
  merged: UnifiedOptionsScannerConfig
): Promise<string[]> {
  const [ccData, ppData] = await Promise.all([
    getCoveredCallPositions(accountId, merged?.coveredCall),
    getProtectivePutPositions(accountId, merged?.protectivePut),
  ]);
  const symbols = new Set<string>();
  for (const p of ccData.pairs) symbols.add(p.symbol);
  for (const o of ccData.opportunities) symbols.add(o.symbol);
  for (const c of ccData.standaloneCalls) symbols.add(c.symbol);
  for (const p of ppData.pairs) symbols.add(p.symbol);
  for (const o of ppData.opportunities) symbols.add(o.symbol);
  return [...symbols];
}

/** Pre-fetch option chains for symbols in parallel; return Map<symbol, chain>. One symbol failure does not abort others. */
async function fetchOptionChainCache(
  symbols: string[]
): Promise<Map<string, OptionChainDetailedData>> {
  const map = new Map<string, OptionChainDetailedData>();
  if (symbols.length === 0) return map;
  const results = await Promise.all(
    symbols.map(async (s) => {
      try {
        const chain = await getOptionChainDetailed(s);
        return { symbol: s, chain, error: null };
      } catch (e) {
        console.warn(`[unified-options-scanner] option chain for ${s}:`, e instanceof Error ? e.message : e);
        return { symbol: s, chain: null, error: e };
      }
    })
  );
  for (const { symbol, chain } of results) {
    if (chain) map.set(symbol, chain);
  }
  return map;
}

/** Build unique metric keys and underlyings from option positions for batch fetch. */
function getOptionScannerKeys(positions: { ticker: string; expiration: string; strike: number; optionType: string }[]) {
  const metricKeys = new Set<string>();
  const underlyings = new Set<string>();
  for (const pos of positions) {
    const underlying = (pos.ticker ?? "").replace(/\d.*$/, "").toUpperCase();
    if (!underlying) continue;
    underlyings.add(underlying);
    metricKeys.add(`metrics:${underlying}:${pos.expiration}:${pos.strike}:${pos.optionType}`);
  }
  return { metricKeys: [...metricKeys], underlyings: [...underlyings] };
}

/** Pre-fetch option metrics and market conditions for option scanner (batch all tickers upfront). */
async function fetchOptionScannerPreload(accountId: string | undefined): Promise<OptionScannerPreload | undefined> {
  const positions = await getOptionPositions(accountId);
  if (positions.length === 0) return undefined;
  const { metricKeys, underlyings } = getOptionScannerKeys(positions);
  const metricsEntries = await Promise.all(
    metricKeys.map(async (key) => {
      const [, underlying, expiration, strikeStr, optionType] = key.split(":");
      const strike = Number(strikeStr);
      if (!underlying || !expiration || Number.isNaN(strike) || (optionType !== "call" && optionType !== "put")) {
        return { key, value: null };
      }
      const value = await getOptionMetrics(underlying, expiration, strike, optionType as "call" | "put");
      return { key, value };
    })
  );
  const marketEntries = await Promise.all(
    underlyings.map(async (u) => ({ key: u, value: await getOptionMarketConditions(u) }))
  );
  const metrics = new Map<string, NonNullable<(typeof metricsEntries)[0]["value"]>>();
  for (const { key, value } of metricsEntries) {
    if (value) metrics.set(key, value);
  }
  const marketConditions = new Map<string, OptionMarketConditions>();
  for (const { key, value } of marketEntries) {
    marketConditions.set(key, value);
  }
  return { metrics, marketConditions };
}

type StoreResult = { stored: number; alertsCreated: number };

/** Dedupe: persist recommendations and create alerts; return counts. */
async function storeRecommendationsAndCreateAlerts<T>(
  recommendations: T[],
  storeFn: (recs: T[], options?: { createAlerts?: boolean }) => Promise<StoreResult>
): Promise<StoreResult> {
  return storeFn(recommendations, { createAlerts: true });
}

export async function runUnifiedOptionsScanner(
  accountId?: string,
  config?: UnifiedOptionsScannerConfig
): Promise<UnifiedOptionsScannerResult> {
  const res: UnifiedOptionsScannerResult = {
    optionScanner: { scanned: 0, stored: 0, alertsCreated: 0 },
    coveredCallScanner: { analyzed: 0, stored: 0, alertsCreated: 0 },
    protectivePutScanner: { analyzed: 0, stored: 0, alertsCreated: 0 },
    straddleStrangleScanner: { analyzed: 0, stored: 0, alertsCreated: 0 },
    totalScanned: 0,
    totalStored: 0,
    totalAlertsCreated: 0,
    errors: [],
  };

  const merged = parseUnifiedOptionsScannerConfig(config) ?? {};
  const optConfig = merged.optionScanner;
  const ccConfig = merged.coveredCall;
  const ppConfig = merged.protectivePut;
  const ssConfig = merged.straddleStrangle;

  const symbols = await getSymbolsForOptionChainCache(accountId, merged);
  const [optionChainMap, optionScannerPreload] = await Promise.all([
    fetchOptionChainCache(symbols),
    fetchOptionScannerPreload(accountId),
  ]);

  type ScanResult =
    | { scanner: "optionScanner"; recs: Awaited<ReturnType<typeof scanOptions>>; error?: undefined }
    | { scanner: "coveredCallScanner"; recs: Awaited<ReturnType<typeof analyzeCoveredCalls>>; error?: undefined }
    | { scanner: "protectivePutScanner"; recs: Awaited<ReturnType<typeof analyzeProtectivePuts>>; error?: undefined }
    | { scanner: "straddleStrangleScanner"; recs: Awaited<ReturnType<typeof analyzeStraddlesAndStrangles>>; error?: undefined }
    | { scanner: string; recs: unknown[]; error: unknown };

  const runOptionScanner = async (): Promise<ScanResult> => {
    const name = "optionScanner";
    console.time(name);
    try {
      const recs = await scanOptions(accountId, optConfig, optionScannerPreload);
      console.timeEnd(name);
      return { scanner: name, recs };
    } catch (e) {
      console.timeEnd(name);
      console.error(`[unified-options-scanner] ${name}:`, e);
      return { scanner: name, recs: [] as unknown[], error: e };
    }
  };

  const runCoveredCallScanner = async (): Promise<ScanResult> => {
    const name = "coveredCallScanner";
    console.time(name);
    try {
      const recs = await analyzeCoveredCalls(accountId, ccConfig, optionChainMap);
      console.timeEnd(name);
      return { scanner: name, recs };
    } catch (e) {
      console.timeEnd(name);
      console.error(`[unified-options-scanner] ${name}:`, e);
      return { scanner: name, recs: [] as unknown[], error: e };
    }
  };

  const runProtectivePutScanner = async (): Promise<ScanResult> => {
    const name = "protectivePutScanner";
    console.time(name);
    try {
      const recs = await analyzeProtectivePuts(accountId, ppConfig, optionChainMap);
      console.timeEnd(name);
      return { scanner: name, recs };
    } catch (e) {
      console.timeEnd(name);
      console.error(`[unified-options-scanner] ${name}:`, e);
      return { scanner: name, recs: [] as unknown[], error: e };
    }
  };

  const runStraddleStrangleScanner = async (): Promise<ScanResult> => {
    const name = "straddleStrangleScanner";
    console.time(name);
    try {
      const recs = await analyzeStraddlesAndStrangles(accountId, ssConfig);
      console.timeEnd(name);
      return { scanner: name, recs };
    } catch (e) {
      console.timeEnd(name);
      console.error(`[unified-options-scanner] ${name}:`, e);
      return { scanner: name, recs: [] as unknown[], error: e };
    }
  };

  const [optResult, ccResult, ppResult, ssResult] = await Promise.all([
    runOptionScanner(),
    runCoveredCallScanner(),
    runProtectivePutScanner(),
    runStraddleStrangleScanner(),
  ]);

  const persist = async (result: ScanResult) => {
    if (result.error) {
      res.errors.push({ scanner: result.scanner, message: toMessage(result.error) });
      return;
    }
    const recs = result.recs as unknown[];
    const count = recs.length;
    if (result.scanner === "optionScanner") {
      res.optionScanner.scanned = count;
      const out = await storeRecommendationsAndCreateAlerts(
        recs as Awaited<ReturnType<typeof scanOptions>>,
        storeOptionRecommendations
      );
      res.optionScanner.stored = out.stored;
      res.optionScanner.alertsCreated = out.alertsCreated;
    } else if (result.scanner === "coveredCallScanner") {
      res.coveredCallScanner.analyzed = count;
      const out = await storeRecommendationsAndCreateAlerts(
        recs as Awaited<ReturnType<typeof analyzeCoveredCalls>>,
        storeCoveredCallRecommendations
      );
      res.coveredCallScanner.stored = out.stored;
      res.coveredCallScanner.alertsCreated = out.alertsCreated;
    } else if (result.scanner === "protectivePutScanner") {
      res.protectivePutScanner.analyzed = count;
      const out = await storeRecommendationsAndCreateAlerts(
        recs as Awaited<ReturnType<typeof analyzeProtectivePuts>>,
        storeProtectivePutRecommendations
      );
      res.protectivePutScanner.stored = out.stored;
      res.protectivePutScanner.alertsCreated = out.alertsCreated;
    } else if (result.scanner === "straddleStrangleScanner") {
      res.straddleStrangleScanner.analyzed = count;
      const out = await storeRecommendationsAndCreateAlerts(
        recs as Awaited<ReturnType<typeof analyzeStraddlesAndStrangles>>,
        storeStraddleStrangleRecommendations
      );
      res.straddleStrangleScanner.stored = out.stored;
      res.straddleStrangleScanner.alertsCreated = out.alertsCreated;
    }
  };

  await Promise.all([
    persist(optResult),
    persist(ccResult),
    persist(ppResult),
    persist(ssResult),
  ]);

  res.totalScanned =
    res.optionScanner.scanned +
    res.coveredCallScanner.analyzed +
    res.protectivePutScanner.analyzed +
    res.straddleStrangleScanner.analyzed;
  res.totalStored =
    res.optionScanner.stored +
    res.coveredCallScanner.stored +
    res.protectivePutScanner.stored +
    res.straddleStrangleScanner.stored;
  res.totalAlertsCreated =
    res.optionScanner.alertsCreated +
    res.coveredCallScanner.alertsCreated +
    res.protectivePutScanner.alertsCreated +
    res.straddleStrangleScanner.alertsCreated;

  const accountIds: string[] = [];
  for (const r of (optResult.recs as RecWithAccountAndMetrics[])) {
    if (r.accountId) accountIds.push(r.accountId);
  }
  for (const r of (ccResult.recs as RecWithAccountAndMetrics[])) {
    if (r.accountId) accountIds.push(r.accountId);
  }
  for (const r of (ppResult.recs as RecWithAccountAndMetrics[])) {
    if (r.accountId) accountIds.push(r.accountId);
  }
  for (const r of (ssResult.recs as RecWithAccountAndMetrics[])) {
    if (r.accountId) accountIds.push(r.accountId);
  }
  const accountIdToName = await getAccountIdToName(accountIds);
  res.recommendationSummary = buildRecommendationSummary(
    optResult,
    ccResult,
    ppResult,
    ssResult,
    accountIdToName
  );

  return res;
}
