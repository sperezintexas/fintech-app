import { describe, it, expect } from "vitest";
import { STRATEGIES, OUTLOOKS, calculatePL, generatePLData, buildOrderFromParsed } from "../strategy-builder";
import type { ParsedOrder } from "@/types/order";

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

  describe("buildOrderFromParsed", () => {
    it("maps SELL_NEW_CALL to covered-call and sell", () => {
      const order: ParsedOrder = {
        action: "SELL_NEW_CALL",
        ticker: "TSLA",
        optionType: "call",
        strike: 450,
        expiration: "2026-02-21",
        contracts: 1,
      };
      const prefill = buildOrderFromParsed(order);
      expect(prefill.symbol).toBe("TSLA");
      expect(prefill.strategyId).toBe("covered-call");
      expect(prefill.action).toBe("sell");
      expect(prefill.contractType).toBe("call");
      expect(prefill.strike).toBe(450);
      expect(prefill.expiration).toBe("2026-02-21");
      expect(prefill.quantity).toBe(1);
    });

    it("maps ROLL to covered-call with roll targets", () => {
      const order: ParsedOrder = {
        action: "ROLL",
        ticker: "TSLA",
        optionType: "call",
        strike: 450,
        expiration: "2026-01-17",
        rollToStrike: 460,
        rollToExpiration: "2026-02-21",
        contracts: 1,
      };
      const prefill = buildOrderFromParsed(order);
      expect(prefill.strategyId).toBe("covered-call");
      expect(prefill.action).toBe("sell");
      expect(prefill.rollToStrike).toBe(460);
      expect(prefill.rollToExpiration).toBe("2026-02-21");
    });

    it("maps BUY_NEW_PUT to buy-put", () => {
      const order: ParsedOrder = {
        action: "BUY_NEW_PUT",
        ticker: "AAPL",
        optionType: "put",
        strike: 180,
        contracts: 2,
      };
      const prefill = buildOrderFromParsed(order);
      expect(prefill.strategyId).toBe("buy-put");
      expect(prefill.action).toBe("buy");
      expect(prefill.contractType).toBe("put");
      expect(prefill.quantity).toBe(2);
    });
  });
});
