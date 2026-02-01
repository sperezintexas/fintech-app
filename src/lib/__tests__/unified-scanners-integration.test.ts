/**
 * Integration-style test: exercises all four option analyzers in sequence
 * (like runUnifiedOptionsScanner) with mocked Yahoo Finance and MongoDB.
 *
 * - Mocks Yahoo Finance calls
 * - Provides fake TSLA position data
 * - Calls each analyzer function directly
 * - Verifies shape and plausible values of recommendations (ready for storage/alerts)
 * - Ensures no crashes and output is in expected format
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { scanOptions } from "../option-scanner";
import { analyzeCoveredCalls } from "../covered-call-analyzer";
import { analyzeProtectivePuts } from "../protective-put-analyzer";
import { analyzeStraddlesAndStrangles } from "../straddle-strangle-analyzer";
import { clearMarketCache } from "../option-scanner";

vi.mock("../mongodb", () => ({
  getDb: vi.fn(),
}));

vi.mock("../yahoo", () => ({
  getOptionMetrics: vi.fn(),
  getOptionChainDetailed: vi.fn(),
  getIVRankOrPercentile: vi.fn(),
  getOptionMarketConditions: vi.fn(),
}));

vi.mock("../xai-grok", () => ({
  callOptionDecision: vi.fn(),
  callCoveredCallDecision: vi.fn(),
}));

const { getDb } = await import("../mongodb");
const {
  getOptionMetrics,
  getOptionChainDetailed,
  getIVRankOrPercentile,
  getOptionMarketConditions,
} = await import("../yahoo");

/** TSLA-rich account: stock, covered call pair, protective put pair, straddle pair */
const ACC_ID = "507f1f77bcf86cd799439011";
const MOCK_ACCOUNTS = [
  {
    _id: new ObjectId(ACC_ID),
    positions: [
      { _id: "stock1", type: "stock", ticker: "TSLA", shares: 100, purchasePrice: 430 },
      {
        _id: "call1",
        type: "option",
        optionType: "call",
        ticker: "TSLA",
        strike: 475,
        expiration: "2026-02-20",
        contracts: 1,
        premium: 5.75,
      },
      {
        _id: "put1",
        type: "option",
        optionType: "put",
        ticker: "TSLA",
        strike: 420,
        expiration: "2026-02-20",
        contracts: 1,
        premium: 15,
      },
      {
        _id: "call2",
        type: "option",
        optionType: "call",
        ticker: "TSLA",
        strike: 450,
        expiration: "2026-03-20",
        contracts: 1,
        premium: 12,
      },
      {
        _id: "put2",
        type: "option",
        optionType: "put",
        ticker: "TSLA",
        strike: 450,
        expiration: "2026-03-20",
        contracts: 1,
        premium: 10,
      },
    ],
    riskLevel: "medium",
  },
];

/** Default option metrics for TSLA (stock ~$442) */
const DEFAULT_OPTION_METRICS = {
  price: 5,
  bid: 4.8,
  ask: 5.2,
  underlyingPrice: 442,
  impliedVolatility: 0.45,
  intrinsicValue: 0,
  timeValue: 5,
};

function createMockDb() {
  return {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name === "accounts") {
        return {
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(MOCK_ACCOUNTS),
          }),
          findOne: vi.fn().mockResolvedValue(MOCK_ACCOUNTS[0]),
        };
      }
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
  };
}

function setupMocks() {
  vi.mocked(getDb).mockResolvedValue(createMockDb() as never);
  vi.mocked(getOptionMetrics).mockResolvedValue({ ...DEFAULT_OPTION_METRICS });
  vi.mocked(getOptionChainDetailed).mockResolvedValue({
    stock: { price: 442 },
    calls: [{ strike: 475, bid: 5.5, ask: 5.75, impliedVolatility: 0.48 }],
    puts: [
      { strike: 420, bid: 8, ask: 8.5, impliedVolatility: 0.52 },
      { strike: 450, bid: 10, ask: 10.5, impliedVolatility: 0.48 },
    ],
  });
  vi.mocked(getIVRankOrPercentile).mockResolvedValue(50);
  vi.mocked(getOptionMarketConditions).mockResolvedValue({
    vix: 18,
    vixLevel: "moderate",
    trend: "up",
    symbolChangePercent: 1.5,
  });
}

