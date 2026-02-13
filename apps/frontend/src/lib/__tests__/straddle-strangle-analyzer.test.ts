import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyStraddleStrangleRules,
  getStraddleStranglePositions,
  analyzeStraddlesAndStrangles,
  storeStraddleStrangleRecommendations,
} from "../straddle-strangle-analyzer";

vi.mock("../mongodb", () => ({
  getDb: vi.fn(),
}));

vi.mock("../yahoo", () => ({
  getOptionMetrics: vi.fn(),
  getIVRankOrPercentile: vi.fn(),
}));

const { getDb } = await import("../mongodb");
const { getOptionMetrics, getIVRankOrPercentile } = await import("../yahoo");

describe("Straddle/Strangle Analyzer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("applyStraddleStrangleRules", () => {
    it("returns SELL_TO_CLOSE when DTE ≤ 10 and extrinsic < 25% of entry", () => {
      const result = applyStraddleStrangleRules({
        dte: 8,
        netCurrentValue: 400,
        entryCost: 500,
        extrinsicPercentOfEntry: 20,
        unrealizedPlPercent: -15,
        ivRankCurrent: 40,
        ivVsHvDiff: 5,
        stockAboveUpperBreakeven: false,
        stockBelowLowerBreakeven: false,
        requiredMovePercent: 5,
        riskLevel: "medium",
      });
      expect(result.recommendation).toBe("SELL_TO_CLOSE");
      expect(result.confidence).toBe("HIGH");
      expect(result.reason).toContain("theta burn");
    });

    it("returns SELL_TO_CLOSE when stock past breakeven and position profitable", () => {
      const result = applyStraddleStrangleRules({
        dte: 25,
        netCurrentValue: 600,
        entryCost: 500,
        extrinsicPercentOfEntry: 50,
        unrealizedPlPercent: 20,
        ivRankCurrent: 45,
        ivVsHvDiff: 3,
        stockAboveUpperBreakeven: true,
        stockBelowLowerBreakeven: false,
        requiredMovePercent: 2,
        riskLevel: "medium",
      });
      expect(result.recommendation).toBe("SELL_TO_CLOSE");
      expect(result.reason).toContain("Take profit");
    });

    it("returns SELL_TO_CLOSE when IV rank < 30 and position losing > 15%", () => {
      const result = applyStraddleStrangleRules({
        dte: 20,
        netCurrentValue: 400,
        entryCost: 500,
        extrinsicPercentOfEntry: 40,
        unrealizedPlPercent: -20,
        ivRankCurrent: 25,
        ivVsHvDiff: -5,
        stockAboveUpperBreakeven: false,
        stockBelowLowerBreakeven: false,
        requiredMovePercent: 8,
        riskLevel: "medium",
      });
      expect(result.recommendation).toBe("SELL_TO_CLOSE");
      expect(result.reason).toContain("IV rank low");
    });

    it("returns HOLD when IV rank > 70 and DTE > 30", () => {
      const result = applyStraddleStrangleRules({
        dte: 35,
        netCurrentValue: 480,
        entryCost: 500,
        extrinsicPercentOfEntry: 60,
        unrealizedPlPercent: -4,
        ivRankCurrent: 75,
        ivVsHvDiff: 10,
        stockAboveUpperBreakeven: false,
        stockBelowLowerBreakeven: false,
        requiredMovePercent: 6,
        riskLevel: "medium",
      });
      expect(result.recommendation).toBe("HOLD");
      expect(result.reason).toContain("High IV rank");
    });

    it("returns SELL_TO_CLOSE for conservative account when DTE < 14", () => {
      const result = applyStraddleStrangleRules({
        dte: 10,
        netCurrentValue: 450,
        entryCost: 500,
        extrinsicPercentOfEntry: 50,
        unrealizedPlPercent: -10,
        ivRankCurrent: 50,
        ivVsHvDiff: 2,
        stockAboveUpperBreakeven: false,
        stockBelowLowerBreakeven: false,
        requiredMovePercent: 5,
        riskLevel: "low",
      });
      expect(result.recommendation).toBe("SELL_TO_CLOSE");
      expect(result.reason).toContain("Conservative");
    });

    it("returns HOLD as default when no rule matches", () => {
      const result = applyStraddleStrangleRules({
        dte: 25,
        netCurrentValue: 480,
        entryCost: 500,
        extrinsicPercentOfEntry: 55,
        unrealizedPlPercent: -4,
        ivRankCurrent: 45,
        ivVsHvDiff: 0,
        stockAboveUpperBreakeven: false,
        stockBelowLowerBreakeven: false,
        requiredMovePercent: 5,
        riskLevel: "medium",
      });
      expect(result.recommendation).toBe("HOLD");
      expect(result.reason).toContain("Monitor");
    });
  });

  describe("getStraddleStranglePositions", () => {
    it("returns empty when no accounts", async () => {
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await getStraddleStranglePositions();
      expect(result).toEqual([]);
    });

    it("identifies straddle pairs (call + put same underlying, same expiration, same strike)", async () => {
      const mockAccounts = [
        {
          _id: { toString: () => "acc1" },
          positions: [
            {
              _id: "call1",
              type: "option",
              optionType: "call",
              ticker: "TSLA250117C250",
              strike: 250,
              expiration: "2026-02-20",
              contracts: 1,
              premium: 8,
            },
            {
              _id: "put1",
              type: "option",
              optionType: "put",
              ticker: "TSLA250117P250",
              strike: 250,
              expiration: "2026-02-20",
              contracts: 1,
              premium: 7,
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

      const result = await getStraddleStranglePositions();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        accountId: "acc1",
        symbol: "TSLA",
        callPositionId: "call1",
        putPositionId: "put1",
        callStrike: 250,
        putStrike: 250,
        isStraddle: true,
      });
    });

    it("identifies strangle pairs (call + put different strikes)", async () => {
      const mockAccounts = [
        {
          _id: { toString: () => "acc1" },
          positions: [
            {
              _id: "call1",
              type: "option",
              optionType: "call",
              ticker: "TSLA250117C260",
              strike: 260,
              expiration: "2026-02-20",
              contracts: 1,
              premium: 5,
            },
            {
              _id: "put1",
              type: "option",
              optionType: "put",
              ticker: "TSLA250117P240",
              strike: 240,
              expiration: "2026-02-20",
              contracts: 1,
              premium: 4,
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

      const result = await getStraddleStranglePositions();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        accountId: "acc1",
        symbol: "TSLA",
        callStrike: 260,
        putStrike: 240,
        isStraddle: false,
      });
    });

    it("returns empty when no call+put pairs (only calls)", async () => {
      const mockAccounts = [
        {
          _id: { toString: () => "acc1" },
          positions: [
            {
              _id: "call1",
              type: "option",
              optionType: "call",
              ticker: "TSLA250117C250",
              strike: 250,
              expiration: "2026-02-20",
              contracts: 1,
              premium: 8,
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

      const result = await getStraddleStranglePositions();
      expect(result).toEqual([]);
    });
  });

  describe("analyzeStraddlesAndStrangles", () => {
    it("returns empty when no pairs", async () => {
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([{ _id: {}, positions: [] }]),
          }),
        }),
      } as never);

      const result = await analyzeStraddlesAndStrangles();
      expect(result).toEqual([]);
    });

    it("returns recommendations for straddle/strangle pairs", async () => {
      const validObjectId = "507f1f77bcf86cd799439011";
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockImplementation((name: string) => {
          if (name === "accounts") {
            return {
              find: vi.fn().mockReturnValue({
                toArray: vi.fn().mockResolvedValue([
                  {
                    _id: validObjectId,
                    positions: [
                      {
                        _id: "call1",
                        type: "option",
                        optionType: "call",
                        ticker: "TSLA250117C250",
                        strike: 250,
                        expiration: "2026-02-20",
                        contracts: 1,
                        premium: 8,
                      },
                      {
                        _id: "put1",
                        type: "option",
                        optionType: "put",
                        ticker: "TSLA250117P250",
                        strike: 250,
                        expiration: "2026-02-20",
                        contracts: 1,
                        premium: 7,
                      },
                    ],
                  },
                ]),
              }),
              findOne: vi.fn().mockResolvedValue({
                _id: validObjectId,
                riskLevel: "medium",
              }),
            };
          }
          return { find: vi.fn(), findOne: vi.fn() };
        }),
      } as never);

      vi.mocked(getOptionMetrics).mockResolvedValue({
        price: 4,
        bid: 3.8,
        ask: 4.2,
        underlyingPrice: 255,
        impliedVolatility: 0.28,
        intrinsicValue: 5,
        timeValue: 0.5,
      });
      vi.mocked(getIVRankOrPercentile).mockResolvedValue(45);

      const result = await analyzeStraddlesAndStrangles();
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]).toMatchObject({
        accountId: validObjectId,
        symbol: "TSLA",
        callPositionId: expect.any(String),
        putPositionId: expect.any(String),
        isStraddle: true,
      });
      expect(["HOLD", "SELL_TO_CLOSE", "ROLL", "ADD", "NONE"]).toContain(result[0].recommendation);
      expect(result[0].metrics).toMatchObject({
        stockPrice: 255,
        callBid: 3.8,
        callAsk: 4.2,
        putBid: expect.any(Number),
        putAsk: expect.any(Number),
        dte: expect.any(Number),
        upperBreakeven: expect.any(Number),
        lowerBreakeven: expect.any(Number),
      });
    });
  });

  describe("storeStraddleStrangleRecommendations", () => {
    it("stores recommendations and creates alerts for SELL_TO_CLOSE", async () => {
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
          callPositionId: "call1",
          putPositionId: "put1",
          isStraddle: true,
          recommendation: "SELL_TO_CLOSE" as const,
          confidence: "HIGH" as const,
          reason: "Heavy theta burn",
          metrics: {
            stockPrice: 255,
            callBid: 2,
            callAsk: 2.2,
            putBid: 1.5,
            putAsk: 1.7,
            dte: 8,
            netCurrentValue: 370,
            combinedTheta: -0.5,
            netVega: 0.5,
            upperBreakeven: 265,
            lowerBreakeven: 235,
            requiredMovePercent: 4,
            ivRankCurrent: 25,
            ivVsHvDiff: -5,
            unrealizedPl: -130,
          },
          createdAt: new Date().toISOString(),
        },
      ];

      const { stored, alertsCreated } = await storeStraddleStrangleRecommendations(recommendations, {
        createAlerts: true,
      });

      expect(stored).toBe(1);
      expect(alertsCreated).toBe(1);
      expect(mockInsertOne).toHaveBeenCalledTimes(2);
    });

    it("stores recommendations and creates alerts for ROLL", async () => {
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
          callPositionId: "call1",
          putPositionId: "put1",
          isStraddle: true,
          recommendation: "ROLL" as const,
          confidence: "MEDIUM" as const,
          reason: "Roll to next expiration",
          metrics: {
            stockPrice: 255,
            callBid: 2,
            callAsk: 2.2,
            putBid: 1.5,
            putAsk: 1.7,
            dte: 8,
            netCurrentValue: 350,
            combinedTheta: -0.6,
            netVega: 0.4,
            upperBreakeven: 265,
            lowerBreakeven: 235,
            requiredMovePercent: 4,
            ivRankCurrent: 30,
            ivVsHvDiff: -3,
            unrealizedPl: -150,
          },
          createdAt: new Date().toISOString(),
        },
      ];

      const { stored, alertsCreated } = await storeStraddleStrangleRecommendations(recommendations, {
        createAlerts: true,
      });

      expect(stored).toBe(1);
      expect(alertsCreated).toBe(1);
    });

    it("stores recommendations and creates alerts for ADD", async () => {
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
          callPositionId: "call1",
          putPositionId: "put1",
          isStraddle: true,
          recommendation: "ADD" as const,
          confidence: "MEDIUM" as const,
          reason: "High IV rank, add to position",
          metrics: {
            stockPrice: 255,
            callBid: 4,
            callAsk: 4.2,
            putBid: 3.5,
            putAsk: 3.7,
            dte: 35,
            netCurrentValue: 770,
            combinedTheta: -0.3,
            netVega: 0.6,
            upperBreakeven: 265,
            lowerBreakeven: 235,
            requiredMovePercent: 4,
            ivRankCurrent: 75,
            ivVsHvDiff: 5,
            unrealizedPl: 270,
          },
          createdAt: new Date().toISOString(),
        },
      ];

      const { stored, alertsCreated } = await storeStraddleStrangleRecommendations(recommendations, {
        createAlerts: true,
      });

      expect(stored).toBe(1);
      expect(alertsCreated).toBe(1);
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
          callPositionId: "call1",
          putPositionId: "put1",
          isStraddle: true,
          recommendation: "HOLD" as const,
          confidence: "HIGH" as const,
          reason: "High IV rank",
          metrics: {
            stockPrice: 255,
            callBid: 4,
            callAsk: 4.2,
            putBid: 3.5,
            putAsk: 3.7,
            dte: 35,
            netCurrentValue: 770,
            combinedTheta: -0.3,
            netVega: 0.6,
            upperBreakeven: 265,
            lowerBreakeven: 235,
            requiredMovePercent: 4,
            ivRankCurrent: 75,
            ivVsHvDiff: 5,
            unrealizedPl: 270,
          },
          createdAt: new Date().toISOString(),
        },
      ];

      const { stored, alertsCreated } = await storeStraddleStrangleRecommendations(recommendations, {
        createAlerts: true,
      });

      expect(stored).toBe(1);
      expect(alertsCreated).toBe(0);
      expect(mockInsertOne).toHaveBeenCalledTimes(1);
    });

    it("skips NONE recommendations", async () => {
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
          callPositionId: "call1",
          putPositionId: "put1",
          isStraddle: true,
          recommendation: "NONE" as const,
          confidence: "LOW" as const,
          reason: "Avoid",
          metrics: {
            stockPrice: 255,
            callBid: 2,
            callAsk: 2.2,
            putBid: 1.5,
            putAsk: 1.7,
            dte: 3,
            netCurrentValue: 350,
            combinedTheta: -1,
            netVega: 0.2,
            upperBreakeven: 265,
            lowerBreakeven: 235,
            requiredMovePercent: 4,
            ivRankCurrent: 20,
            ivVsHvDiff: -10,
            unrealizedPl: -150,
          },
          createdAt: new Date().toISOString(),
        },
      ];

      const { stored, alertsCreated } = await storeStraddleStrangleRecommendations(recommendations, {
        createAlerts: true,
      });

      expect(stored).toBe(0);
      expect(alertsCreated).toBe(0);
      expect(mockInsertOne).not.toHaveBeenCalled();
    });
  });
});
