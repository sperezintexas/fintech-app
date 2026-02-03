/**
 * Unified Options Scanner
 * Runs OptionScanner, CoveredCallScanner, ProtectivePutScanner, and StraddleStrangleScanner
 * in sequence, stores all recommendations, and returns a combined summary.
 * Each sub-scanner is wrapped in try/catch so one failure doesn't abort the rest; errors are accumulated.
 */

import { scanOptions, storeOptionRecommendations } from "./option-scanner";
import { analyzeCoveredCalls, storeCoveredCallRecommendations } from "./covered-call-analyzer";
import { analyzeProtectivePuts, storeProtectivePutRecommendations } from "./protective-put-analyzer";
import { analyzeStraddlesAndStrangles, storeStraddleStrangleRecommendations } from "./straddle-strangle-analyzer";
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

  try {
    const optionRecs = await scanOptions(accountId, config?.optionScanner);
    res.optionScanner.scanned = optionRecs.length;
    const optStored = await storeOptionRecommendations(optionRecs, { createAlerts: true });
    res.optionScanner.stored = optStored.stored;
    res.optionScanner.alertsCreated = optStored.alertsCreated;
  } catch (e) {
    res.errors.push({ scanner: "optionScanner", message: toMessage(e) });
  }

  try {
    const coveredCallRecs = await analyzeCoveredCalls(accountId, config?.coveredCall);
    res.coveredCallScanner.analyzed = coveredCallRecs.length;
    const ccStored = await storeCoveredCallRecommendations(coveredCallRecs, { createAlerts: true });
    res.coveredCallScanner.stored = ccStored.stored;
    res.coveredCallScanner.alertsCreated = ccStored.alertsCreated;
  } catch (e) {
    res.errors.push({ scanner: "coveredCallScanner", message: toMessage(e) });
  }

  try {
    const protectivePutRecs = await analyzeProtectivePuts(accountId, config?.protectivePut);
    res.protectivePutScanner.analyzed = protectivePutRecs.length;
    const ppStored = await storeProtectivePutRecommendations(protectivePutRecs, { createAlerts: true });
    res.protectivePutScanner.stored = ppStored.stored;
    res.protectivePutScanner.alertsCreated = ppStored.alertsCreated;
  } catch (e) {
    res.errors.push({ scanner: "protectivePutScanner", message: toMessage(e) });
  }

  try {
    const straddleRecs = await analyzeStraddlesAndStrangles(accountId);
    res.straddleStrangleScanner.analyzed = straddleRecs.length;
    const ssStored = await storeStraddleStrangleRecommendations(straddleRecs, { createAlerts: true });
    res.straddleStrangleScanner.stored = ssStored.stored;
    res.straddleStrangleScanner.alertsCreated = ssStored.alertsCreated;
  } catch (e) {
    res.errors.push({ scanner: "straddleStrangleScanner", message: toMessage(e) });
  }

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
