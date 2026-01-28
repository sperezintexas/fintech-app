import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { getDb } from "@/lib/mongodb";
import { getRiskDisclosure } from "@/lib/watchlist-rules";

vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/watchlist-rules", () => ({
  getRiskDisclosure: vi.fn(),
}));

describe("POST /api/watchlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRiskDisclosure).mockReturnValue({
      description: "risk desc",
      risks: ["r1", "r2"],
    } as any);
  });

  it("adds a stock watchlist item", async () => {
    const mockDb = {
      collection: vi.fn((name: string) => {
        if (name === "accounts") {
          return {
            findOne: vi.fn().mockResolvedValue({ _id: "acct" }),
          };
        }
        if (name === "watchlist") {
          return {
            insertOne: vi.fn().mockResolvedValue({ insertedId: "wl1" }),
          };
        }
        throw new Error(`Unexpected collection: ${name}`);
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const request = {
      json: async () => ({
        accountId: "64b64c2f9a1b2c3d4e5f6789",
        symbol: "aapl",
        underlyingSymbol: "AAPL",
        type: "stock",
        strategy: "long-stock",
        quantity: 10,
        entryPrice: 150,
      }),
    } as any;

    const res = await POST(request);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.symbol).toBe("AAPL");
    expect(data.type).toBe("stock");
    expect(data.strategy).toBe("long-stock");
    expect(data.quantity).toBe(10);
    expect(data.entryPrice).toBe(150);
    expect(data).toHaveProperty("_id");
    expect(data).toHaveProperty("riskWarnings");
  });

  it("adds an option watchlist item", async () => {
    const mockDb = {
      collection: vi.fn((name: string) => {
        if (name === "accounts") {
          return {
            findOne: vi.fn().mockResolvedValue({ _id: "acct" }),
          };
        }
        if (name === "watchlist") {
          return {
            insertOne: vi.fn().mockResolvedValue({ insertedId: "wl2" }),
          };
        }
        throw new Error(`Unexpected collection: ${name}`);
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const request = {
      json: async () => ({
        accountId: "64b64c2f9a1b2c3d4e5f6789",
        symbol: "TSLA",
        underlyingSymbol: "TSLA",
        type: "call",
        strategy: "leap-call",
        quantity: 2,
        entryPrice: 250,
        strikePrice: 250,
        expirationDate: "2026-06-20",
        entryPremium: 5,
      }),
    } as any;

    const res = await POST(request);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.symbol).toBe("TSLA");
    expect(data.type).toBe("call");
    expect(data.strategy).toBe("leap-call");
    expect(data.quantity).toBe(2);
    expect(data.entryPrice).toBe(250);
    expect(data.strikePrice).toBe(250);
    expect(data.expirationDate).toBe("2026-06-20");
    expect(data.entryPremium).toBe(5);
  });

  it("validates required fields", async () => {
    const request = {
      json: async () => ({ symbol: "AAPL" }),
    } as any;

    const res = await POST(request);
    expect(res.status).toBe(400);
  });
});
