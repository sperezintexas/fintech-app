import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { getMultipleTickerPrices } from "@/lib/yahoo";
import { getDb } from "@/lib/mongodb";

// Mock dependencies
vi.mock("@/lib/yahoo", () => ({
  getMultipleTickerPrices: vi.fn(),
}));

vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn(),
}));

describe("GET /api/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return dashboard data with live prices", async () => {
    // Arrange
    const mockAccounts = [
      {
        _id: "account1",
        name: "Test Account",
        balance: 10000,
        riskLevel: "medium" as const,
        strategy: "growth" as const,
        positions: [
          {
            _id: "pos1",
            type: "stock" as const,
            ticker: "TSLA",
            shares: 10,
            purchasePrice: 200,
            currentPrice: 250,
          },
          {
            _id: "pos2",
            type: "cash" as const,
            amount: 5000,
          },
        ],
        recommendations: [],
      },
    ];

    const mockPrices = new Map([
      [
        "TSLA",
        {
          price: 250,
          change: 5,
          changePercent: 2.0,
        },
      ],
    ]);

    const mockDb = {
      collection: vi.fn().mockReturnValue({
        find: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue(mockAccounts),
        }),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);
    vi.mocked(getMultipleTickerPrices).mockResolvedValue(mockPrices);

    // Act
    const response = await GET();
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data).toHaveProperty("portfolio");
    expect(data).toHaveProperty("stats");
    expect(data.portfolio.accounts).toHaveLength(1);
    expect(data.stats.totalValue).toBeGreaterThan(0);
    expect(getMultipleTickerPrices).toHaveBeenCalled();
  });

  it("should handle accounts with no positions", async () => {
    // Arrange
    const mockAccounts = [
      {
        _id: "account1",
        name: "Empty Account",
        balance: 5000,
        riskLevel: "low" as const,
        strategy: "income" as const,
        positions: [],
        recommendations: [],
      },
    ];

    const mockDb = {
      collection: vi.fn().mockReturnValue({
        find: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue(mockAccounts),
        }),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);
    vi.mocked(getMultipleTickerPrices).mockResolvedValue(new Map());

    // Act
    const response = await GET();
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.portfolio.accounts[0].balance).toBe(5000);
    expect(data.stats.totalValue).toBe(5000);
  });

  it("should handle errors gracefully", async () => {
    // Arrange
    const error = new Error("Database connection failed");
    vi.mocked(getDb).mockRejectedValue(error);

    // Act
    const response = await GET();
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data).toHaveProperty("error");
    expect(data.error).toBe("Failed to fetch dashboard data");
  });

  it("should calculate option positions correctly", async () => {
    // Arrange
    const mockAccounts = [
      {
        _id: "account1",
        name: "Options Account",
        balance: 0,
        riskLevel: "high" as const,
        strategy: "aggressive" as const,
        positions: [
          {
            _id: "pos1",
            type: "option" as const,
            ticker: "TSLA",
            contracts: 2,
            premium: 5.0,
            currentPrice: 6.0,
          },
        ],
        recommendations: [],
      },
    ];

    const mockDb = {
      collection: vi.fn().mockReturnValue({
        find: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue(mockAccounts),
        }),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);
    vi.mocked(getMultipleTickerPrices).mockResolvedValue(new Map());

    // Act
    const response = await GET();
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    // Options: 2 contracts * 6.0 premium * 100 = 1200
    expect(data.portfolio.accounts[0].balance).toBe(1200);
    expect(data.stats.totalValue).toBe(1200);
  });
});
