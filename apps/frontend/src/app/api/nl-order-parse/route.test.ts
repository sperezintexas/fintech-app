import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

const mockParse = vi.fn();
const mockBuildPrefill = vi.fn();

vi.mock("@/lib/xai-grok", () => ({
  parseNaturalLanguageOrder: (...args: unknown[]) => mockParse(...args),
}));
vi.mock("@/lib/strategy-builder", () => ({
  buildOrderFromParsed: (order: unknown) => mockBuildPrefill(order),
}));

describe("POST /api/nl-order-parse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when nl is missing", async () => {
    const req = new Request("http://localhost/api/nl-order-parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as never);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBeDefined();
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("returns ok and order+prefill when parse succeeds", async () => {
    const order = {
      action: "SELL_NEW_CALL",
      ticker: "TSLA",
      optionType: "call",
      strike: 450,
      expiration: "2026-02-21",
      contracts: 1,
    };
    const prefill = {
      symbol: "TSLA",
      strike: 450,
      expiration: "2026-02-21",
      contractType: "call" as const,
      quantity: 1,
      strategyId: "covered-call",
      action: "sell" as const,
      rollToStrike: null,
      rollToExpiration: null,
    };
    mockParse.mockResolvedValue({ ok: true, order });
    mockBuildPrefill.mockReturnValue(prefill);

    const req = new Request("http://localhost/api/nl-order-parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nl: "Sell TSLA 450 call Feb 21" }),
    });
    const res = await POST(req as never);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.order).toEqual(order);
    expect(data.prefill).toEqual(prefill);
    expect(mockParse).toHaveBeenCalledWith("Sell TSLA 450 call Feb 21");
  });

  it("returns ok: false and error when parse fails", async () => {
    mockParse.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Invalid action" },
    });

    const req = new Request("http://localhost/api/nl-order-parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nl: "do something weird" }),
    });
    const res = await POST(req as never);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(false);
    expect(data.error).toBeDefined();
    expect(data.error.message).toBe("Invalid action");
  });
});
