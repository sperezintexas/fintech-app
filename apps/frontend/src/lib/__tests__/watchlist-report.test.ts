import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { executeJob } from "../scheduler";
import { getDb } from "../mongodb";
import { getBatchPriceAndRSI } from "../yahoo";
import { postToXThread } from "../x";

vi.mock("../mongodb", () => ({
  getDb: vi.fn(),
}));

vi.mock("../yahoo", () => ({
  getBatchPriceAndRSI: vi.fn().mockResolvedValue(
    new Map([
      ["TSLA", { price: 250, changePercent: 2.5, rsi: 55 }],
      ["AAPL", { price: 180, changePercent: -0.5, rsi: 48 }],
    ])
  ),
  getMultipleTickerOHLC: vi.fn().mockResolvedValue(
    new Map([
      ["TSLA", { open: 245, high: 252, low: 244, close: 250, volume: 1e6 }],
      ["AAPL", { open: 181, high: 182, low: 179, close: 180, volume: 2e6 }],
    ])
  ),
}));

vi.mock("../watchlist-rules", () => ({
  analyzeWatchlistItem: vi.fn().mockReturnValue({ recommendation: "HOLD", severity: "info", reason: "OK" }),
}));

vi.mock("../x", () => ({
  postToXThread: vi.fn().mockResolvedValue(undefined),
}));

/** Accounts collection mock: supports find().toArray() and find().project().toArray() for runWatchlistAnalysis (holdings check). */
function mockAccountsCollection(accId?: ObjectId) {
  const id = accId ?? new ObjectId();
  return {
    find: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ _id: id, riskLevel: "medium" }]),
      project: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { _id: id, positions: [{ type: "stock", ticker: "TSLA" }] },
        ]),
      }),
    }),
  };
}

