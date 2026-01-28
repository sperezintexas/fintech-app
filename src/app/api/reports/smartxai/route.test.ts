import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, GET } from "./route";
import { getMultipleTickerOHLC, getMarketConditions } from "@/lib/yahoo";
import { getDb } from "@/lib/mongodb";
import { analyzeWatchlistItem } from "@/lib/watchlist-rules";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

// Mock dependencies
vi.mock("@/lib/yahoo", () => ({
  getMultipleTickerOHLC: vi.fn(),
  getMarketConditions: vi.fn(),
}));

vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/watchlist-rules", () => ({
  analyzeWatchlistItem: vi.fn(),
}));

describe("POST /api/reports/smartxai", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate report successfully", async () => {
    // Arrange
    const accountId = new ObjectId().toString();
    const mockAccount = {
      _id: new ObjectId(accountId),
      name: "Test Account",
      riskLevel: "medium",
    };

    const mockWatchlistItems = [
      {
        _id: new ObjectId(),
        accountId,
        symbol: "TSLA",
        underlyingSymbol: "TSLA",
        type: "stock",
        entryPrice: 200,
        quantity: 10,
        strategy: "covered-call",
      },
    ];

    const mockMarketData = new Map([
      [
        "TSLA",
        {
          open: 200,
          high: 210,
          low: 195,
          close: 205,
          volume: 1000000,
        },
      ],
      [
        "SPY",
        {
          open: 450,
          high: 455,
          low: 448,
          close: 452,
          volume: 5000000,
        },
      ],
    ]);

    const mockMarketConditions = {
      status: "open" as const,
      indices: [],
      lastUpdated: new Date().toISOString(),
    };

    const mockDb = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === "accounts") {
          return {
            findOne: vi.fn().mockResolvedValue(mockAccount),
          };
        }
        if (name === "watchlist") {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(mockWatchlistItems),
            }),
          };
        }
        if (name === "smartXAIReports") {
          return {
            insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
            deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
          };
        }
        return {};
      }),
    };

    const { analyzeWatchlistItem } = await import("@/lib/watchlist-rules");
    vi.mocked(analyzeWatchlistItem).mockReturnValue({
      recommendation: "HOLD",
      severity: "info",
      reason: "Test reason",
      confidence: 0.8,
      details: {
        currentPrice: 205,
        entryPrice: 200,
        priceChange: 5,
        priceChangePercent: 2.5,
      },
      riskWarning: undefined,
      suggestedActions: [],
    });

    vi.mocked(analyzeWatchlistItem).mockReturnValue({
      recommendation: "HOLD",
      severity: "info",
      reason: "Test reason",
      confidence: 0.8,
      details: {
        currentPrice: 205,
        entryPrice: 200,
        priceChange: 5,
        priceChangePercent: 2.5,
      },
      riskWarning: undefined,
      suggestedActions: [],
    });

    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    vi.mocked(getMultipleTickerOHLC).mockResolvedValue(mockMarketData);
    vi.mocked(getMarketConditions).mockResolvedValue(mockMarketConditions);

    const request = new NextRequest("http://localhost/api/reports/smartxai", {
      method: "POST",
      body: JSON.stringify({ accountId }),
    });

    // Act
    const response = await POST(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data).toHaveProperty("success", true);
    expect(data).toHaveProperty("report");
    expect(data.report).toHaveProperty("accountId", accountId);
    expect(data.report).toHaveProperty("positions");
    expect(getMultipleTickerOHLC).toHaveBeenCalled();
  });

  it("should handle missing accountId", async () => {
    // Arrange
    const request = new NextRequest("http://localhost/api/reports/smartxai", {
      method: "POST",
      body: JSON.stringify({}),
    });

    // Act
    const response = await POST(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data).toHaveProperty("error");
  });

  it("should handle account not found", async () => {
    // Arrange
    const accountId = new ObjectId().toString();
    const mockDb = {
      collection: vi.fn().mockReturnValue({
        findOne: vi.fn().mockResolvedValue(null),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const request = new NextRequest("http://localhost/api/reports/smartxai", {
      method: "POST",
      body: JSON.stringify({ accountId }),
    });

    // Act
    const response = await POST(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(404);
    expect(data).toHaveProperty("error");
  });

  it("should handle no watchlist items", async () => {
    // Arrange
    const accountId = new ObjectId().toString();
    const mockAccount = {
      _id: new ObjectId(accountId),
      name: "Test Account",
      riskLevel: "medium",
    };

    const mockDb = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === "accounts") {
          return {
            findOne: vi.fn().mockResolvedValue(mockAccount),
          };
        }
        if (name === "watchlist") {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue([]),
            }),
          };
        }
        return {};
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const request = new NextRequest("http://localhost/api/reports/smartxai", {
      method: "POST",
      body: JSON.stringify({ accountId }),
    });

    // Act
    const response = await POST(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(404);
    expect(data).toHaveProperty("error");
  });
});

describe("GET /api/reports/smartxai", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch report by ID", async () => {
    // Arrange
    const reportId = new ObjectId().toString();
    const mockReport = {
      _id: new ObjectId(reportId),
      accountId: new ObjectId().toString(),
      generatedAt: new Date().toISOString(),
      reportDateTime: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      positions: [],
    };

    const mockDb = {
      collection: vi.fn().mockReturnValue({
        findOne: vi.fn().mockResolvedValue(mockReport),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const request = new NextRequest(
      `http://localhost/api/reports/smartxai?id=${reportId}`
    );

    // Act
    const response = await GET(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    // GET by ID returns the report directly, not wrapped in "report" property
    expect(data).toHaveProperty("_id");
    expect(data).toHaveProperty("accountId");
  });

  it("should handle report not found", async () => {
    // Arrange
    const reportId = new ObjectId().toString();
    const mockDb = {
      collection: vi.fn().mockReturnValue({
        findOne: vi.fn().mockResolvedValue(null),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const request = new NextRequest(
      `http://localhost/api/reports/smartxai?id=${reportId}`
    );

    // Act
    const response = await GET(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(404);
    expect(data).toHaveProperty("error");
  });

  it("should fetch reports by accountId", async () => {
    // Arrange
    const accountId = new ObjectId().toString();
    const mockReports = [
      {
        _id: new ObjectId(),
        accountId,
        generatedAt: new Date().toISOString(),
        reportDateTime: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        positions: [],
      },
    ];

    const mockDb = {
      collection: vi.fn().mockReturnValue({
        find: vi.fn().mockReturnValue({
          sort: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(mockReports),
            }),
          }),
        }),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const request = new NextRequest(
      `http://localhost/api/reports/smartxai?accountId=${accountId}`
    );

    // Act
    const response = await GET(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    // GET by accountId returns array directly
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty("accountId", accountId);
    }
  });
});
