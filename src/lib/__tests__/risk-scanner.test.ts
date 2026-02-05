import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { runRiskScanner } from "../risk-scanner";

vi.mock("../mongodb", () => ({
  getDb: vi.fn(),
}));

vi.mock("../yahoo", () => ({
  getMultipleTickerPrices: vi.fn().mockResolvedValue(new Map([["TSLA", { price: 250, change: 5 }]])),
}));

vi.mock("../risk-management", () => ({
  computeRiskMetricsWithPositions: vi.fn().mockResolvedValue({
    metrics: {
      totalValue: 50_000,
      vaR95: 2000,
      beta: 1.1,
      sharpe: 0.5,
      diversification: 0.6,
      volatility: 20,
      positionCount: 2,
    },
    positions: [
      { ticker: "TSLA", type: "stock", value: 30_000, weight: 0.6 },
      { ticker: "CASH", type: "cash", value: 20_000, weight: 0.4 },
    ],
  }),
}));

vi.mock("../xai-grok", () => ({
  analyzeRiskWithGrok: vi.fn().mockResolvedValue({
    riskLevel: "medium" as const,
    recommendations: [],
    confidence: 0.7,
    explanation: "Portfolio risk is moderate.",
  }),
}));

describe("Risk Scanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses only holdings (accounts/positions), never queries watchlist", async () => {
    const collectionsAccessed: string[] = [];
    const accId = new ObjectId();
    const mockAccounts = [
      {
        _id: accId,
        name: "Brokerage",
        balance: 50_000,
        riskLevel: "medium",
        strategy: "growth",
        positions: [
          {
            _id: new ObjectId().toString(),
            type: "stock" as const,
            ticker: "TSLA",
            shares: 100,
            purchasePrice: 240,
            currentPrice: 250,
          },
        ],
        recommendations: [],
      },
    ];

    const mockDb = {
      collection: vi.fn().mockImplementation((name: string) => {
        collectionsAccessed.push(name);
        if (name === "accounts") {
          return {
            find: vi.fn().mockReturnThis(),
            toArray: vi.fn().mockResolvedValue(mockAccounts),
          };
        }
        if (name === "alerts") {
          return {
            findOne: vi.fn().mockResolvedValue(null),
            insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
          };
        }
        return {};
      }),
    };

    const { getDb } = await import("../mongodb");
    vi.mocked(getDb).mockResolvedValue(mockDb as never);

    const result = await runRiskScanner();

    expect(result.riskLevel).toBe("medium");
    expect(collectionsAccessed).toContain("accounts");
    expect(collectionsAccessed).not.toContain("watchlist");
  });

  it("returns no-accounts result when no accounts exist", async () => {
    const mockDb = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === "accounts") {
          return {
            find: vi.fn().mockReturnThis(),
            toArray: vi.fn().mockResolvedValue([]),
          };
        }
        return {};
      }),
    };

    const { getDb } = await import("../mongodb");
    vi.mocked(getDb).mockResolvedValue(mockDb as never);

    const result = await runRiskScanner();

    expect(result.riskLevel).toBe("medium");
    expect(result.alertsCreated).toBe(0);
    expect(result.explanation).toBe("No accounts to analyze.");
  });

  it("scopes to single account when accountId is provided", async () => {
    const accId = new ObjectId();
    const mockDb = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === "accounts") {
          const findMock = vi.fn().mockImplementation((query: { _id?: unknown }) => {
            expect(query).toEqual({ _id: accId });
            return {
              toArray: vi.fn().mockResolvedValue([
                {
                  _id: accId,
                  name: "IRA",
                  balance: 25_000,
                  riskLevel: "low",
                  strategy: "balanced",
                  positions: [
                    {
                      _id: new ObjectId().toString(),
                      type: "stock" as const,
                      ticker: "TSLA",
                      shares: 50,
                      purchasePrice: 245,
                      currentPrice: 250,
                    },
                  ],
                  recommendations: [],
                },
              ]),
            };
          });
          return { find: findMock };
        }
        if (name === "alerts") {
          return {
            findOne: vi.fn().mockResolvedValue(null),
            insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
          };
        }
        return {};
      }),
    };

    const { getDb } = await import("../mongodb");
    vi.mocked(getDb).mockResolvedValue(mockDb as never);

    const result = await runRiskScanner(accId.toString());

    expect(result.riskLevel).toBe("medium");
    expect(mockDb.collection).toHaveBeenCalledWith("accounts");
    expect(mockDb.collection).not.toHaveBeenCalledWith("watchlist");
  });
});
