import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockTrendingSymbols, mockInsights, mockQuote, mockOptions } = vi.hoisted(() => ({
  mockTrendingSymbols: vi.fn(),
  mockInsights: vi.fn(),
  mockQuote: vi.fn(),
  mockOptions: vi.fn(),
}));

vi.mock("yahoo-finance2", () => ({
  default: vi.fn().mockImplementation(() => ({
    quote: mockQuote,
    trendingSymbols: mockTrendingSymbols,
    insights: mockInsights,
    options: mockOptions,
  })),
}));

vi.mock("../yahoo", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../yahoo")>();
  return {
    ...mod,
    getMarketConditions: vi.fn().mockResolvedValue({
      status: "open",
      indices: [
        { symbol: "SPY", name: "S&P 500", price: 500, change: 2, changePercent: 0.4 },
        { symbol: "QQQ", name: "Nasdaq 100", price: 450, change: -1, changePercent: -0.22 },
      ],
      lastUpdated: new Date().toISOString(),
    }),
  };
});

const { getMarketNewsAndOutlook, getStockAndOptionPrices } = await import("../yahoo");

describe("Smart Grok Chat Tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getMarketNewsAndOutlook", () => {
    it("returns correct structure with news and outlook", async () => {
      mockTrendingSymbols.mockResolvedValue({
        quotes: [{ symbol: "TSLA" }, { symbol: "AAPL" }],
      });
      mockInsights
        .mockResolvedValueOnce({
          sigDevs: [
            { headline: "Tesla reports earnings", date: new Date() },
            { headline: "Market update", date: new Date() },
          ],
        })
        .mockResolvedValueOnce({
          sigDevs: [{ headline: "Tech sector news", date: new Date() }],
        });

      const result = await getMarketNewsAndOutlook({ limit: 5, region: "US" });

      expect(result).toHaveProperty("news");
      expect(result).toHaveProperty("outlook");
      expect(result.outlook).toHaveProperty("summary");
      expect(result.outlook).toHaveProperty("sentiment");
      expect(["bullish", "neutral", "bearish"]).toContain(result.outlook.sentiment);
      expect(Array.isArray(result.news)).toBe(true);
    });

    it("handles API errors gracefully", async () => {
      vi.useFakeTimers();
      vi.advanceTimersByTime(11 * 60 * 1000); // Past 10-min cache TTL
      mockTrendingSymbols.mockRejectedValue(new Error("Network error"));
      mockInsights.mockRejectedValue(new Error("Network error"));

      const resultPromise = getMarketNewsAndOutlook();
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      vi.useRealTimers();

      expect(result.news).toEqual([]);
      expect(result.outlook.sentiment).toBe("neutral");
      expect(result.outlook.summary).toContain("Unable to fetch");
    });
  });

  describe("getStockAndOptionPrices", () => {
    it("returns stock data without options when includeOptions is false", async () => {
      mockQuote.mockResolvedValue({
        regularMarketPrice: 250.5,
        regularMarketPreviousClose: 248,
        regularMarketVolume: 10_000_000,
      });

      const result = await getStockAndOptionPrices("TSLA", { includeOptions: false });

      expect(result).not.toBeNull();
      expect(result!.stock).toEqual({
        price: 250.5,
        change: 2.5,
        volume: 10_000_000,
        changePercent: expect.any(Number),
      });
      expect(result!.options).toBeUndefined();
    });

    it("returns null for invalid symbol", async () => {
      mockQuote.mockResolvedValue(null);

      const result = await getStockAndOptionPrices("INVALID123");

      expect(result).toBeNull();
    });

    it("returns stock and options when includeOptions is true", async () => {
      mockQuote.mockResolvedValue({
        regularMarketPrice: 250,
        regularMarketPreviousClose: 248,
        regularMarketVolume: 5_000_000,
      });
      mockOptions.mockResolvedValue({
        options: [
          {
            calls: [
              { strike: 255, bid: 5, ask: 5.5, lastPrice: 5.2, volume: 100 },
            ],
            puts: [
              { strike: 245, bid: 3, ask: 3.5, lastPrice: 3.2, volume: 50 },
            ],
          },
        ],
      });

      const result = await getStockAndOptionPrices("TSLA", {
        includeOptions: true,
        expiration: new Date("2026-02-20"),
      });

      expect(result).not.toBeNull();
      expect(result!.stock.price).toBe(250);
      expect(result!.options).toBeDefined();
      expect(result!.options!.calls.length).toBeGreaterThan(0);
      expect(result!.options!.puts.length).toBeGreaterThan(0);
      expect(result!.options!.calls[0]).toMatchObject({
        strike: 255,
        type: "call",
        bid: 5,
        ask: 5.5,
      });
    });
  });
});
