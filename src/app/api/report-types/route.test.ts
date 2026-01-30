import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, REPORT_HANDLER_KEYS } from "./route";
import { getDb } from "@/lib/mongodb";

vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn(),
}));

const mockReportTypes = [
  { _id: { toString: () => "1" }, id: "smartxai", handlerKey: "smartxai", name: "SmartXAI Report", enabled: true },
  { _id: { toString: () => "2" }, id: "deliverAlerts", handlerKey: "deliverAlerts", name: "Deliver Alerts", enabled: true },
  { _id: { toString: () => "3" }, id: "coveredCallScanner", handlerKey: "coveredCallScanner", name: "Covered Call Scanner", enabled: true },
];

describe("GET /api/report-types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns report types including deliverAlerts and scanner types", async () => {
    const mockColl = {
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue(mockReportTypes),
        }),
      }),
      findOne: vi.fn().mockResolvedValue({ id: "exists" }), // ensureDefaultReportTypes skips insert
      insertOne: vi.fn().mockResolvedValue({ insertedId: "new" }),
    };
    const mockDb = {
      collection: vi.fn().mockReturnValue(mockColl),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    const req = new NextRequest("http://localhost/api/report-types?all=true");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((t: { id: string }) => t.id === "deliverAlerts")).toBe(true);
    expect(data.some((t: { id: string }) => t.id === "coveredCallScanner")).toBe(true);
    expect(data.some((t: { id: string }) => t.id === "smartxai")).toBe(true);
  });
});

describe("REPORT_HANDLER_KEYS", () => {
  it("includes deliverAlerts and scanner job types", () => {
    expect(REPORT_HANDLER_KEYS).toContain("deliverAlerts");
    expect(REPORT_HANDLER_KEYS).toContain("coveredCallScanner");
    expect(REPORT_HANDLER_KEYS).toContain("protectivePutScanner");
    expect(REPORT_HANDLER_KEYS).toContain("straddleStrangleScanner");
    expect(REPORT_HANDLER_KEYS).toContain("OptionScanner");
    expect(REPORT_HANDLER_KEYS).toContain("daily-analysis");
  });
});