describe("Watchlist Report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends one post per watchlist with items (portfolio-level)", async () => {
    const watchlist1Id = new ObjectId();
    const watchlist2Id = new ObjectId();
    const jobId = new ObjectId();

    const mockWatchlists = [
      { _id: watchlist1Id, name: "Default" },
      { _id: watchlist2Id, name: "Tech" },
    ];

    const accId = new ObjectId();
    const mockItems = [
      {
        _id: new ObjectId(),
        watchlistId: watchlist1Id.toString(),
        accountId: accId.toString(),
        symbol: "TSLA",
        underlyingSymbol: "TSLA",
        type: "stock",
        strategy: "buy-and-hold",
      },
      {
        _id: new ObjectId(),
        watchlistId: watchlist2Id.toString(),
        accountId: accId.toString(),
        symbol: "AAPL",
        underlyingSymbol: "AAPL",
        type: "stock",
        strategy: "buy-and-hold",
      },
    ];

    const mockJob = {
      _id: jobId,
      accountId: null,
      name: "Daily Watchlist",
      jobType: "watchlistreport",
      templateId: "concise",
      channels: ["slack"],
      status: "active",
    };

    const mockPrefs = {
      accountId: null,
      channels: [{ channel: "slack", target: "https://hooks.slack.com/test" }],
    };

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const mockDb = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === "reportJobs") {
          return {
            findOne: vi.fn().mockResolvedValue(mockJob),
            updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
          };
        }
        if (name === "reportTypes") {
          return {
            findOne: vi.fn().mockResolvedValue({ handlerKey: "watchlistreport" }),
          };
        }
        if (name === "watchlists") {
          return {
            find: vi.fn().mockReturnValue({
              sort: vi.fn().mockReturnValue({
                toArray: vi.fn().mockResolvedValue(mockWatchlists),
              }),
            }),
            findOne: vi.fn().mockImplementation((q: { name?: string }) =>
              q.name === "Default" ? Promise.resolve(mockWatchlists[0]) : Promise.resolve(null)
            ),
            insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
          };
        }
        if (name === "watchlist") {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(mockItems),
            }),
            updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
            countDocuments: vi.fn().mockResolvedValue(0),
          };
        }
        if (name === "accounts") {
          return mockAccountsCollection(accId);
        }
        if (name === "alertPreferences") {
          return {
            findOne: vi.fn().mockResolvedValue(mockPrefs),
          };
        }
        if (name === "alerts") {
          return {
            insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
            findOne: vi.fn().mockResolvedValue(null),
          };
        }
        return {};
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    const result = await executeJob(jobId.toString());

    expect(result.success).toBe(true);
    expect(result.deliveredChannels).toContain("Slack");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("includes stock symbols in report body when items exist", async () => {
    const watchlistId = new ObjectId();
    const jobId = new ObjectId();

    const mockWatchlists = [{ _id: watchlistId, name: "Default" }];
    const accId = new ObjectId();
    const mockItems = [
      {
        _id: new ObjectId(),
        watchlistId: watchlistId.toString(),
        accountId: accId.toString(),
        symbol: "TSLA",
        underlyingSymbol: "TSLA",
        type: "stock",
        strategy: "buy-and-hold",
      },
    ];

    const mockJob = {
      _id: jobId,
      accountId: null,
      name: "Daily Watchlist",
      jobType: "watchlistreport",
      templateId: "concise",
      channels: ["slack"],
      status: "active",
    };

    const mockPrefs = {
      channels: [{ channel: "slack", target: "https://hooks.slack.com/test" }],
    };

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const mockDb = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === "reportJobs") {
          return {
            findOne: vi.fn().mockResolvedValue(mockJob),
            updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
          };
        }
        if (name === "reportTypes") {
          return { findOne: vi.fn().mockResolvedValue({ handlerKey: "watchlistreport" }) };
        }
        if (name === "watchlists") {
          return {
            find: vi.fn().mockReturnValue({
              sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(mockWatchlists) }),
            }),
            findOne: vi.fn().mockResolvedValue(mockWatchlists[0]),
          };
        }
        if (name === "watchlist") {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(mockItems),
            }),
            updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
            countDocuments: vi.fn().mockResolvedValue(0),
          };
        }
        if (name === "accounts") {
          return mockAccountsCollection(accId);
        }
        if (name === "alertPreferences") {
          return { findOne: vi.fn().mockResolvedValue(mockPrefs) };
        }
        if (name === "alerts") {
          return {
            insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
            findOne: vi.fn().mockResolvedValue(null),
          };
        }
        return {};
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    const result = await executeJob(jobId.toString());

    expect(result.success).toBe(true);
    const slackBody = JSON.parse(fetchMock.mock.calls[0][1]?.body ?? "{}");
    expect(slackBody.text).toContain("TSLA");
    expect(slackBody.text).not.toContain("No stocks on watchlist");
  });

  it("rounds RSI to whole number in both Slack and X channels", async () => {
    const watchlistId = new ObjectId();
    const jobId = new ObjectId();
    const fractionalRsi = 53.07421219928421;

    vi.mocked(getBatchPriceAndRSI).mockResolvedValueOnce(
      new Map([["TSLA", { price: 250, changePercent: 2.5, rsi: fractionalRsi }]])
    );

    const mockWatchlists = [{ _id: watchlistId, name: "Default" }];
    const mockItems = [
      {
        _id: new ObjectId(),
        watchlistId: watchlistId.toString(),
        accountId: new ObjectId().toString(),
        symbol: "TSLA",
        underlyingSymbol: "TSLA",
        type: "stock",
        strategy: "buy-and-hold",
      },
    ];

    const mockJob = {
      _id: jobId,
      accountId: null,
      name: "Daily Watchlist",
      jobType: "watchlistreport",
      templateId: "concise",
      channels: ["slack", "twitter"],
      status: "active",
    };

    const mockPrefs = {
      channels: [
        { channel: "slack", target: "https://hooks.slack.com/test" },
        { channel: "twitter", target: "x-api-token" },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const mockDb = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === "reportJobs") {
          return { findOne: vi.fn().mockResolvedValue(mockJob), updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }) };
        }
        if (name === "reportTypes") {
          return { findOne: vi.fn().mockResolvedValue({ handlerKey: "watchlistreport" }) };
        }
        if (name === "watchlists") {
          return {
            find: vi.fn().mockReturnValue({
              sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(mockWatchlists) }),
            }),
            findOne: vi.fn().mockResolvedValue(mockWatchlists[0]),
          };
        }
        if (name === "watchlist") {
          return {
            find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(mockItems) }),
            updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
            countDocuments: vi.fn().mockResolvedValue(0),
          };
        }
        if (name === "accounts") {
          return mockAccountsCollection();
        }
        if (name === "alertPreferences") {
          return { findOne: vi.fn().mockResolvedValue(mockPrefs) };
        }
        if (name === "alerts") {
          return {
            insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
            findOne: vi.fn().mockResolvedValue(null),
          };
        }
        return {};
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    const result = await executeJob(jobId.toString());

    expect(result.success).toBe(true);
    expect(result.deliveredChannels).toContain("Slack");
    expect(result.deliveredChannels).toContain("X");

    const slackBody = JSON.parse(fetchMock.mock.calls[0][1]?.body ?? "{}");
    expect(slackBody.text).toContain("RSI:53");
    expect(slackBody.text).toContain("Bullish📈");
    expect(slackBody.text).not.toContain("53.07421219928421");

    const xCall = vi.mocked(postToXThread).mock.calls[0]?.[0] ?? "";
    expect(xCall).toContain("RSI:53");
    expect(xCall).toContain("Bullish📈");
    expect(xCall).not.toContain("53.07421219928421");
  });

  it("includes orphaned items (no watchlistId) in Default when Default is auto-created", async () => {
    const techWatchlistId = new ObjectId();
    const jobId = new ObjectId();
    let insertedDefaultId: ObjectId | null = null;

    const mockWatchlists = [{ _id: techWatchlistId, name: "Tech" }];
    const orphanedItems = [
      {
        _id: new ObjectId(),
        watchlistId: undefined,
        accountId: new ObjectId().toString(),
        symbol: "TSLA",
        underlyingSymbol: "TSLA",
        type: "stock",
        strategy: "buy-and-hold",
      },
    ];

    const mockJob = {
      _id: jobId,
      accountId: null,
      name: "Daily Watchlist",
      jobType: "watchlistreport",
      templateId: "concise",
      channels: ["slack"],
      status: "active",
    };

    const mockPrefs = {
      accountId: null,
      channels: [{ channel: "slack", target: "https://hooks.slack.com/test" }],
    };

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const insertOneMock = vi.fn().mockImplementation((doc: { _id?: ObjectId }) => {
      insertedDefaultId = doc._id ?? new ObjectId();
      return Promise.resolve({ insertedId: insertedDefaultId });
    });

    const mockDb = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === "reportJobs") {
          return {
            findOne: vi.fn().mockResolvedValue(mockJob),
            updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
          };
        }
        if (name === "reportTypes") {
          return { findOne: vi.fn().mockResolvedValue({ handlerKey: "watchlistreport" }) };
        }
        if (name === "watchlists") {
          return {
            find: vi.fn().mockReturnValue({
              sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(mockWatchlists) }),
            }),
            findOne: vi.fn().mockImplementation((q: { name?: string }) =>
              q?.name === "Default" && insertedDefaultId
                ? Promise.resolve({ _id: insertedDefaultId, name: "Default" })
                : Promise.resolve(null)
            ),
            insertOne: insertOneMock,
          };
        }
        if (name === "watchlist") {
          return {
            find: vi.fn().mockImplementation((q: Record<string, unknown>) => {
              const orClause = q.$or as Array<Record<string, unknown>> | undefined;
              const hasOrphanedQuery =
                orClause?.some(
                  (c) =>
                    typeof c === "object" &&
                    c !== null &&
                    "watchlistId" in c &&
                    typeof (c as { watchlistId: unknown }).watchlistId === "object" &&
                    (c as { watchlistId: Record<string, unknown> }).watchlistId !== null &&
                    "$exists" in (c as { watchlistId: Record<string, unknown> }).watchlistId
                ) ?? false;
              const isEmptyQuery = Object.keys(q).length === 0;
              const items = isEmptyQuery || hasOrphanedQuery ? orphanedItems : [];
              return { toArray: vi.fn().mockResolvedValue(items) };
            }),
            updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
            countDocuments: vi.fn().mockResolvedValue(1),
          };
        }
        if (name === "accounts") {
          return mockAccountsCollection();
        }
        if (name === "alertPreferences") {
          return { findOne: vi.fn().mockResolvedValue(mockPrefs) };
        }
        if (name === "alerts") {
          return {
            insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
            findOne: vi.fn().mockResolvedValue(null),
          };
        }
        return {};
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    const result = await executeJob(jobId.toString());

    expect(result.success).toBe(true);
    expect(insertOneMock).toHaveBeenCalled();
    const slackBody = JSON.parse(fetchMock.mock.calls[0][1]?.body ?? "{}");
    expect(slackBody.text).toContain("TSLA");
    expect(slackBody.text).not.toContain("No stocks on watchlist");
  });
});
