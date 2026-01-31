import { describe, it, expect } from "vitest";
import {
  validateJobConfig,
  coveredCallScannerConfigSchema,
  cspAnalysisConfigSchema,
} from "../job-config-schemas";

describe("job-config-schemas", () => {
  describe("coveredCallScannerConfigSchema", () => {
    it("accepts valid config", () => {
      const config = {
        minPremium: 0.5,
        maxDelta: 0.35,
        symbols: ["TSLA", "AAPL"],
        expirationRange: { minDays: 7, maxDays: 45 },
        minStockShares: 100,
      };
      expect(coveredCallScannerConfigSchema.parse(config)).toEqual(config);
    });

    it("accepts Grok config", () => {
      const config = {
        grokEnabled: true,
        grokConfidenceMin: 70,
        grokDteMax: 14,
        grokIvRankMin: 50,
        grokMaxParallel: 6,
        grokSystemPromptOverride: "Custom prompt for covered call decisions.",
      };
      expect(coveredCallScannerConfigSchema.parse(config)).toEqual(config);
    });

    it("accepts empty/partial config", () => {
      expect(coveredCallScannerConfigSchema.parse(undefined)).toBeUndefined();
      expect(coveredCallScannerConfigSchema.parse({})).toEqual({});
      expect(coveredCallScannerConfigSchema.parse({ minPremium: 0.5 })).toEqual({ minPremium: 0.5 });
    });

    it("rejects invalid maxDelta (out of range)", () => {
      expect(() => coveredCallScannerConfigSchema.parse({ maxDelta: 1.5 })).toThrow();
      expect(() => coveredCallScannerConfigSchema.parse({ maxDelta: -0.1 })).toThrow();
    });

    it("rejects invalid symbols (empty string)", () => {
      expect(() => coveredCallScannerConfigSchema.parse({ symbols: [""] })).toThrow();
    });
  });

  describe("cspAnalysisConfigSchema", () => {
    it("accepts valid config", () => {
      const config = {
        minYield: 20,
        riskTolerance: "medium" as const,
        watchlistId: "abc123",
        minStockShares: 100,
      };
      expect(cspAnalysisConfigSchema.parse(config)).toEqual(config);
    });

    it("accepts partial config", () => {
      expect(cspAnalysisConfigSchema.parse({ riskTolerance: "low" })).toEqual({
        riskTolerance: "low",
      });
    });

    it("rejects invalid riskTolerance", () => {
      expect(() => cspAnalysisConfigSchema.parse({ riskTolerance: "extreme" })).toThrow();
    });
  });

  describe("validateJobConfig", () => {
    it("returns undefined for null/empty config", () => {
      expect(validateJobConfig("coveredCallScanner", "coveredCallScanner", null)).toBeUndefined();
      expect(validateJobConfig("coveredCallScanner", "coveredCallScanner", undefined)).toBeUndefined();
      expect(validateJobConfig("coveredCallScanner", "coveredCallScanner", {})).toBeUndefined();
    });

    it("validates coveredCallScanner config", () => {
      const config = { minPremium: 0.5, symbols: ["TSLA"] };
      expect(validateJobConfig("coveredCallScanner", "coveredCallScanner", config)).toEqual(config);
    });

    it("validates protectivePutScanner config", () => {
      const config = { minYield: 25, riskTolerance: "high" };
      expect(validateJobConfig("protectivePutScanner", "protectivePutScanner", config)).toEqual(
        config
      );
    });

    it("throws for invalid coveredCallScanner config", () => {
      expect(() =>
        validateJobConfig("coveredCallScanner", "coveredCallScanner", { maxDelta: 2 })
      ).toThrow();
    });

    it("passes through OptionScanner config", () => {
      const config = { holdDteMin: 14, btcDteMax: 7 };
      expect(validateJobConfig("OptionScanner", "OptionScanner", config)).toEqual(config);
    });
  });
});
