import { describe, it, expect } from "vitest";
import { STRATEGIES, OUTLOOKS, calculatePL, generatePLData } from "../strategy-builder";

describe("strategy-builder", () => {
  describe("OUTLOOKS", () => {
    it("has bullish, neutral, bearish", () => {
      expect(OUTLOOKS.map((o) => o.id)).toEqual(["bullish", "neutral", "bearish"]);
    });
  });

  describe("STRATEGIES", () => {
    it("has at least buy-call and buy-put", () => {
      const ids = STRATEGIES.map((s) => s.id);
      expect(ids).toContain("buy-call");
      expect(ids).toContain("buy-put");
    });

    it("filters by outlook", () => {
      const bullish = STRATEGIES.filter((s) => s.outlooks.includes("bullish"));
      expect(bullish.length).toBeGreaterThan(0);
    });
  });

  describe("calculatePL", () => {
    it("returns positive P/L for ITM call at expiration", () => {
      const pnl = calculatePL(265, 250, 10, true, 1);
      expect(pnl).toBeGreaterThan(0);
    });

    it("returns negative P/L for OTM call at expiration", () => {
      const pnl = calculatePL(240, 250, 10, true, 1);
      expect(pnl).toBeLessThan(0);
    });

    it("scales by quantity", () => {
      const pnl1 = calculatePL(260, 250, 10, true, 1);
      const pnl2 = calculatePL(260, 250, 10, true, 2);
      expect(pnl2).toBe(pnl1 * 2);
    });
  });

  describe("generatePLData", () => {
    it("returns array of price/pnl points", () => {
      const data = generatePLData(250, 10, true, 1);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty("price");
      expect(data[0]).toHaveProperty("pnl");
    });
  });
});
