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
const { getOptionMetrics, getOptionChainDetailed, getIVRankOrPercentile } = await import("../yahoo");

/** Assert ProtectivePutRecommendation shape before persistence/alert delivery. */
function expectProtectivePutRecommendationShape(rec: unknown): void {
  expect(rec).toMatchObject({
    symbol: expect.any(String),
    recommendation: expect.stringMatching(/^(HOLD|SELL_TO_CLOSE|ROLL|BUY_NEW_PUT|NONE)$/),
    confidence: expect.stringMatching(/^(HIGH|MEDIUM|LOW)$/),
    reason: expect.any(String),
    metrics: {
      stockPrice: expect.any(Number),
      putBid: expect.any(Number),
      putAsk: expect.any(Number),
      dte: expect.any(Number),
      netProtectionCost: expect.any(Number),
      effectiveFloor: expect.any(Number),
      protectionCostPercent: expect.any(Number),
    },
    createdAt: expect.any(String),
  });
}

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

    // Put far OTM (delta >= -0.25) and stock stable → SELL_TO_CLOSE (ineffective protection)
    it("returns SELL_TO_CLOSE when put far OTM (delta >= -0.25) and stock stable", () => {
      const result = applyProtectivePutRules({
        stockPrice: 448,
        strike: 420,
        dte: 35,
        putBid: 2.5,
        putAsk: 2.8,
        premiumPaid: 12,
        extrinsicPercentOfPremium: 60,
        stockUnrealizedPlPercent: 4,
        moneyness: "OTM",
        putDelta: -0.20,
        ivRank: 40,
        riskLevel: "medium",
        stockAboveBreakeven: true,
      });
      expect(result.recommendation).toBe("SELL_TO_CLOSE");
      expect(result.confidence).toBe("MEDIUM");
      expect(result.reason).toContain("far OTM");
    });

    // Table-driven: TSLA real-world scenarios
    it.each([
      {
        name: "Classic protective put: stock up significantly → SELL_TO_CLOSE",
        metrics: {
          stockPrice: 485,
          strike: 420,
          dte: 45,
          putBid: 3,
          putAsk: 3.2,
          premiumPaid: 15,
          extrinsicPercentOfPremium: 25,
          stockUnrealizedPlPercent: 15,
          moneyness: "OTM" as const,
          putDelta: null as number | null,
          ivRank: 35,
          riskLevel: "medium" as const,
          stockAboveBreakeven: true,
        },
        expected: "SELL_TO_CLOSE",
        reasonContains: "above strike",
      },
      {
        name: "Stock dropped sharply, put deep ITM → HOLD",
        metrics: {
          stockPrice: 385,
          strike: 420,
          dte: 30,
          putBid: 38,
          putAsk: 39,
          premiumPaid: 15,
          extrinsicPercentOfPremium: 20,
          stockUnrealizedPlPercent: -15,
          moneyness: "ITM" as const,
          putDelta: null as number | null,
          ivRank: 45,
          riskLevel: "medium" as const,
          stockAboveBreakeven: false,
        },
        expected: "HOLD",
        reasonContains: "Hedge is working",
      },
      {
        name: "Put near expiration (DTE ≤ 10), still OTM → SELL_TO_CLOSE",
        metrics: {
          stockPrice: 445,
          strike: 420,
          dte: 8,
          putBid: 0.8,
          putAsk: 1,
          premiumPaid: 12,
          extrinsicPercentOfPremium: 20,
          stockUnrealizedPlPercent: 5,
          moneyness: "OTM" as const,
          putDelta: null as number | null,
          ivRank: 30,
          riskLevel: "medium" as const,
          stockAboveBreakeven: true,
        },
        expected: "SELL_TO_CLOSE",
        reasonContains: "OTM",
      },
      {
        name: "Put extrinsic decayed heavily (<10%) → SELL_TO_CLOSE",
        metrics: {
          stockPrice: 410,
          strike: 420,
          dte: 20,
          putBid: 12.5,
          putAsk: 12.8,
          premiumPaid: 14,
          extrinsicPercentOfPremium: 5,
          stockUnrealizedPlPercent: -3,
          moneyness: "ITM" as const,
          putDelta: null as number | null,
          ivRank: 35,
          riskLevel: "medium" as const,
          stockAboveBreakeven: false,
        },
        expected: "SELL_TO_CLOSE",
        reasonContains: "time value",
      },
      {
        name: "High IV spike since purchase → HOLD",
        metrics: {
          stockPrice: 438,
          strike: 430,
          dte: 45,
          putBid: 9,
          putAsk: 9.5,
          premiumPaid: 12,
          extrinsicPercentOfPremium: 70,
          stockUnrealizedPlPercent: 2,
          moneyness: "OTM" as const,
          putDelta: null as number | null,
          ivRank: 65,
          riskLevel: "medium" as const,
          stockAboveBreakeven: true,
        },
        expected: "HOLD",
        reasonContains: "High IV rank",
      },
    ])("$name", ({ metrics, expected, reasonContains }) => {
      const result = applyProtectivePutRules(metrics);
      expect(result.recommendation).toBe(expected);
      expect(result.reason).toContain(reasonContains);
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

    it("returns synthetic opportunity when config.symbol is set (single-stock mode)", async () => {
      const result = await getProtectivePutPositions(undefined, {
        symbol: "TSLA",
        minStockShares: 100,
      });
      expect(result.pairs).toHaveLength(0);
      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0]).toMatchObject({
        accountId: "symbol-mode",
        symbol: "TSLA",
        stockPositionId: "syn-TSLA",
        stockShares: 100,
        stockPurchasePrice: 0,
      });
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

    // Classic protective put: long stock + long OTM put, stock up significantly → SELL_TO_CLOSE
    it("produces SELL_TO_CLOSE for TSLA protective put when stock up significantly", async () => {
      const accId = "507f1f77bcf86cd799439011";
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([
              {
                _id: accId,
                positions: [
                  { _id: "stock1", type: "stock", ticker: "TSLA", shares: 100, purchasePrice: 420 },
                  {
                    _id: "put1",
                    type: "option",
                    optionType: "put",
                    ticker: "TSLA",
                    strike: 420,
                    expiration: "2026-03-20",
                    contracts: 1,
                    premium: 15,
                  },
                ],
              },
            ]),
          }),
          findOne: vi.fn().mockResolvedValue({ _id: accId, riskLevel: "medium" }),
        }),
      } as never);

      vi.mocked(getOptionMetrics).mockResolvedValue({
        price: 3,
        bid: 2.8,
        ask: 3.2,
        underlyingPrice: 485,
        impliedVolatility: 0.35,
        intrinsicValue: 0,
        timeValue: 3,
      });
      vi.mocked(getIVRankOrPercentile).mockResolvedValue(35);

      const result = await analyzeProtectivePuts(accId);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const rec = result[0];
      expectProtectivePutRecommendationShape(rec);
      expect(rec).toMatchObject({
        symbol: "TSLA",
        stockPositionId: "stock1",
        putPositionId: "put1",
        metrics: {
          stockPrice: 485,
          putBid: 2.8,
          putAsk: 3.2,
          netProtectionCost: expect.any(Number),
          effectiveFloor: expect.any(Number),
        },
      });
      expect(rec.recommendation).toBe("SELL_TO_CLOSE");
    });

    // Stock dropped sharply, put now deep ITM → HOLD
    it("produces HOLD for TSLA protective put when stock dropped and put ITM", async () => {
      const accId = "507f1f77bcf86cd799439012";
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([
              {
                _id: accId,
                positions: [
                  { _id: "stock1", type: "stock", ticker: "TSLA", shares: 100, purchasePrice: 440 },
                  {
                    _id: "put1",
                    type: "option",
                    optionType: "put",
                    ticker: "TSLA",
                    strike: 420,
                    expiration: "2026-03-20",
                    contracts: 1,
                    premium: 15,
                  },
                ],
              },
            ]),
          }),
          findOne: vi.fn().mockResolvedValue({ _id: accId, riskLevel: "medium" }),
        }),
      } as never);

      vi.mocked(getOptionMetrics).mockResolvedValue({
        price: 38,
        bid: 37.5,
        ask: 38.5,
        underlyingPrice: 385,
        impliedVolatility: 0.45,
        intrinsicValue: 35,
        timeValue: 3,
      });
      vi.mocked(getIVRankOrPercentile).mockResolvedValue(45);

      const result = await analyzeProtectivePuts(accId);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const rec = result[0];
      expectProtectivePutRecommendationShape(rec);
      expect(rec.recommendation).toBe("HOLD");
      expect(rec.reason).toContain("Hedge is working");
    });

    // No put position but very volatile stock → BUY_NEW_PUT opportunity
    it("produces BUY_NEW_PUT for stock-only opportunity when volatility high", async () => {
      const accId = "507f1f77bcf86cd799439013";
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([
              {
                _id: accId,
                positions: [
                  { _id: "stock1", type: "stock", ticker: "TSLA", shares: 100, purchasePrice: 430 },
                ],
              },
            ]),
          }),
        }),
      } as never);

      vi.mocked(getOptionChainDetailed).mockResolvedValue({
        stock: { price: 442 },
        calls: [],
        puts: [
          { strike: 420, bid: 8.5, ask: 8.8, impliedVolatility: 0.52 },
          { strike: 430, bid: 10, ask: 10.5, impliedVolatility: 0.48 },
        ],
      });

      const result = await analyzeProtectivePuts(accId);

      expect(result.length).toBe(1);
      const rec = result[0];
      expectProtectivePutRecommendationShape(rec);
      expect(rec).toMatchObject({
        symbol: "TSLA",
        recommendation: "BUY_NEW_PUT",
        confidence: "MEDIUM",
        stockPositionId: "stock1",
        reason: expect.stringContaining("no protective put"),
        metrics: {
          stockPrice: 442,
          putBid: 0,
          putAsk: 0,
          dte: 0,
          netProtectionCost: 0,
          effectiveFloor: 0,
        },
      });
    });

    it("produces BUY_NEW_PUT for single-stock mode (config.symbol) when volatility high", async () => {
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
        }),
      } as never);
      vi.mocked(getOptionChainDetailed).mockResolvedValue({
        stock: { price: 442 },
        calls: [],
        puts: [
          { strike: 420, bid: 8.5, ask: 8.8, impliedVolatility: 0.52 },
          { strike: 430, bid: 10, ask: 10.5, impliedVolatility: 0.48 },
        ],
      });

      const result = await analyzeProtectivePuts(undefined, { symbol: "TSLA" });

      expect(result.length).toBe(1);
      const rec = result[0];
      expectProtectivePutRecommendationShape(rec);
      expect(rec).toMatchObject({
        symbol: "TSLA",
        accountId: "symbol-mode",
        recommendation: "BUY_NEW_PUT",
        stockPositionId: "syn-TSLA",
      });
    });

    // Expired / worthless put → no recommendation (getOptionMetrics returns null)
    it("skips position when getOptionMetrics returns null (expired put)", async () => {
      const accId = "507f1f77bcf86cd799439014";
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([
              {
                _id: accId,
                positions: [
                  { _id: "stock1", type: "stock", ticker: "TSLA", shares: 100, purchasePrice: 430 },
                  {
                    _id: "put1",
                    type: "option",
                    optionType: "put",
                    ticker: "TSLA",
                    strike: 400,
                    expiration: "2024-01-15",
                    contracts: 1,
                    premium: 5,
                  },
                ],
              },
            ]),
          }),
          findOne: vi.fn().mockResolvedValue({ _id: accId, riskLevel: "medium" }),
        }),
      } as never);

      vi.mocked(getOptionMetrics).mockResolvedValue(null);

      const result = await analyzeProtectivePuts(accId);

      expect(result).toHaveLength(0);
    });

    // Assert full recommendation shape before persistence
    it("produces recommendation with full ProtectivePutRecommendation shape for TSLA pair", async () => {
      const accId = "507f1f77bcf86cd799439015";
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([
              {
                _id: accId,
                positions: [
                  { _id: "stock1", type: "stock", ticker: "TSLA", shares: 100, purchasePrice: 430 },
                  {
                    _id: "put1",
                    type: "option",
                    optionType: "put",
                    ticker: "TSLA",
                    strike: 420,
                    expiration: "2026-03-20",
                    contracts: 1,
                    premium: 15,
                  },
                ],
              },
            ]),
          }),
          findOne: vi.fn().mockResolvedValue({ _id: accId, riskLevel: "medium" }),
        }),
      } as never);

      vi.mocked(getOptionMetrics).mockResolvedValue({
        price: 8,
        bid: 7.8,
        ask: 8.2,
        underlyingPrice: 442,
        impliedVolatility: 0.45,
        intrinsicValue: 0,
        timeValue: 8,
      });
      vi.mocked(getIVRankOrPercentile).mockResolvedValue(50);

      const result = await analyzeProtectivePuts(accId);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const rec = result[0];
      expectProtectivePutRecommendationShape(rec);
      expect(rec).toMatchObject({
        symbol: "TSLA",
        stockPositionId: "stock1",
        putPositionId: "put1",
        metrics: {
          stockPrice: 442,
          putBid: 7.8,
          putAsk: 8.2,
          netProtectionCost: expect.any(Number),
          effectiveFloor: expect.any(Number),
          protectionCostPercent: expect.any(Number),
          extrinsicPercentOfPremium: expect.any(Number),
        },
      });
      expect(["HOLD", "SELL_TO_CLOSE", "ROLL"]).toContain(rec.recommendation);
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
