import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyOptionRules,
  clearMarketCache,
  getOptionPositions,
  scanOptions,
  storeOptionRecommendations,
} from "../option-scanner";

vi.mock("../mongodb", () => ({
  getDb: vi.fn(),
}));

vi.mock("../yahoo", () => ({
  getOptionMetrics: vi.fn(),
  getOptionMarketConditions: vi.fn(),
  probAssignmentCall: vi.fn().mockReturnValue(25),
}));

const { getDb } = await import("../mongodb");
const { getOptionMetrics, getOptionMarketConditions } = await import("../yahoo");

describe("Option Scanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMarketCache();
  });

  describe("applyOptionRules", () => {
    it("returns BUY_TO_CLOSE for stop loss (P/L < -50%)", () => {
      const result = applyOptionRules(
        {
          dte: 20,
          plPercent: -55,
          intrinsicValue: 5,
          timeValue: 2,
          premium: 7,
          optionType: "call",
        },
        {}
      );
      expect(result.recommendation).toBe("BUY_TO_CLOSE");
      expect(result.reason).toContain("Stop loss");
    });

    it("returns BUY_TO_CLOSE for low DTE (< 7)", () => {
      const result = applyOptionRules(
        {
          dte: 5,
          plPercent: 10,
          intrinsicValue: 3,
          timeValue: 1,
          premium: 4,
          optionType: "call",
        },
        {}
      );
      expect(result.recommendation).toBe("BUY_TO_CLOSE");
      expect(result.reason).toContain("Low DTE");
    });

    it("returns HOLD for adequate DTE (>= 14)", () => {
      const result = applyOptionRules(
        {
          dte: 21,
          plPercent: 5,
          intrinsicValue: 0,
          timeValue: 2,
          premium: 2,
          optionType: "put",
        },
        {}
      );
      expect(result.recommendation).toBe("HOLD");
      expect(result.reason).toContain("Adequate DTE");
    });

    it("returns HOLD for profitable position", () => {
      const result = applyOptionRules(
        {
          dte: 10,
          plPercent: 25,
          intrinsicValue: 5,
          timeValue: 1,
          premium: 6,
          optionType: "call",
        },
        {}
      );
      expect(result.recommendation).toBe("HOLD");
      expect(result.reason).toContain("Profitable");
    });

    it("returns HOLD when time value > 20% of premium", () => {
      const result = applyOptionRules(
        {
          dte: 10,
          plPercent: 0,
          intrinsicValue: 0,
          timeValue: 1.5,
          premium: 5,
          optionType: "call",
        },
        {}
      );
      expect(result.recommendation).toBe("HOLD");
      expect(result.reason).toContain("Time value");
    });

    it("returns HOLD for loss position when DTE < 7 (do not BTC at loss)", () => {
      const result = applyOptionRules(
        {
          dte: 5,
          plPercent: -40,
          intrinsicValue: 0,
          timeValue: 0.5,
          premium: 5,
          optionType: "put",
        },
        {}
      );
      expect(result.recommendation).toBe("HOLD");
      expect(result.reason).toMatch(/loss|Avoid BTC|bid.*below entry/i);
    });

    it("returns HOLD for loss position when DTE 8–9 (do not BTC at loss)", () => {
      const result = applyOptionRules(
        {
          dte: 8,
          plPercent: -20,
          intrinsicValue: 0,
          timeValue: 0.5,
          premium: 5,
          optionType: "call",
        },
        {}
      );
      expect(result.recommendation).toBe("HOLD");
      expect(result.reason).toMatch(/loss|Do not close|bid.*below entry/i);
    });

    it("returns BUY_TO_CLOSE for DTE 8-13 when profitable", () => {
      const result = applyOptionRules(
        {
          dte: 8,
          plPercent: 15,
          intrinsicValue: 0,
          timeValue: 0.5,
          premium: 5,
          optionType: "call",
        },
        {}
      );
      expect(result.recommendation).toBe("BUY_TO_CLOSE");
      expect(result.reason).toContain("approaching expiry");
    });

    it("respects custom config thresholds", () => {
      const result = applyOptionRules(
        {
          dte: 10,
          plPercent: -60,
          intrinsicValue: 0,
          timeValue: 0.5,
          premium: 5,
          optionType: "call",
        },
        { btcStopLossPercent: -70 }
      );
      expect(result.recommendation).not.toBe("BUY_TO_CLOSE");
    });
  });

  describe("getOptionPositions", () => {
    it("returns empty array when no accounts", async () => {
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await getOptionPositions();
      expect(result).toEqual([]);
    });

    it("extracts option positions from accounts", async () => {
      const mockAccounts = [
        {
          _id: { toString: () => "acc1" },
          positions: [
            {
              _id: "pos1",
              type: "option",
              ticker: "TSLA",
              strike: 250,
              expiration: "2026-02-20",
              optionType: "call",
              contracts: 2,
              premium: 5.5,
            },
            { type: "stock", ticker: "AAPL", shares: 10 },
          ],
        },
      ];

      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockAccounts),
          }),
        }),
      } as never);

      const result = await getOptionPositions();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        positionId: "pos1",
        accountId: "acc1",
        ticker: "TSLA",
        strike: 250,
        expiration: "2026-02-20",
        optionType: "call",
        contracts: 2,
        premium: 5.5,
      });
    });

    it("filters by accountId when provided", async () => {
      const validObjectId = "507f1f77bcf86cd799439011";
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockImplementation((query: { _id?: unknown }) => {
            expect(query).toHaveProperty("_id");
            return {
              toArray: vi.fn().mockResolvedValue([]),
            };
          }),
        }),
      } as never);

      await getOptionPositions(validObjectId);
      expect(getDb).toHaveBeenCalled();
    });
  });

  describe("scanOptions", () => {
    it("returns empty array when no option positions", async () => {
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([{ _id: {}, positions: [] }]),
          }),
        }),
      } as never);

      const result = await scanOptions();
      expect(result).toEqual([]);
    });

    it("returns recommendations when positions and metrics exist", async () => {
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([
              {
                _id: { toString: () => "acc1" },
                positions: [
                  {
                    _id: "pos1",
                    type: "option",
                    ticker: "TSLA",
                    strike: 250,
                    expiration: "2026-02-20",
                    optionType: "call",
                    contracts: 1,
                    premium: 5,
                  },
                ],
              },
            ]),
          }),
        }),
      } as never);

      vi.mocked(getOptionMetrics).mockResolvedValue({
        price: 6,
        bid: 5.8,
        ask: 6.2,
        underlyingPrice: 255,
        impliedVolatility: 25,
        intrinsicValue: 5,
        timeValue: 1,
      });

      vi.mocked(getOptionMarketConditions).mockResolvedValue({
        vix: 18,
        vixLevel: "low",
        trend: "up",
      });

      const result = await scanOptions();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        positionId: "pos1",
        accountId: "acc1",
        underlyingSymbol: "TSLA",
        strike: 250,
        optionType: "call",
        contracts: 1,
      });
      expect(["HOLD", "BUY_TO_CLOSE"]).toContain(result[0].recommendation);
      expect(result[0].metrics).toMatchObject({
        price: 6,
        underlyingPrice: 255,
        pl: 100,
        plPercent: 20,
        intrinsicValue: 5,
        timeValue: 1,
      });
    });

    it("uses in-memory cache so second scan does not duplicate Yahoo calls", async () => {
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([
              {
                _id: { toString: () => "acc1" },
                positions: [
                  {
                    _id: "pos1",
                    type: "option",
                    ticker: "TSLA",
                    strike: 250,
                    expiration: "2026-02-20",
                    optionType: "call",
                    contracts: 1,
                    premium: 5,
                  },
                ],
              },
            ]),
          }),
        }),
      } as never);

      vi.mocked(getOptionMetrics).mockResolvedValue({
        price: 6,
        bid: 5.8,
        ask: 6.2,
        underlyingPrice: 255,
        impliedVolatility: 25,
        intrinsicValue: 5,
        timeValue: 1,
      });

      vi.mocked(getOptionMarketConditions).mockResolvedValue({
        vix: 18,
        vixLevel: "low",
        trend: "up",
      });

      clearMarketCache();
      await scanOptions();
      await scanOptions();

      expect(getOptionMetrics).toHaveBeenCalledTimes(1);
      expect(getOptionMarketConditions).toHaveBeenCalledTimes(1);
    });

    it("skips positions when metrics unavailable", async () => {
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([
              {
                _id: { toString: () => "acc1" },
                positions: [
                  {
                    _id: "pos1",
                    type: "option",
                    ticker: "TSLA",
                    strike: 250,
                    expiration: "2026-02-20",
                    optionType: "call",
                    contracts: 1,
                    premium: 5,
                  },
                ],
              },
            ]),
          }),
        }),
      } as never);

      vi.mocked(getOptionMetrics).mockResolvedValue(null);

      const result = await scanOptions();
      expect(result).toHaveLength(0);
    });
  });

  describe("storeOptionRecommendations", () => {
    it("stores recommendations and creates alerts for BUY_TO_CLOSE", async () => {
      const mockInsertOne = vi.fn().mockResolvedValue({ insertedId: "id1" });
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          insertOne: mockInsertOne,
        }),
      } as never);

      const recommendations = [
        {
          positionId: "pos1",
          accountId: "acc1",
          symbol: "TSLA 2026-02-20 C $250",
          underlyingSymbol: "TSLA",
          strike: 250,
          expiration: "2026-02-20",
          optionType: "call" as const,
          contracts: 1,
          recommendation: "BUY_TO_CLOSE" as const,
          reason: "Stop loss",
          metrics: {
            price: 2,
            underlyingPrice: 240,
            dte: 5,
            pl: -300,
            plPercent: -60,
            intrinsicValue: 0,
            timeValue: 2,
          },
          createdAt: new Date().toISOString(),
        },
      ];

      const { stored, alertsCreated } = await storeOptionRecommendations(recommendations, {
        createAlerts: true,
      });

      expect(stored).toBe(1);
      expect(alertsCreated).toBe(1);
      expect(mockInsertOne).toHaveBeenCalledTimes(2);
    });

    it("does not create alerts when createAlerts is false", async () => {
      const mockInsertOne = vi.fn().mockResolvedValue({ insertedId: "id1" });
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          insertOne: mockInsertOne,
        }),
      } as never);

      const recommendations = [
        {
          positionId: "pos1",
          accountId: "acc1",
          symbol: "TSLA 2026-02-20 C $250",
          underlyingSymbol: "TSLA",
          strike: 250,
          expiration: "2026-02-20",
          optionType: "call" as const,
          contracts: 1,
          recommendation: "BUY_TO_CLOSE" as const,
          reason: "Stop loss",
          metrics: {
            price: 2,
            underlyingPrice: 240,
            dte: 5,
            pl: -300,
            plPercent: -60,
            intrinsicValue: 0,
            timeValue: 2,
          },
          createdAt: new Date().toISOString(),
        },
      ];

      const { stored, alertsCreated } = await storeOptionRecommendations(recommendations, {
        createAlerts: false,
      });

      expect(stored).toBe(1);
      expect(alertsCreated).toBe(0);
      expect(mockInsertOne).toHaveBeenCalledTimes(1);
    });

    it("does not create alerts for HOLD recommendations", async () => {
      const mockInsertOne = vi.fn().mockResolvedValue({ insertedId: "id1" });
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          insertOne: mockInsertOne,
        }),
      } as never);

      const recommendations = [
        {
          positionId: "pos1",
          accountId: "acc1",
          symbol: "TSLA 2026-02-20 C $250",
          underlyingSymbol: "TSLA",
          strike: 250,
          expiration: "2026-02-20",
          optionType: "call" as const,
          contracts: 1,
          recommendation: "HOLD" as const,
          reason: "Adequate DTE",
          metrics: {
            price: 6,
            underlyingPrice: 255,
            dte: 21,
            pl: 100,
            plPercent: 20,
            intrinsicValue: 5,
            timeValue: 1,
          },
          createdAt: new Date().toISOString(),
        },
      ];

      const { stored, alertsCreated } = await storeOptionRecommendations(recommendations, {
        createAlerts: true,
      });

      expect(stored).toBe(1);
      expect(alertsCreated).toBe(0);
      expect(mockInsertOne).toHaveBeenCalledTimes(1);
    });

    it("alert body for underwater BUY_TO_CLOSE uses loss wording and no ROI favorable", async () => {
      const mockInsertOne = vi.fn().mockResolvedValue({ insertedId: "id1" });
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          insertOne: mockInsertOne,
        }),
      } as never);

      const recommendations = [
        {
          positionId: "pos1",
          accountId: "acc1",
          symbol: "LUNR 2026-02-20 P $19",
          underlyingSymbol: "LUNR",
          strike: 19,
          expiration: "2026-02-20",
          optionType: "put" as const,
          contracts: 1,
          unitCost: 1.32,
          recommendation: "BUY_TO_CLOSE" as const,
          reason: "Stop loss",
          metrics: {
            price: 3.8,
            underlyingPrice: 15.7,
            dte: 8,
            pl: -248,
            plPercent: -188,
            intrinsicValue: 3.3,
            timeValue: 0.5,
          },
          createdAt: new Date().toISOString(),
        },
      ];

      await storeOptionRecommendations(recommendations, { createAlerts: true });

      const alertCall = mockInsertOne.mock.calls.find(
        (c) => Array.isArray(c) && (c[0] as { type?: string })?.type === "option-scanner"
      );
      expect(alertCall).toBeDefined();
      const reason = (alertCall as [ { reason: string } ])[0].reason;
      expect(reason).toMatch(/net loss|Avoid BTC|bid falls below your entry|\$1\.32/i);
      expect(reason).not.toMatch(/ROI favorable either way|BTC now if conservative/);
    });
  });
});
