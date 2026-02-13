import { describe, it, expect, vi, beforeEach } from "vitest";

const mockYahooQuote = vi.fn();
vi.mock("yahoo-finance2", () => ({
  default: vi.fn().mockImplementation(() => ({
    quote: mockYahooQuote,
    options: vi.fn(),
    trendingSymbols: vi.fn(),
    insights: vi.fn(),
    chart: vi.fn(),
  })),
}));

const { getOptionMetrics, getOptionMarketConditions } = await import("../yahoo");

describe("Yahoo Option Metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOptionMetrics", () => {
    it("returns null when options not included", async () => {
      // getOptionMetrics uses getStockAndOptionPrices internally; when options
      // chain returns no matching strike, we get null. We test the null path
      // since full integration requires live Yahoo API.
      const result = await getOptionMetrics("INVALIDTICKER999", "2026-02-20", 250, "put");
      expect(result).toBeNull();
    });
  });

  describe("getOptionMarketConditions", () => {
    it("returns VIX and trend from quotes", async () => {
      mockYahooQuote
        .mockResolvedValueOnce({ regularMarketPrice: 18 })
        .mockResolvedValueOnce({
          regularMarketPrice: 255,
          regularMarketPreviousClose: 250,
        });

      const result = await getOptionMarketConditions("TSLA");

      expect(result).toMatchObject({
        vix: 18,
        vixLevel: "moderate",
        trend: "up",
      });
      expect(result.symbolChangePercent).toBeCloseTo(2);
    });

    it("returns low vixLevel when VIX < 15", async () => {
      mockYahooQuote
        .mockResolvedValueOnce({ regularMarketPrice: 12 })
        .mockResolvedValueOnce({
          regularMarketPrice: 250,
          regularMarketPreviousClose: 248,
        });

      const result = await getOptionMarketConditions("TSLA");

      expect(result.vixLevel).toBe("low");
    });

    it("returns neutral trend for small change", async () => {
      mockYahooQuote
        .mockResolvedValueOnce({ regularMarketPrice: 20 })
        .mockResolvedValueOnce({
          regularMarketPrice: 250,
          regularMarketPreviousClose: 249.5,
        });

      const result = await getOptionMarketConditions("TSLA");

      expect(result.trend).toBe("neutral");
    });

    it("handles missing symbol gracefully", async () => {
      mockYahooQuote.mockResolvedValueOnce({ regularMarketPrice: 15 });

      const result = await getOptionMarketConditions();

      expect(result).toMatchObject({
        vix: 15,
        vixLevel: "moderate",
        trend: "neutral",
      });
      expect(result.symbolChangePercent).toBeUndefined();
    });

    it("handles API errors gracefully", async () => {
      mockYahooQuote.mockRejectedValue(new Error("Network error"));

      const result = await getOptionMarketConditions("TSLA");

      expect(result).toMatchObject({
        vix: 0,
        vixLevel: "moderate",
        trend: "neutral",
      });
    });
  });
});
