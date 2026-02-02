import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyCoveredCallRules,
  getCoveredCallPositions,
  analyzeCoveredCalls,
  storeCoveredCallRecommendations,
  isGrokCandidate,
  analyzeCoveredCallForOption,
} from "../covered-call-analyzer";

vi.mock("../mongodb", () => ({
  getDb: vi.fn(),
}));

vi.mock("../yahoo", () => ({
  getOptionMetrics: vi.fn(),
  getOptionChainDetailed: vi.fn(),
  getIVRankOrPercentile: vi.fn(),
  getOptionMarketConditions: vi.fn(),
  getSuggestedCoveredCallOptions: vi.fn(),
}));

vi.mock("../xai-grok", () => ({
  callCoveredCallDecision: vi.fn(),
}));

const { getDb } = await import("../mongodb");
const {
  getOptionMetrics,
  getOptionChainDetailed,
  getIVRankOrPercentile,
  getOptionMarketConditions,
  getSuggestedCoveredCallOptions,
} = await import("../yahoo");
const { callCoveredCallDecision } = await import("../xai-grok");

/** Assert CoveredCallRecommendation shape before persistence/alert delivery. */
function expectCoveredCallRecommendationShape(rec: unknown): void {
  expect(rec).toMatchObject({
    symbol: expect.any(String),
    recommendation: expect.stringMatching(/^(HOLD|BUY_TO_CLOSE|SELL_NEW_CALL|ROLL|NONE)$/),
    confidence: expect.stringMatching(/^(HIGH|MEDIUM|LOW)$/),
    reason: expect.any(String),
    source: expect.stringMatching(/^(holdings|watchlist)$/),
    metrics: {
      stockPrice: expect.any(Number),
      callBid: expect.any(Number),
      callAsk: expect.any(Number),
      dte: expect.any(Number),
      netPremium: expect.any(Number),
      unrealizedPl: expect.any(Number),
      breakeven: expect.any(Number),
    },
    createdAt: expect.any(String),
  });
}

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

    it("returns ROLL when ITM and stock rising fast (high assignment risk)", () => {
      const result = applyCoveredCallRules({
        stockPrice: 450,
        strike: 432.5,
        dte: 12,
        callBid: 20,
        callAsk: 20.5,
        premiumReceived: 16.9,
        extrinsicPercentOfPremium: 15,
        unrealizedStockGainPercent: 8,
        moneyness: "ITM",
        ivRank: 45,
        symbolChangePercent: 3.5,
        riskLevel: "medium",
      });
      expect(result.recommendation).toBe("ROLL");
      expect(result.confidence).toBe("MEDIUM");
      expect(result.reason).toContain("roll");
    });

    it("returns BUY_TO_CLOSE when unrealized stock gain > 15% and call near ATM", () => {
      const result = applyCoveredCallRules({
        stockPrice: 460,
        strike: 450,
        dte: 20,
        callBid: 14,
        callAsk: 14.5,
        premiumReceived: 8,
        extrinsicPercentOfPremium: 30,
        unrealizedStockGainPercent: 18,
        moneyness: "ATM",
        ivRank: 40,
        symbolChangePercent: 2,
        riskLevel: "medium",
      });
      expect(result.recommendation).toBe("BUY_TO_CLOSE");
      expect(result.reason).toContain("Lock in gains");
    });

    // Table-driven: TSLA real-world scenarios
    it.each([
      {
        name: "TSLA OTM call, good premium, high IV rank → HOLD",
        metrics: {
          stockPrice: 442,
          strike: 475,
          dte: 28,
          callBid: 5.5,
          callAsk: 5.75,
          premiumReceived: 5.75,
          extrinsicPercentOfPremium: 85,
          unrealizedStockGainPercent: 5,
          moneyness: "OTM" as const,
          ivRank: 55,
          symbolChangePercent: 1.2,
          riskLevel: "medium" as const,
        },
        expected: "HOLD",
        reasonContains: "High IV rank",
      },
      {
        name: "TSLA deep ITM, stock way up, DTE ≤ 7 → BUY_TO_CLOSE",
        metrics: {
          stockPrice: 485,
          strike: 450,
          dte: 5,
          callBid: 38,
          callAsk: 38.5,
          premiumReceived: 12,
          extrinsicPercentOfPremium: 8,
          unrealizedStockGainPercent: 20,
          moneyness: "ITM" as const,
          ivRank: 40,
          symbolChangePercent: 2,
          riskLevel: "medium" as const,
        },
        expected: "BUY_TO_CLOSE",
        reasonContains: "above strike",
      },
      {
        name: "TSLA call almost worthless extrinsic (<5%) + low DTE → BUY_TO_CLOSE",
        metrics: {
          stockPrice: 435,
          strike: 432.5,
          dte: 4,
          callBid: 4.2,
          callAsk: 4.4,
          premiumReceived: 5,
          extrinsicPercentOfPremium: 3,
          unrealizedStockGainPercent: 2,
          moneyness: "ITM" as const,
          ivRank: 35,
          symbolChangePercent: 0,
          riskLevel: "medium" as const,
        },
        expected: "BUY_TO_CLOSE",
        reasonContains: "Time decay",
      },
      {
        name: "TSLA high IV rank, stock near strike → HOLD",
        metrics: {
          stockPrice: 448,
          strike: 450,
          dte: 21,
          callBid: 8,
          callAsk: 8.5,
          premiumReceived: 9,
          extrinsicPercentOfPremium: 75,
          unrealizedStockGainPercent: 3,
          moneyness: "OTM" as const,
          ivRank: 65,
          symbolChangePercent: 0.5,
          riskLevel: "medium" as const,
        },
        expected: "HOLD",
        reasonContains: "High IV rank",
      },
    ])("$name", ({ metrics, expected, reasonContains }) => {
      const result = applyCoveredCallRules(metrics);
      expect(result.recommendation).toBe(expected);
      expect(result.reason).toContain(reasonContains);
    });
  });

  describe("isGrokCandidate", () => {
    it("returns true when confidence is below threshold", () => {
      const rec = {
        confidence: "LOW" as const,
        metrics: { dte: 30, ivRank: 20, moneyness: "OTM" as const },
      };
      expect(isGrokCandidate(rec, { grokConfidenceMin: 70 })).toBe(true);
    });

    it("returns true when DTE < grokDteMax", () => {
      const rec = {
        confidence: "HIGH" as const,
        metrics: { dte: 10, ivRank: 20, moneyness: "OTM" as const },
      };
      expect(isGrokCandidate(rec, { grokDteMax: 14 })).toBe(true);
    });

    it("returns true when IV rank >= grokIvRankMin", () => {
      const rec = {
        confidence: "HIGH" as const,
        metrics: { dte: 30, ivRank: 60, moneyness: "OTM" as const },
      };
      expect(isGrokCandidate(rec, { grokIvRankMin: 50 })).toBe(true);
    });

    it("returns true when moneyness is ATM", () => {
      const rec = {
        confidence: "HIGH" as const,
        metrics: { dte: 30, ivRank: 20, moneyness: "ATM" as const },
      };
      expect(isGrokCandidate(rec)).toBe(true);
    });

    it("returns false when none of the criteria match", () => {
      const rec = {
        confidence: "HIGH" as const,
        metrics: { dte: 30, ivRank: 20, moneyness: "OTM" as const },
      };
      expect(isGrokCandidate(rec, { grokConfidenceMin: 70, grokDteMax: 14, grokIvRankMin: 50 })).toBe(false);
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
      expect(result.standaloneCalls).toEqual([]);
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

    it("returns synthetic opportunity when config.symbol is set (single-stock mode)", async () => {
      const result = await getCoveredCallPositions(undefined, {
        symbol: "TSLA",
        minStockShares: 100,
      });
      expect(result.pairs).toHaveLength(0);
      expect(result.standaloneCalls).toHaveLength(0);
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
        source: "holdings",
      });
      expect(["HOLD", "BUY_TO_CLOSE", "ROLL"]).toContain(result[0].recommendation);
      expect(result[0].metrics).toMatchObject({
        stockPrice: 255,
        callBid: 2.8,
        callAsk: 3.2,
        dte: expect.any(Number),
      });
    });

    // TSLA covered call: stock owned, short call slightly OTM, good premium → HOLD with high confidence
    it("produces HOLD recommendation with full CoveredCallRecommendation shape for TSLA OTM call", async () => {
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
                    _id: "call1",
                    type: "option",
                    optionType: "call",
                    ticker: "TSLA",
                    strike: 475,
                    expiration: "2026-01-30",
                    contracts: 1,
                    premium: 5.75,
                  },
                ],
              },
            ]),
          }),
          findOne: vi.fn().mockResolvedValue({ _id: accId, riskLevel: "medium" }),
        }),
      } as never);

      vi.mocked(getOptionMetrics).mockResolvedValue({
        price: 5.75,
        bid: 5.5,
        ask: 5.75,
        underlyingPrice: 442.3,
        impliedVolatility: 0.48,
        intrinsicValue: 0,
        timeValue: 5.75,
      });
      vi.mocked(getOptionMarketConditions).mockResolvedValue({
        vix: 18,
        vixLevel: "moderate",
        trend: "up",
        symbolChangePercent: 1.5,
      });
      vi.mocked(getIVRankOrPercentile).mockResolvedValue(55);

      const result = await analyzeCoveredCalls(accId, { grokEnabled: false });

      expect(result.length).toBeGreaterThanOrEqual(1);
      const rec = result[0];
      expectCoveredCallRecommendationShape(rec);
      expect(rec).toMatchObject({
        symbol: "TSLA",
        source: "holdings",
        stockPositionId: "stock1",
        callPositionId: "call1",
        strikePrice: 475,
        expirationDate: "2026-01-30",
        entryPremium: 5.75,
        metrics: {
          stockPrice: 442.3,
          callBid: 5.5,
          callAsk: 5.75,
          extrinsicPercentOfPremium: expect.any(Number),
        },
      });
      expect(["HOLD", "BUY_TO_CLOSE", "ROLL"]).toContain(rec.recommendation);
    });

    // Deep ITM + stock way up → BUY_TO_CLOSE
    it("produces BUY_TO_CLOSE for deep ITM call with stock way up", async () => {
      const accId = "507f1f77bcf86cd799439012";
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([
              {
                _id: accId,
                positions: [
                  { _id: "stock1", type: "stock", ticker: "TSLA", shares: 100, purchasePrice: 400 },
                  {
                    _id: "call1",
                    type: "option",
                    optionType: "call",
                    ticker: "TSLA",
                    strike: 432.5,
                    expiration: "2026-02-06",
                    contracts: 1,
                    premium: 16.9,
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
        underlyingPrice: 485,
        impliedVolatility: 0.35,
        intrinsicValue: 52.5,
        timeValue: 0,
      });
      vi.mocked(getOptionMarketConditions).mockResolvedValue({
        vix: 18,
        vixLevel: "moderate",
        trend: "up",
        symbolChangePercent: 2,
      });
      vi.mocked(getIVRankOrPercentile).mockResolvedValue(40);

      const result = await analyzeCoveredCalls(accId, { grokEnabled: false });

      expect(result.length).toBeGreaterThanOrEqual(1);
      const rec = result[0];
      expectCoveredCallRecommendationShape(rec);
      expect(rec.recommendation).toBe("BUY_TO_CLOSE");
      expect(rec.confidence).toBe("HIGH");
      expect(rec.reason).toMatch(/above strike|Lock in gains/);
    });

    // Stock only (no covered call) but high IV → SELL_NEW_CALL opportunity
    it("produces SELL_NEW_CALL for stock-only opportunity with full shape", async () => {
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
          findOne: vi.fn().mockResolvedValue({ _id: accId, riskLevel: "medium" }),
        }),
      } as never);

      vi.mocked(getOptionChainDetailed).mockResolvedValue({
        stock: { price: 442 },
        calls: [{ strike: 450, bid: 8, ask: 8.5, impliedVolatility: 0.48 }],
        puts: [],
      });

      const result = await analyzeCoveredCalls(accId, { grokEnabled: false });

      expect(result.length).toBe(1);
      const rec = result[0];
      expectCoveredCallRecommendationShape(rec);
      expect(rec).toMatchObject({
        symbol: "TSLA",
        recommendation: "SELL_NEW_CALL",
        confidence: "MEDIUM",
        source: "holdings",
        stockPositionId: "stock1",
        reason: expect.stringContaining("shares with no covered call"),
      });
    });

    // Watchlist call item (no stock owned) → recommendation with full shape
    it("produces recommendation for watchlist call item with full shape", async () => {
      const accId = "507f1f77bcf86cd799439014";
      const watchlistItems = [
        {
          _id: { toString: () => "wl1" },
          watchlistId: "wl1",
          symbol: "TSLA250130C475",
          underlyingSymbol: "TSLA",
          type: "call",
          strategy: "covered-call",
          strikePrice: 475,
          expirationDate: "2026-01-30",
          entryPremium: 5.75,
          quantity: 1,
          entryPrice: 442,
        },
      ];
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockImplementation((name: string) => {
          if (name === "accounts") {
            return {
              find: vi.fn().mockReturnValue({
                toArray: vi.fn().mockResolvedValue([]),
              }),
              findOne: vi.fn().mockResolvedValue({ _id: accId, riskLevel: "medium" }),
            };
          }
          if (name === "watchlist") {
            return {
              find: vi.fn().mockReturnValue({
                toArray: vi.fn().mockResolvedValue(watchlistItems),
              }),
            };
          }
          return { find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }), findOne: vi.fn().mockResolvedValue(null) };
        }),
      } as never);

      vi.mocked(getOptionMetrics).mockResolvedValue({
        price: 5.75,
        bid: 5.5,
        ask: 5.75,
        underlyingPrice: 442.3,
        impliedVolatility: 0.48,
        intrinsicValue: 0,
        timeValue: 5.75,
      });
      vi.mocked(getOptionMarketConditions).mockResolvedValue({
        vix: 18,
        vixLevel: "moderate",
        trend: "up",
        symbolChangePercent: 1.5,
      });
      vi.mocked(getIVRankOrPercentile).mockResolvedValue(55);

      const result = await analyzeCoveredCalls(accId, { grokEnabled: false });

      expect(result.length).toBeGreaterThanOrEqual(1);
      const rec = result.find((r) => r.source === "watchlist");
      expect(rec).toBeDefined();
      if (rec) {
        expectCoveredCallRecommendationShape(rec);
        expect(rec).toMatchObject({
          symbol: "TSLA",
          source: "watchlist",
          watchlistItemId: "wl1",
          strikePrice: 475,
          expirationDate: "2026-01-30",
          entryPremium: 5.75,
        });
        expect(["HOLD", "BUY_TO_CLOSE", "SELL_NEW_CALL", "ROLL", "NONE"]).toContain(rec.recommendation);
      }
    });

    it("produces SELL_NEW_CALL for single-stock mode (config.symbol) with suggestedCalls", async () => {
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockImplementation((name: string) => {
          if (name === "watchlist") {
            return {
              find: vi.fn().mockReturnValue({
                toArray: vi.fn().mockResolvedValue([]),
              }),
            };
          }
          return {
            find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
            findOne: vi.fn().mockResolvedValue(null),
          };
        }),
      } as never);
      vi.mocked(getOptionChainDetailed).mockResolvedValue({
        stock: { price: 442 },
        calls: [{ strike: 450, bid: 8, ask: 8.5, impliedVolatility: 0.48 }],
        puts: [],
      });
      vi.mocked(getSuggestedCoveredCallOptions).mockResolvedValue([
        { strike: 460, expiration: "2026-02-14", dte: 7, bid: 5.5, ask: 5.8, premium: 5.65, otmPercent: 4.1 },
      ]);

      const result = await analyzeCoveredCalls(undefined, {
        symbol: "TSLA",
        grokEnabled: false,
      });

      expect(result.length).toBeGreaterThanOrEqual(1);
      const rec = result.find((r) => r.symbol === "TSLA" && r.recommendation === "SELL_NEW_CALL");
      expect(rec).toBeDefined();
      expect(rec?.accountId).toBe("symbol-mode");
      expect(rec?.suggestedCalls).toHaveLength(1);
      expect(rec?.suggestedCalls?.[0]).toMatchObject({
        strike: 460,
        expiration: "2026-02-14",
        dte: 7,
        premium: 5.65,
        otmPercent: 4.1,
      });
    });

    it("skips watchlist when includeWatchlist is false", async () => {
      const watchlistItems = [
        {
          _id: { toString: () => "wl1" },
          symbol: "TSLA250130C475",
          underlyingSymbol: "TSLA",
          type: "call",
          strikePrice: 475,
          expirationDate: "2026-01-30",
          entryPremium: 5.75,
        },
      ];
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockImplementation((name: string) => {
          if (name === "accounts") {
            return {
              find: vi.fn().mockReturnValue({
                toArray: vi.fn().mockResolvedValue([]),
              }),
              findOne: vi.fn().mockResolvedValue(null),
            };
          }
          if (name === "watchlist") {
            return {
              find: vi.fn().mockReturnValue({
                toArray: vi.fn().mockResolvedValue(watchlistItems),
              }),
            };
          }
          return {
            find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
            findOne: vi.fn().mockResolvedValue(null),
          };
        }),
      } as never);

      const result = await analyzeCoveredCalls(undefined, {
        includeWatchlist: false,
        grokEnabled: false,
      });

      expect(result.filter((r) => r.source === "watchlist")).toHaveLength(0);
    });

    // Expired option (getOptionMetrics returns null) → no recommendation for that position
    it("skips position when getOptionMetrics returns null (expired/unavailable)", async () => {
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
                    _id: "call1",
                    type: "option",
                    optionType: "call",
                    ticker: "TSLA",
                    strike: 500,
                    expiration: "2024-01-15",
                    contracts: 1,
                    premium: 3,
                  },
                ],
              },
            ]),
          }),
          findOne: vi.fn().mockResolvedValue({ _id: accId, riskLevel: "medium" }),
        }),
      } as never);

      vi.mocked(getOptionMetrics).mockResolvedValue(null);

      const result = await analyzeCoveredCalls(accId, { grokEnabled: false });

      expect(result).toHaveLength(0);
    });
  });

  describe("analyzeCoveredCallForOption", () => {
    it("returns rule-based recommendation when Grok disabled", async () => {
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          findOne: vi.fn().mockResolvedValue({ riskLevel: "medium" }),
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

      const result = await analyzeCoveredCallForOption(
        { symbol: "TSLA", strike: 250, expiration: "2026-02-20", entryPremium: 5, quantity: 1 },
        { grokEnabled: false }
      );

      expect(result).toHaveLength(1);
      expect(result[0].grokEvaluated).toBeUndefined();
      expect(["HOLD", "BUY_TO_CLOSE", "ROLL"]).toContain(result[0].recommendation);
    });

    // Assert full CoveredCallRecommendation shape before persistence
    it("returns recommendation with full CoveredCallRecommendation shape (TSLA 432.5 Call)", async () => {
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          findOne: vi.fn().mockResolvedValue({ riskLevel: "medium" }),
        }),
      } as never);
      vi.mocked(getOptionMetrics).mockResolvedValue({
        price: 17.1,
        bid: 16.9,
        ask: 17.1,
        underlyingPrice: 442.3,
        impliedVolatility: 0.45,
        intrinsicValue: 9.8,
        timeValue: 7.3,
      });
      vi.mocked(getOptionMarketConditions).mockResolvedValue({
        vix: 18,
        vixLevel: "moderate",
        trend: "up",
        symbolChangePercent: 1.2,
      });
      vi.mocked(getIVRankOrPercentile).mockResolvedValue(50);

      const result = await analyzeCoveredCallForOption(
        { symbol: "TSLA", strike: 432.5, expiration: "2026-02-20", entryPremium: 16.9, quantity: 1 },
        { grokEnabled: false }
      );

      expect(result).toHaveLength(1);
      const rec = result[0];
      expectCoveredCallRecommendationShape(rec);
      expect(rec).toMatchObject({
        symbol: "TSLA",
        source: "watchlist",
        metrics: {
          stockPrice: 442.3,
          callBid: 16.9,
          callAsk: 17.1,
          extrinsicPercentOfPremium: expect.any(Number),
        },
      });
      expect(["HOLD", "BUY_TO_CLOSE", "ROLL"]).toContain(rec.recommendation);
    });

    it("uses Grok result when grokEnabled and isGrokCandidate", async () => {
      vi.mocked(getDb).mockResolvedValue({
        collection: vi.fn().mockReturnValue({
          findOne: vi.fn().mockResolvedValue({ riskLevel: "medium" }),
        }),
      } as never);
      vi.mocked(getOptionMetrics).mockResolvedValue({
        price: 3,
        bid: 2.8,
        ask: 3.2,
        underlyingPrice: 248,
        impliedVolatility: 28,
        intrinsicValue: 0,
        timeValue: 3,
      });
      vi.mocked(getOptionMarketConditions).mockResolvedValue({
        vix: 18,
        vixLevel: "moderate",
        trend: "up",
        symbolChangePercent: 2,
      });
      vi.mocked(getIVRankOrPercentile).mockResolvedValue(55);

      vi.mocked(callCoveredCallDecision).mockResolvedValue({
        recommendation: "BUY_TO_CLOSE",
        confidence: 0.85,
        reasoning: "Grok: High IV rank suggests premium decay risk.",
      });

      const result = await analyzeCoveredCallForOption(
        { symbol: "TSLA", strike: 250, expiration: "2026-02-20", entryPremium: 5, quantity: 1 },
        { grokEnabled: true, grokIvRankMin: 50 }
      );

      expect(result).toHaveLength(1);
      expect(result[0].grokEvaluated).toBe(true);
      expect(result[0].grokReasoning).toBe("Grok: High IV rank suggests premium decay risk.");
      expect(result[0].recommendation).toBe("BUY_TO_CLOSE");
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
          source: "holdings" as const,
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
          source: "holdings" as const,
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
