/**
 * Zod schemas for job type-specific config validation.
 * Used by /api/jobs when creating/updating jobs.
 */

import { z } from "zod";

/** Option Scanner config (optionScanner nested in unifiedOptionsScanner) */
export const optionScannerConfigSchema = z
  .object({
    holdDteMin: z.number().min(0).max(365).optional(),
    btcDteMax: z.number().min(0).max(365).optional(),
    btcStopLossPercent: z.number().min(-100).max(0).optional(),
    holdTimeValuePercentMin: z.number().min(0).max(100).optional(),
    highVolatilityPercent: z.number().min(0).max(200).optional(),
    riskProfile: z.enum(["low", "medium", "high"]).optional(),
    grokEnabled: z.boolean().optional(),
    grokCandidatesPlPercent: z.number().min(0).max(100).optional(),
    grokCandidatesDteMax: z.number().min(0).max(365).optional(),
    grokCandidatesIvMin: z.number().min(0).max(200).optional(),
    grokMaxParallel: z.number().min(1).max(20).optional(),
    grokSystemPromptOverride: z.string().max(4000).optional(),
  })
  .strict()
  .optional();

/** Covered Call Scanner config (jobType: coveredCallScanner) */
export const coveredCallScannerConfigSchema = z
  .object({
    minPremium: z.number().min(0).optional(),
    maxDelta: z.number().min(0).max(1).optional(),
    symbols: z.array(z.string().min(1).max(10)).optional(),
    expirationRange: z
      .object({
        minDays: z.number().min(0).optional(),
        maxDays: z.number().min(0).optional(),
      })
      .optional(),
    minStockShares: z.number().min(1).max(10000).optional(),
    grokEnabled: z.boolean().optional(),
    grokConfidenceMin: z.number().min(0).max(100).optional(),
    grokDteMax: z.number().min(0).optional(),
    grokIvRankMin: z.number().min(0).max(100).optional(),
    grokMaxParallel: z.number().min(1).max(20).optional(),
    grokSystemPromptOverride: z.string().max(4000).optional(),
    symbol: z.string().min(1).max(10).optional(),
    includeWatchlist: z.boolean().optional(),
    /** BTC when current contract price (buy-back cost) is below this % of premium received (default 70). Take profits early, then roll. */
    earlyProfitBtcThresholdPercent: z.number().min(0).max(100).optional(),
  })
  .strict()
  .optional();

export type CoveredCallScannerConfig = z.infer<typeof coveredCallScannerConfigSchema>;

/** CSP / Protective Put config (jobType: protectivePutScanner) */
export const cspAnalysisConfigSchema = z
  .object({
    minYield: z.number().min(0).optional(),
    riskTolerance: z.enum(["low", "medium", "high"]).optional(),
    watchlistId: z.string().min(1).optional(),
    minStockShares: z.number().min(1).max(10000).optional(),
    symbol: z.string().min(1).max(10).optional(),
    includeWatchlist: z.boolean().optional(),
  })
  .strict()
  .optional();

export type CspAnalysisConfig = z.infer<typeof cspAnalysisConfigSchema>;

/** Straddle/Strangle Scanner config (straddleStrangle nested in unifiedOptionsScanner) */
export const straddleStrangleScannerConfigSchema = z
  .object({
    /** Override risk level for rule thresholds (e.g. low → more conservative SELL_TO_CLOSE). */
    riskLevel: z.enum(["low", "medium", "high"]).optional(),
  })
  .strict()
  .optional();

export type StraddleStrangleScannerConfig = z.infer<typeof straddleStrangleScannerConfigSchema>;

/** Unified Options Scanner config (runs all 4 scanners with optional per-scanner overrides) */
export const unifiedOptionsScannerConfigSchema = z
  .object({
    optionScanner: optionScannerConfigSchema.optional(),
    coveredCall: coveredCallScannerConfigSchema.optional(),
    protectivePut: cspAnalysisConfigSchema.optional(),
    straddleStrangle: straddleStrangleScannerConfigSchema.optional(),
  })
  .strict()
  .optional();

/** Parse and merge unified scanner config: validate with Zod, merge with empty defaults. */
export function parseUnifiedOptionsScannerConfig(
  config: unknown
): z.infer<typeof unifiedOptionsScannerConfigSchema> {
  if (config == null || (typeof config === "object" && Object.keys(config as object).length === 0)) {
    return undefined;
  }
  return unifiedOptionsScannerConfigSchema.parse(config);
}

/** Reasonable defaults for Option Scanner (from options-trading-agent-guidelines). */
export const DEFAULT_OPTION_SCANNER_CONFIG: z.infer<typeof optionScannerConfigSchema> = {
  holdDteMin: 1,
  btcDteMax: 14,
  btcStopLossPercent: -50,
  holdTimeValuePercentMin: 20,
  highVolatilityPercent: 50,
  riskProfile: "medium",
  grokEnabled: false,
  grokCandidatesPlPercent: 12,
  grokCandidatesDteMax: 14,
  grokCandidatesIvMin: 55,
  grokMaxParallel: 6,
};

/** Reasonable defaults for Covered Call Scanner (from covered-calls-scanner.mdc: weekly/bi-weekly, 5–10% OTM, 80% rule). */
export const DEFAULT_COVERED_CALL_CONFIG: z.infer<typeof coveredCallScannerConfigSchema> = {
  minPremium: 0.5,
  maxDelta: 0.4,
  expirationRange: { minDays: 3, maxDays: 14 },
  minStockShares: 100,
  includeWatchlist: true,
  earlyProfitBtcThresholdPercent: 80,
};

/** Reasonable defaults for Protective Put Scanner (from protective-put-analyzer docs). */
export const DEFAULT_PROTECTIVE_PUT_CONFIG: z.infer<typeof cspAnalysisConfigSchema> = {
  minStockShares: 100,
  riskTolerance: "medium",
  includeWatchlist: true,
};

/** Reasonable defaults for Straddle/Strangle Scanner (from straddle-options-scanner). */
export const DEFAULT_STRADDLE_STRANGLE_CONFIG: z.infer<typeof straddleStrangleScannerConfigSchema> = {
  riskLevel: "medium",
};

/** Grok custom prompt (task type defaultConfig or task config override). Prompt required for report type defaultConfig; optional for task config (empty = use type default). */
export const grokConfigSchema = z
  .object({
    prompt: z.string().max(16000).optional(),
  })
  .strict();

export type GrokConfig = z.infer<typeof grokConfigSchema>;

/** Validate config by job type handler key. Returns parsed config or throws. */
export function validateJobConfig(
  jobType: string,
  handlerKey: string,
  config: unknown
): Record<string, unknown> | undefined {
  if (config == null || (typeof config === "object" && Object.keys(config as object).length === 0)) {
    return undefined;
  }
  if (handlerKey === "unifiedOptionsScanner") {
    return unifiedOptionsScannerConfigSchema.parse(config) as Record<string, unknown>;
  }
  if (handlerKey === "grok") {
    const parsed = grokConfigSchema.parse(config) as { prompt?: string };
    const prompt = parsed?.prompt?.trim();
    if (!prompt) return undefined; // task uses type default
    return { prompt } as Record<string, unknown>;
  }
  return config as Record<string, unknown>;
}
