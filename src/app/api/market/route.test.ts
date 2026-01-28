import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { getMarketConditions } from "@/lib/yahoo";

// Mock the yahoo module
vi.mock("@/lib/yahoo", () => ({
  getMarketConditions: vi.fn(),
}));

describe("GET /api/market", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return market conditions successfully", async () => {
    // Arrange
    const mockMarketConditions = {
      status: "open" as const,
      indices: [
        {
          symbol: "SPY",
          name: "S&P 500",
          price: 4500.0,
          change: 10.5,
          changePercent: 0.23,
        },
        {
          symbol: "QQQ",
          name: "Nasdaq 100",
          price: 3800.0,
          change: -5.2,
          changePercent: -0.14,
        },
      ],
      lastUpdated: new Date().toISOString(),
    };

    vi.mocked(getMarketConditions).mockResolvedValue(mockMarketConditions);

    // Act
    const response = await GET();
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data).toEqual(mockMarketConditions);
    expect(getMarketConditions).toHaveBeenCalledTimes(1);
  });

  it("should handle errors gracefully", async () => {
    // Arrange
    const error = new Error("Failed to fetch market data");
    vi.mocked(getMarketConditions).mockRejectedValue(error);

    // Act
    const response = await GET();
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data).toHaveProperty("error");
    expect(data.error).toBe("Failed to fetch market data");
  });
});
