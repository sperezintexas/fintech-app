/**
 * Unified Options Scanner
 * Runs OptionScanner, CoveredCallScanner, ProtectivePutScanner, and StraddleStrangleScanner
 * in parallel where possible; centralizes option-chain fetches; validates config with Zod.
 * Each sub-scanner is wrapped in try/catch so one failure doesn't abort the rest; errors are accumulated.
 */

import { getOptionChainDetailed, type OptionChainDetailedData } from "@/lib/yahoo";
import { parseUnifiedOptionsScannerConfig } from "@/lib/job-config-schemas";
import { getCoveredCallPositions } from "./covered-call-analyzer";
import { getProtectivePutPositions } from "./protective-put-analyzer";
import { scanOptions, storeOptionRecommendations } from "./option-scanner";
import { analyzeCoveredCalls, storeCoveredCallRecommendations } from "./covered-call-analyzer";
import { analyzeProtectivePuts, storeProtectivePutRecommendations } from "./protective-put-analyzer";
import {
  analyzeStraddlesAndStrangles,
  storeStraddleStrangleRecommendations,
} from "./straddle-strangle-analyzer";
import type { OptionScannerConfig } from "@/types/portfolio";
import type { CoveredCallScannerConfig } from "@/lib/job-config-schemas";
import type { CspAnalysisConfig } from "@/lib/job-config-schemas";

export type UnifiedOptionsScannerConfig = {
  optionScanner?: OptionScannerConfig;
  coveredCall?: CoveredCallScannerConfig;
  protectivePut?: CspAnalysisConfig;
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
};

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
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

/** Pre-fetch option chains for symbols in parallel; return Map<symbol, chain>. */
async function fetchOptionChainCache(
  symbols: string[]
): Promise<Map<string, OptionChainDetailedData>> {
  const map = new Map<string, OptionChainDetailedData>();
  if (symbols.length === 0) return map;
  const results = await Promise.all(
    symbols.map(async (s) => {
      const chain = await getOptionChainDetailed(s);
      return { symbol: s, chain };
    })
  );
  for (const { symbol, chain } of results) {
    if (chain) map.set(symbol, chain);
  }
  return map;
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

  const symbols = await getSymbolsForOptionChainCache(accountId, merged);
  const optionChainMap = await fetchOptionChainCache(symbols);

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
      const recs = await scanOptions(accountId, optConfig);
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
      const recs = await analyzeStraddlesAndStrangles(accountId);
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

  return res;
}
