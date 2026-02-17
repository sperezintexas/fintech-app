import { describe, it, expect } from "vitest";
import { parsedOrderSchema, orderActionSchema } from "../order";

describe("order types", () => {
  describe("parsedOrderSchema", () => {
    it("accepts valid minimal order", () => {
      const result = parsedOrderSchema.safeParse({
        action: "SELL_NEW_CALL",
        ticker: "tsla",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ticker).toBe("TSLA");
        expect(result.data.action).toBe("SELL_NEW_CALL");
      }
    });

    it("accepts full order with optional fields", () => {
      const result = parsedOrderSchema.safeParse({
        action: "ROLL",
        ticker: "TSLA",
        optionType: "call",
        strike: 450,
        expiration: "2026-02-21",
        contracts: 2,
        rollToStrike: 460,
        rollToExpiration: "2026-03-21",
        reason: "Roll out and up",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rollToStrike).toBe(460);
        expect(result.data.contracts).toBe(2);
      }
    });

    it("rejects invalid action", () => {
      const result = parsedOrderSchema.safeParse({
        action: "INVALID",
        ticker: "TSLA",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty ticker", () => {
      const result = parsedOrderSchema.safeParse({
        action: "HOLD",
        ticker: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("orderActionSchema", () => {
    it("accepts all valid actions", () => {
      const actions = ["BUY_TO_CLOSE", "SELL_TO_CLOSE", "SELL_NEW_CALL", "BUY_NEW_PUT", "ROLL", "HOLD", "NONE"];
      for (const action of actions) {
        expect(orderActionSchema.safeParse(action).success).toBe(true);
      }
    });
  });
});
