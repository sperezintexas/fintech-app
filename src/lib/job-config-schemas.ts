/**
 * Zod schemas for job type-specific config validation.
 * Used by /api/jobs when creating/updating jobs.
 */

import { z } from "zod";

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
  })
  .strict()
  .optional();

export type CspAnalysisConfig = z.infer<typeof cspAnalysisConfigSchema>;

/** Validate config by job type handler key. Returns parsed config or throws. */
export function validateJobConfig(
  jobType: string,
  handlerKey: string,
  config: unknown
): Record<string, unknown> | undefined {
  if (config == null || (typeof config === "object" && Object.keys(config as object).length === 0)) {
    return undefined;
  }
  if (handlerKey === "coveredCallScanner") {
    return coveredCallScannerConfigSchema.parse(config) as Record<string, unknown>;
  }
  if (handlerKey === "protectivePutScanner") {
    return cspAnalysisConfigSchema.parse(config) as Record<string, unknown>;
  }
  if (handlerKey === "OptionScanner") {
    return config as Record<string, unknown>;
  }
  return config as Record<string, unknown>;
}
