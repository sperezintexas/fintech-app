import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyCoveredCallRules,
  getCoveredCallPositions,
  analyzeCoveredCalls,
  storeCoveredCallRecommendations,
} from "../covered-call-analyzer";

vi.mock("../mongodb", () => ({
  getDb: vi.fn(),
}));

vi.mock("../yahoo", () => ({
  getOptionMetrics: vi.fn(),
  getOptionChainDetailed: vi.fn(),
  getIVRankOrPercentile: vi.fn(),
  getOptionMarketConditions: vi.fn(),
}));

const { getDb } = await import("../mongodb");
const { getOptionMetrics, getOptionChainDetailed, getIVRankOrPercentile, getOptionMarketConditions } =
  await import("../yahoo");

describe("Covered Call Analyzer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("applyCoveredCallRules", () => {
    it("returns BUY_TO_CLOSE when stock ≥ strike+5% and DTE ≤ 7", () => {
      const result = applyCoveredCallRules({
        stockPrice: 265,
        strike: 250,
        dte: 5,
        callBid: 18,
        callAsk: 19,
        premiumReceived: 5,
        extrinsicPercentOfPremium: 10,
        unrealizedStockGainPercent: 10,
        moneyness: "ITM",
        ivRank: 30,
        symbolChangePercent: 1,
        riskLevel: "medium",
      });
      expect(result.recommendation).toBe("BUY_TO_CLOSE");
      expect(result.confidence).toBe("HIGH");
      expect(result.reason).toContain("above strike");
    });

    it("returns BUY_TO_CLOSE when DTE ≤ 3 and call OTM", () => {
      const result = applyCoveredCallRules({
        stockPrice: 240,
        strike: 250,
        dte: 2,
        callBid: 0.5,
        callAsk: 0.6,
        premiumReceived: 5,
        extrinsicPercentOfPremium: 10,
        unrealizedStockGainPercent: -5,
        moneyness: "OTM",
        ivRank: null,
        symbolChangePercent: 0,
        riskLevel: "medium",
      });
      expect(result.recommendation).toBe("BUY_TO_CLOSE");
      expect(result.reason).toContain("OTM");
    });

    it("returns BUY_TO_CLOSE when extrinsic < 5% of premium", () => {
      const result = applyCoveredCallRules({
        stockPrice: 255,
        strike: 250,
        dte: 10,
        callBid: 5.2,
        callAsk: 5.4,
        premiumReceived: 6,
        extrinsicPercentOfPremium: 3,
        unrealizedStockGainPercent: 5,
        moneyness: "ITM",
        ivRank: 40,
        symbolChangePercent: 1,
        riskLevel: "medium",
      });
      expect(result.recommendation).toBe("BUY_TO_CLOSE");
      expect(result.reason).toContain("Time decay");
    });

    it("returns BUY_TO_CLOSE for conservative account with DTE < 14", () => {
      const result = applyCoveredCallRules({
        stockPrice: 248,
        strike: 250,
        dte: 10,
        callBid: 2,
        callAsk: 2.2,
        premiumReceived: 4,
        extrinsicPercentOfPremium: 50,
        unrealizedStockGainPercent: 0,
        moneyness: "OTM",
        ivRank: 30,
        symbolChangePercent: 0,
        riskLevel: "low",
      });
      expect(result.recommendation).toBe("BUY_TO_CLOSE");
      expect(result.reason).toContain("Conservative");
    });

    it("returns HOLD when IV rank > 50 and stock near/below strike", () => {
      const result = applyCoveredCallRules({
        stockPrice: 248,
        strike: 250,
        dte: 21,
        callBid: 4,
        callAsk: 4.5,
        premiumReceived: 5,
        extrinsicPercentOfPremium: 80,
        unrealizedStockGainPercent: -2,
        moneyness: "OTM",
        ivRank: 60,
        symbolChangePercent: 0,
        riskLevel: "medium",
      });
      expect(result.recommendation).toBe("HOLD");
      expect(result.reason).toContain("High IV rank");
    });

    it("returns HOLD when DTE ≥ 14 and call OTM", () => {
      const result = applyCoveredCallRules({
        stockPrice: 245,
        strike: 250,
        dte: 21,
        callBid: 2,
        callAsk: 2.2,
        premiumReceived: 3,
        extrinsicPercentOfPremium: 70,
        unrealizedStockGainPercent: 5,
        moneyness: "OTM",
        ivRank: 40,
        symbolChangePercent: 0,
        riskLevel: "medium",
      });
      expect(result.recommendation).toBe("HOLD");
      expect(result.reason).toContain("Adequate DTE");
    });
  });

  describe("getCoveredCallPositions", () => {
    it("returns empty when no accounts", async () => {
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await getCoveredCallPositions();
      expect(result.pairs).toEqual([]);
      expect(result.opportunities).toEqual([]);
    });

    it("identifies covered call pairs (stock + call same symbol)", async () => {
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
              _id: "call1",
              type: "option",
              optionType: "call",
              ticker: "TSLA",
              strike: 250,
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

      const result = await getCoveredCallPositions();
      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0]).toMatchObject({
        accountId: "acc1",
        symbol: "TSLA",
        stockPositionId: "stock1",
        callPositionId: "call1",
        callStrike: 250,
        callPremiumReceived: 5,
      });
      expect(result.opportunities).toHaveLength(0);
    });

    it("identifies covered call pairs when call has OCC format ticker (TSLA250117C250)", async () => {
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
              _id: "call1",
              type: "option",
              optionType: "call",
              ticker: "TSLA250117C250",
              strike: 250,
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

      const result = await getCoveredCallPositions();
      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0]).toMatchObject({
        accountId: "acc1",
        symbol: "TSLA",
        callStrike: 250,
      });
    });

    it("identifies opportunities (stock ≥100 shares without call)", async () => {
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

      const result = await getCoveredCallPositions();
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

      const result = await getCoveredCallPositions();
      expect(result.pairs).toHaveLength(0);
      expect(result.opportunities).toHaveLength(0);
    });
  });

  describe("analyzeCoveredCalls", () => {
    it("returns empty when no positions", async () => {
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([{ _id: {}, positions: [] }]),
          }),
          findOne: vi.fn().mockResolvedValue({ riskLevel: "medium" }),
        }),
      } as never);

      const result = await analyzeCoveredCalls();
      expect(result).toEqual([]);
    });

    it("returns recommendations for covered call pairs", async () => {
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
                    _id: "call1",
                    type: "option",
                    optionType: "call",
                    ticker: "TSLA",
                    strike: 250,
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
        price: 3,
        bid: 2.8,
        ask: 3.2,
        underlyingPrice: 255,
        impliedVolatility: 28,
        intrinsicValue: 5,
        timeValue: 0,
      });
      vi.mocked(getOptionMarketConditions).mockResolvedValue({
        vix: 18,
        vixLevel: "moderate",
        trend: "up",
        symbolChangePercent: 2,
      });
      vi.mocked(getIVRankOrPercentile).mockResolvedValue(45);

      const result = await analyzeCoveredCalls();
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]).toMatchObject({
        accountId: validObjectId,
        symbol: "TSLA",
        stockPositionId: "stock1",
        callPositionId: "call1",
      });
      expect(["HOLD", "BUY_TO_CLOSE", "ROLL"]).toContain(result[0].recommendation);
      expect(result[0].metrics).toMatchObject({
        stockPrice: 255,
        callBid: 2.8,
        callAsk: 3.2,
        dte: expect.any(Number),
      });
    });
  });

  describe("storeCoveredCallRecommendations", () => {
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
          callPositionId: "call1",
          recommendation: "BUY_TO_CLOSE" as const,
          confidence: "HIGH" as const,
          reason: "Deep ITM",
          metrics: {
            stockPrice: 265,
            callBid: 18,
            callAsk: 19,
            dte: 5,
            netPremium: -13,
            unrealizedPl: -1300,
            breakeven: 235,
          },
          createdAt: new Date().toISOString(),
        },
      ];

      const { stored, alertsCreated } = await storeCoveredCallRecommendations(recommendations, {
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
          callPositionId: "call1",
          recommendation: "HOLD" as const,
          confidence: "HIGH" as const,
          reason: "Adequate DTE",
          metrics: {
            stockPrice: 245,
            callBid: 2,
            callAsk: 2.2,
            dte: 21,
            netPremium: 2.8,
            unrealizedPl: 280,
            breakeven: 235,
          },
          createdAt: new Date().toISOString(),
        },
      ];

      const { stored, alertsCreated } = await storeCoveredCallRecommendations(recommendations, {
        createAlerts: true,
      });

      expect(stored).toBe(1);
      expect(alertsCreated).toBe(0);
      expect(mockInsertOne).toHaveBeenCalledTimes(1);
    });
  });
});
