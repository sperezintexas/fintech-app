import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

const { mockOptions, mockQuote } = vi.hoisted(() => ({
  mockOptions: vi.fn(),
  mockQuote: vi.fn(),
}));

vi.mock("yahoo-finance2", () => ({
  default: vi.fn().mockImplementation(() => ({
    options: mockOptions,
    quote: mockQuote,
  })),
}));

function makeYahooOptionGroup(expirationDate: Date, strikes: number[] = [250, 255, 260]) {
  const yyymmdd = expirationDate.toISOString().slice(0, 10).replace(/-/g, "").slice(2);
  const calls = strikes.map((strike) => ({
    contractSymbol: `TSLA${yyymmdd}C${String(Math.round(strike * 1000)).padStart(8, "0")}`,
    strike,
    lastPrice: 5.5,
    bid: 5.4,
    ask: 5.6,
    volume: 100,
    openInterest: 500,
    impliedVolatility: 0.35,
    expiration: expirationDate,
  }));
  const puts = strikes.map((strike) => ({
    contractSymbol: `TSLA${yyymmdd}P${String(Math.round(strike * 1000)).padStart(8, "0")}`,
    strike,
    lastPrice: 4.2,
    bid: 4.1,
    ask: 4.3,
    volume: 80,
    openInterest: 400,
    impliedVolatility: 0.38,
    expiration: expirationDate,
  }));
  return { expirationDate, calls, puts };
}

describe("GET /api/options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuote.mockResolvedValue({ regularMarketPrice: 255 });
  });

  it("returns 400 when underlying is missing", async () => {
    const req = new Request("http://localhost/api/options?expiration=2026-02-27&strike=250");
    const res = await GET(req as never);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("underlying is required");
  });

  it("returns 400 when expiration is missing", async () => {
    const req = new Request("http://localhost/api/options?underlying=TSLA&strike=250");
    const res = await GET(req as never);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("expiration is required");
  });

  it("accepts Yahoo-style Unix timestamp (date=1771545600) and returns matching expiration", async () => {
    const unixTs = "1771545600";
    const expDate = "2026-02-20";
    const group = makeYahooOptionGroup(new Date(expDate + "T00:00:00Z"));

    mockOptions.mockResolvedValueOnce({
      options: [group],
    });

    const req = new Request(
      `http://localhost/api/options?underlying=CIFR&expiration=${unixTs}&strike=10`
    );
    const res = await GET(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.expiration).toBe(expDate);
    expect(data.requestedExpiration).toBe(expDate);
    expect(data.dataSource).toBe("yahoo");
  });

  it("returns exact expiration when Yahoo has matching date", async () => {
    const requestedExp = "2026-02-27";
    const group = makeYahooOptionGroup(new Date(requestedExp + "T12:00:00Z"));

    mockOptions.mockResolvedValueOnce({
      options: [group],
    });

    const req = new Request(
      `http://localhost/api/options?underlying=TSLA&expiration=${requestedExp}&strike=250`
    );
    const res = await GET(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.expiration).toBe(requestedExp);
    expect(data.requestedExpiration).toBe(requestedExp);
    expect(data.dataSource).toBe("yahoo");
    expect(data.note).not.toContain("closest to requested");
  });

  it("prefers nearest future expiration when requested date (4w out) has no exact match", async () => {
    // User selects 4 weeks = 2026-02-27 (Friday)
    const requestedExp = "2026-02-27";
    const jan30 = makeYahooOptionGroup(new Date("2026-01-30T12:00:00Z"));
    const feb27 = makeYahooOptionGroup(new Date("2026-02-27T12:00:00Z"));
    const mar6 = makeYahooOptionGroup(new Date("2026-03-06T12:00:00Z"));

    // Yahoo returns multiple expirations but NOT the exact 2026-02-27
    mockOptions.mockResolvedValueOnce({
      options: [jan30, feb27, mar6],
    });

    const req = new Request(
      `http://localhost/api/options?underlying=TSLA&expiration=${requestedExp}&strike=250`
    );
    const res = await GET(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    // Exact match exists (feb27) - should return 2026-02-27
    expect(data.expiration).toBe("2026-02-27");
  });

  it("returns Mar 6 when user selects 5w expiration (2026-03-06)", async () => {
    const requestedExp = "2026-03-06";
    const mar6 = makeYahooOptionGroup(new Date(requestedExp + "T12:00:00Z"));

    mockOptions.mockResolvedValueOnce({
      options: [mar6],
    });

    const req = new Request(
      `http://localhost/api/options?underlying=TSLA&expiration=${requestedExp}&strike=250`
    );
    const res = await GET(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.expiration).toBe("2026-03-06");
    expect(data.requestedExpiration).toBe("2026-03-06");
    expect(data.note).not.toContain("closest to requested");
  });

  it("picks Mar 6 from full chain when user asked Mar 6 (no date param - full chain first)", async () => {
    const requestedExp = "2026-03-06";
    const jan30 = makeYahooOptionGroup(new Date("2026-01-30T12:00:00Z"));
    const mar6 = makeYahooOptionGroup(new Date("2026-03-06T12:00:00Z"));

    // Single call (full chain, no date param) - we pick Mar 6 from findExpirationGroup
    mockOptions.mockResolvedValueOnce({ options: [jan30, mar6] });

    const req = new Request(
      `http://localhost/api/options?underlying=TSLA&expiration=${requestedExp}&strike=250`
    );
    const res = await GET(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.expiration).toBe("2026-03-06");
    expect(data.requestedExpiration).toBe("2026-03-06");
    expect(mockOptions).toHaveBeenCalledTimes(1);
  });

  it("picks nearest future expiration over past when no exact match", async () => {
    // User selects 4 weeks out = 2026-02-27
    const requestedExp = "2026-02-27";
    const jan30 = makeYahooOptionGroup(new Date("2026-01-30T12:00:00Z"));
    const mar6 = makeYahooOptionGroup(new Date("2026-03-06T12:00:00Z"));

    // Yahoo has Jan 30 and Mar 6 but NOT Feb 27 - should pick Mar 6 (nearest future)
    mockOptions.mockResolvedValueOnce({
      options: [jan30, mar6],
    });

    const req = new Request(
      `http://localhost/api/options?underlying=TSLA&expiration=${requestedExp}&strike=250`
    );
    const res = await GET(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.expiration).toBe("2026-03-06");
    expect(data.requestedExpiration).toBe("2026-02-27");
    expect(data.note).toContain("closest to requested");
  });

  it("falls back to synthetic when Yahoo returns empty", async () => {
    mockOptions.mockResolvedValueOnce({ options: [] });

    const req = new Request(
      "http://localhost/api/options?underlying=TSLA&expiration=2026-02-27&strike=250"
    );
    const res = await GET(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.dataSource).toBe("synthetic");
    expect(data.expiration).toBe("2026-02-27");
    expect(data.optionChain.length).toBeGreaterThan(0);
  });

  it("falls back to synthetic when Yahoo throws", async () => {
    mockOptions.mockRejectedValueOnce(new Error("Rate limited"));

    const req = new Request(
      "http://localhost/api/options?underlying=TSLA&expiration=2026-02-27&strike=250"
    );
    const res = await GET(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.dataSource).toBe("synthetic");
    expect(data.optionChain.length).toBeGreaterThan(0);
  });
});
