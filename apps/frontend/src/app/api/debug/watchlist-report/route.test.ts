import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { GET } from "./route";
import { getDb } from "@/lib/mongodb";

vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn(),
}));

describe("GET /api/debug/watchlist-report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns watchlists, item counts, and sample items", async () => {
    const wl1 = new ObjectId();
    const wl2 = new ObjectId();
    const mockWatchlists = [
      { _id: wl1, name: "Default" },
      { _id: wl2, name: "Tech" },
    ];
    const mockItems = [
      { _id: new ObjectId(), watchlistId: wl1.toString(), symbol: "TSLA" },
      { _id: new ObjectId(), watchlistId: wl2.toString(), symbol: "AAPL" },
    ];

    const mockDb = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === "watchlists") {
          return {
            find: vi.fn().mockReturnValue({
              sort: vi.fn().mockReturnValue({
                toArray: vi.fn().mockResolvedValue(mockWatchlists),
              }),
            }),
          };
        }
        if (name === "watchlist") {
          return {
            find: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                toArray: vi.fn().mockResolvedValue(mockItems),
              }),
            }),
            countDocuments: vi.fn().mockImplementation((q: Record<string, unknown>) => {
              if (Object.keys(q).length === 0) return Promise.resolve(2);
              if (q.$or) return Promise.resolve(0);
              return Promise.resolve(1);
            }),
          };
        }
        return {};
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.watchlists).toHaveLength(2);
    expect(data.itemCounts).toHaveLength(2);
    expect(data.totalItems).toBe(2);
    expect(data.sampleItems).toHaveLength(2);
  });

  it("returns hint when orphaned items exist and no Default watchlist", async () => {
    const wl1 = new ObjectId();
    const mockWatchlists = [{ _id: wl1, name: "Tech" }];
    const mockItems = [{ _id: new ObjectId(), watchlistId: undefined, symbol: "TSLA" }];

    const mockDb = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === "watchlists") {
          return {
            find: vi.fn().mockReturnValue({
              sort: vi.fn().mockReturnValue({
                toArray: vi.fn().mockResolvedValue(mockWatchlists),
              }),
            }),
          };
        }
        if (name === "watchlist") {
          return {
            find: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                toArray: vi.fn().mockResolvedValue(mockItems),
              }),
            }),
            countDocuments: vi.fn().mockImplementation((q: Record<string, unknown>) => {
              if (Object.keys(q).length === 0) return Promise.resolve(1);
              if (q.$or) {
                const orClause = (q.$or as Array<Record<string, unknown>>) ?? [];
                const hasOrphaned = orClause.some(
                  (c) =>
                    typeof c.watchlistId === "object" &&
                    c.watchlistId !== null &&
                    "$exists" in (c.watchlistId as Record<string, unknown>)
                );
                return Promise.resolve(hasOrphaned ? 1 : 0);
              }
              return Promise.resolve(0);
            }),
          };
        }
        return {};
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.orphanedItems).toBeGreaterThanOrEqual(0);
    expect(data.hint).toBeDefined();
    expect(data.hint).toContain("Default");
  });
});
