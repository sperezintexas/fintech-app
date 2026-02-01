import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyProtectivePutRules,
  getProtectivePutPositions,
  analyzeProtectivePuts,
  storeProtectivePutRecommendations,
} from "../protective-put-analyzer";

vi.mock("../mongodb", () => ({
  getDb: vi.fn(),
}));

vi.mock("../yahoo", () => ({
  getOptionMetrics: vi.fn(),
  getOptionChainDetailed: vi.fn(),
  getIVRankOrPercentile: vi.fn(),
}));

const { getDb } = await import("../mongodb");
const { getOptionMetrics, getOptionChainDetailed: _getOptionChainDetailed, getIVRankOrPercentile } =
  await import("../yahoo");

describe("Protective Put Analyzer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("applyProtectivePutRules", () => {
    it("returns SELL_TO_CLOSE when stock > put strike + 12%", () => {
      const result = applyProtectivePutRules({
        stockPrice: 280,
        strike: 250,
        dte: 15,
        putBid: 2,
        putAsk: 2.2,
        premiumPaid: 5,
        extrinsicPercentOfPremium: 40,
        stockUnrealizedPlPercent: 12,
        moneyness: "OTM",
        putDelta: null,
        ivRank: 30,
        riskLevel: "medium",
        stockAboveBreakeven: true,
      });
      expect(result.recommendation).toBe("SELL_TO_CLOSE");
      expect(result.confidence).toBe("HIGH");
      expect(result.reason).toContain("above strike");
    });

    it("returns SELL_TO_CLOSE when DTE ≤ 10 and put OTM", () => {
      const result = applyProtectivePutRules({
        stockPrice: 260,
        strike: 250,
        dte: 8,
        putBid: 0.5,
        putAsk: 0.6,
        premiumPaid: 4,
        extrinsicPercentOfPremium: 15,
        stockUnrealizedPlPercent: 5,
        moneyness: "OTM",
        putDelta: null,
        ivRank: null,
        riskLevel: "medium",
        stockAboveBreakeven: true,
      });
      expect(result.recommendation).toBe("SELL_TO_CLOSE");
      expect(result.reason).toContain("OTM");
    });

    it("returns SELL_TO_CLOSE when extrinsic < 10% of premium", () => {
      const result = applyProtectivePutRules({
        stockPrice: 245,
        strike: 250,
        dte: 20,
        putBid: 6,
        putAsk: 6.2,
        premiumPaid: 8,
        extrinsicPercentOfPremium: 5,
        stockUnrealizedPlPercent: -2,
        moneyness: "ITM",
        putDelta: null,
        ivRank: 40,
        riskLevel: "medium",
        stockAboveBreakeven: false,
      });
      expect(result.recommendation).toBe("SELL_TO_CLOSE");
      expect(result.reason).toContain("time value");
    });

    it("returns HOLD when stock dropped > 10% and put ITM", () => {
      const result = applyProtectivePutRules({
        stockPrice: 220,
        strike: 250,
        dte: 25,
        putBid: 32,
        putAsk: 33,
        premiumPaid: 5,
        extrinsicPercentOfPremium: 50,
        stockUnrealizedPlPercent: -12,
        moneyness: "ITM",
        putDelta: null,
        ivRank: 45,
        riskLevel: "medium",
        stockAboveBreakeven: false,
      });
      expect(result.recommendation).toBe("HOLD");
      expect(result.reason).toContain("Hedge is working");
    });

    it("returns SELL_TO_CLOSE for aggressive account when stock above breakeven", () => {
      const result = applyProtectivePutRules({
        stockPrice: 255,
        strike: 250,
        dte: 20,
        putBid: 1,
        putAsk: 1.2,
        premiumPaid: 4,
        extrinsicPercentOfPremium: 60,
        stockUnrealizedPlPercent: 5,
        moneyness: "OTM",
        putDelta: null,
        ivRank: 30,
        riskLevel: "high",
        stockAboveBreakeven: true,
      });
      expect(result.recommendation).toBe("SELL_TO_CLOSE");
      expect(result.reason).toContain("Aggressive");
    });

    it("returns HOLD when IV rank > 50", () => {
      const result = applyProtectivePutRules({
        stockPrice: 248,
        strike: 250,
        dte: 21,
        putBid: 4,
        putAsk: 4.5,
        premiumPaid: 5,
        extrinsicPercentOfPremium: 80,
        stockUnrealizedPlPercent: -1,
        moneyness: "ATM",
        putDelta: null,
        ivRank: 60,
        riskLevel: "medium",
        stockAboveBreakeven: false,
      });
      expect(result.recommendation).toBe("HOLD");
      expect(result.reason).toContain("High IV rank");
    });

    it("returns HOLD when put ITM and adequate DTE", () => {
      const result = applyProtectivePutRules({
        stockPrice: 235,
        strike: 250,
        dte: 25,
        putBid: 16,
        putAsk: 16.5,
        premiumPaid: 5,
        extrinsicPercentOfPremium: 70,
        stockUnrealizedPlPercent: -6,
        moneyness: "ITM",
        putDelta: null,
        ivRank: 35,
        riskLevel: "medium",
        stockAboveBreakeven: false,
      });
      expect(result.recommendation).toBe("HOLD");
      expect(result.reason).toContain("Protection active");
    });
  });

  describe("getProtectivePutPositions", () => {
    it("returns empty when no accounts", async () => {
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await getProtectivePutPositions();
      expect(result.pairs).toEqual([]);
      expect(result.opportunities).toEqual([]);
    });

    it("identifies protective put pairs (stock + put same symbol)", async () => {
      const mockAccounts = [
        {
          _id: { toString: () => "acc1" },
          positions: [
            {
              _id: "stock1",
              type: "stock",
              ticker: "TSLA",
              shares: 100,
              purchasePrice: 240,
            },
            {
              _id: "put1",
              type: "option",
              optionType: "put",
              ticker: "TSLA",
              strike: 230,
              expiration: "2026-02-20",
              contracts: 1,
              premium: 5,
            },
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

      const result = await getProtectivePutPositions();
      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0]).toMatchObject({
        accountId: "acc1",
        symbol: "TSLA",
        stockPositionId: "stock1",
        putPositionId: "put1",
        putStrike: 230,
        putPremiumPaid: 5,
      });
      expect(result.opportunities).toHaveLength(0);
    });

    it("identifies opportunities (stock ≥100 shares without put)", async () => {
      const mockAccounts = [
        {
          _id: { toString: () => "acc1" },
          positions: [
            {
              _id: "stock1",
              type: "stock",
              ticker: "AAPL",
              shares: 200,
              purchasePrice: 180,
            },
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

      const result = await getProtectivePutPositions();
      expect(result.pairs).toHaveLength(0);
      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0]).toMatchObject({
        accountId: "acc1",
        symbol: "AAPL",
        stockShares: 200,
      });
    });

    it("excludes stock with < 100 shares", async () => {
      const mockAccounts = [
        {
          _id: { toString: () => "acc1" },
          positions: [
            {
              _id: "stock1",
              type: "stock",
              ticker: "TSLA",
              shares: 50,
              purchasePrice: 240,
            },
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

      const result = await getProtectivePutPositions();
      expect(result.pairs).toHaveLength(0);
      expect(result.opportunities).toHaveLength(0);
    });
  });

  describe("analyzeProtectivePuts", () => {
    it("returns empty when no positions", async () => {
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([{ _id: {}, positions: [] }]),
          }),
          findOne: vi.fn().mockResolvedValue({ riskLevel: "medium" }),
        }),
      } as never);

      const result = await analyzeProtectivePuts();
      expect(result).toEqual([]);
    });

    it("returns recommendations for protective put pairs", async () => {
      const validObjectId = "507f1f77bcf86cd799439011";
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([
              {
                _id: validObjectId,
                positions: [
                  {
                    _id: "stock1",
                    type: "stock",
                    ticker: "TSLA",
                    shares: 100,
                    purchasePrice: 240,
                  },
                  {
                    _id: "put1",
                    type: "option",
                    optionType: "put",
                    ticker: "TSLA",
                    strike: 230,
                    expiration: "2026-02-20",
                    contracts: 1,
                    premium: 5,
                  },
                ],
              },
            ]),
          }),
          findOne: vi.fn().mockResolvedValue({
            _id: validObjectId,
            riskLevel: "medium",
          }),
        }),
      } as never);

      vi.mocked(getOptionMetrics).mockResolvedValue({
        price: 2,
        bid: 1.8,
        ask: 2.2,
        underlyingPrice: 255,
        impliedVolatility: 28,
        intrinsicValue: 0,
        timeValue: 2,
      });
      vi.mocked(getIVRankOrPercentile).mockResolvedValue(45);

      const result = await analyzeProtectivePuts();
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]).toMatchObject({
        accountId: validObjectId,
        symbol: "TSLA",
        stockPositionId: "stock1",
        putPositionId: "put1",
      });
      expect(["HOLD", "SELL_TO_CLOSE", "ROLL"]).toContain(result[0].recommendation);
      expect(result[0].metrics).toMatchObject({
        stockPrice: 255,
        putBid: 1.8,
        putAsk: 2.2,
        dte: expect.any(Number),
      });
    });
  });

  describe("storeProtectivePutRecommendations", () => {
    it("stores recommendations and creates alerts for actionable recs", async () => {
      const mockInsertOne = vi.fn().mockResolvedValue({ insertedId: "id1" });
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          insertOne: mockInsertOne,
        }),
      } as never);

      const recommendations = [
        {
          accountId: "acc1",
          symbol: "TSLA",
          stockPositionId: "stock1",
          putPositionId: "put1",
          recommendation: "SELL_TO_CLOSE" as const,
          confidence: "HIGH" as const,
          reason: "Stock above strike",
          metrics: {
            stockPrice: 280,
            putBid: 1,
            putAsk: 1.2,
            dte: 15,
            netProtectionCost: 3.8,
            effectiveFloor: 226.2,
            stockUnrealizedPl: 4000,
            stockUnrealizedPlPercent: 16.7,
            protectionCostPercent: 0.4,
          },
          createdAt: new Date().toISOString(),
        },
      ];

      const { stored, alertsCreated } = await storeProtectivePutRecommendations(recommendations, {
        createAlerts: true,
      });

      expect(stored).toBe(1);
      expect(alertsCreated).toBe(1);
      expect(mockInsertOne).toHaveBeenCalledTimes(2);
    });

    it("does not create alerts for HOLD", async () => {
      const mockInsertOne = vi.fn().mockResolvedValue({ insertedId: "id1" });
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          insertOne: mockInsertOne,
        }),
      } as never);

      const recommendations = [
        {
          accountId: "acc1",
          symbol: "TSLA",
          stockPositionId: "stock1",
          putPositionId: "put1",
          recommendation: "HOLD" as const,
          confidence: "HIGH" as const,
          reason: "Protection active",
          metrics: {
            stockPrice: 235,
            putBid: 16,
            putAsk: 16.5,
            dte: 25,
            netProtectionCost: -11,
            effectiveFloor: 261,
            stockUnrealizedPl: -500,
            stockUnrealizedPlPercent: -2.1,
            protectionCostPercent: -4.7,
          },
          createdAt: new Date().toISOString(),
        },
      ];

      const { stored, alertsCreated } = await storeProtectivePutRecommendations(recommendations, {
        createAlerts: true,
      });

      expect(stored).toBe(1);
      expect(alertsCreated).toBe(0);
      expect(mockInsertOne).toHaveBeenCalledTimes(1);
    });
  });
});