describe("Unified Scanners Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMarketCache();
    setupMocks();
  });

  it("runs all four analyzers in sequence without crashing", async () => {
    const optionRecs = await scanOptions(ACC_ID, { grokEnabled: false });
    const coveredCallRecs = await analyzeCoveredCalls(ACC_ID, { grokEnabled: false });
    const protectivePutRecs = await analyzeProtectivePuts(ACC_ID);
    const straddleRecs = await analyzeStraddlesAndStrangles(ACC_ID);

    expect(optionRecs).toBeDefined();
    expect(Array.isArray(optionRecs)).toBe(true);
    expect(coveredCallRecs).toBeDefined();
    expect(Array.isArray(coveredCallRecs)).toBe(true);
    expect(protectivePutRecs).toBeDefined();
    expect(Array.isArray(protectivePutRecs)).toBe(true);
    expect(straddleRecs).toBeDefined();
    expect(Array.isArray(straddleRecs)).toBe(true);
  });

  it("Option Scanner: returns recommendations with expected shape", async () => {
    vi.mocked(getOptionMetrics).mockImplementation((symbol, _exp, strike, optionType) => {
      const base = { ...DEFAULT_OPTION_METRICS };
      if (optionType === "call") base.intrinsicValue = strike < 442 ? 442 - strike : 0;
      if (optionType === "put") base.intrinsicValue = strike > 442 ? strike - 442 : 0;
      return Promise.resolve(base);
    });

    const recs = await scanOptions(ACC_ID, { grokEnabled: false });

    expect(recs.length).toBeGreaterThanOrEqual(1);
    for (const rec of recs) {
      expect(rec).toMatchObject({
        positionId: expect.any(String),
        accountId: ACC_ID,
        symbol: expect.any(String),
        strike: expect.any(Number),
        expiration: expect.any(String),
        optionType: expect.stringMatching(/^(call|put)$/),
        recommendation: expect.stringMatching(/^(HOLD|BUY_TO_CLOSE)$/),
        reason: expect.any(String),
      });
      expect(rec.metrics).toBeDefined();
      expect(rec.metrics).toMatchObject({
        underlyingPrice: expect.any(Number),
        dte: expect.any(Number),
        plPercent: expect.any(Number),
      });
    }
  });

  it("Covered Call Analyzer: returns recommendations with expected shape", async () => {
    const recs = await analyzeCoveredCalls(ACC_ID, { grokEnabled: false });

    expect(recs.length).toBeGreaterThanOrEqual(1);
    for (const rec of recs) {
      expect(rec).toMatchObject({
        accountId: expect.any(String),
        symbol: "TSLA",
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
  });

  it("Protective Put Analyzer: returns recommendations with expected shape", async () => {
    const recs = await analyzeProtectivePuts(ACC_ID);

    expect(recs.length).toBeGreaterThanOrEqual(1);
    for (const rec of recs) {
      expect(rec).toMatchObject({
        accountId: expect.any(String),
        symbol: "TSLA",
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
  });

  it("Straddle/Strangle Analyzer: returns recommendations with expected shape", async () => {
    const recs = await analyzeStraddlesAndStrangles(ACC_ID);

    expect(recs.length).toBeGreaterThanOrEqual(1);
    for (const rec of recs) {
      expect(rec).toMatchObject({
        accountId: expect.any(String),
        symbol: "TSLA",
        isStraddle: expect.any(Boolean),
        recommendation: expect.stringMatching(/^(HOLD|SELL_TO_CLOSE|ROLL|ADD|NONE)$/),
        confidence: expect.stringMatching(/^(HIGH|MEDIUM|LOW)$/),
        reason: expect.any(String),
        metrics: {
          stockPrice: expect.any(Number),
          callBid: expect.any(Number),
          callAsk: expect.any(Number),
          putBid: expect.any(Number),
          putAsk: expect.any(Number),
          dte: expect.any(Number),
          netCurrentValue: expect.any(Number),
          unrealizedPl: expect.any(Number),
        },
        createdAt: expect.any(String),
      });
    }
  });

  it("all recommendations are ready for storage/alerts (no undefined required fields)", async () => {
    const optionRecs = await scanOptions(ACC_ID, { grokEnabled: false });
    const coveredCallRecs = await analyzeCoveredCalls(ACC_ID, { grokEnabled: false });
    const protectivePutRecs = await analyzeProtectivePuts(ACC_ID);
    const straddleRecs = await analyzeStraddlesAndStrangles(ACC_ID);

    const allRecs = [
      ...optionRecs.map((r) => ({ type: "option", rec: r })),
      ...coveredCallRecs.map((r) => ({ type: "coveredCall", rec: r })),
      ...protectivePutRecs.map((r) => ({ type: "protectivePut", rec: r })),
      ...straddleRecs.map((r) => ({ type: "straddleStrangle", rec: r })),
    ];

    for (const { type, rec } of allRecs) {
      expect(rec, `${type} recommendation`).toBeDefined();
      expect(rec.symbol, `${type} symbol`).toBeDefined();
      expect(rec.recommendation, `${type} recommendation action`).toBeDefined();
      expect(typeof rec.recommendation).toBe("string");
      expect((rec as { reason?: string }).reason, `${type} reason`).toBeDefined();
      expect(rec.metrics, `${type} metrics`).toBeDefined();
      expect((rec as { createdAt?: string }).createdAt, `${type} createdAt`).toBeDefined();
    }
  });

  it("handles empty positions gracefully (no crash)", async () => {
    vi.mocked(getDb).mockResolvedValue({
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === "accounts") {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue([{ _id: new ObjectId(), positions: [] }]),
            }),
            findOne: vi.fn().mockResolvedValue(null),
          };
        }
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

    const optionRecs = await scanOptions(ACC_ID);
    const coveredCallRecs = await analyzeCoveredCalls(ACC_ID);
    const protectivePutRecs = await analyzeProtectivePuts(ACC_ID);
    const straddleRecs = await analyzeStraddlesAndStrangles(ACC_ID);

    expect(optionRecs).toEqual([]);
    expect(coveredCallRecs).toEqual([]);
    expect(protectivePutRecs).toEqual([]);
    expect(straddleRecs).toEqual([]);
  });
});
