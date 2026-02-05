import { describe, it, expect, vi, beforeEach } from "vitest";
import { runUnifiedOptionsScanner } from "../unified-options-scanner";
import * as optionScanner from "../option-scanner";
import * as coveredCallAnalyzer from "../covered-call-analyzer";
import * as protectivePutAnalyzer from "../protective-put-analyzer";
import * as straddleStrangleAnalyzer from "../straddle-strangle-analyzer";

vi.mock("../option-scanner", () => ({
  scanOptions: vi.fn().mockResolvedValue([]),
  storeOptionRecommendations: vi.fn().mockResolvedValue({ stored: 0, alertsCreated: 0 }),
}));
vi.mock("../covered-call-analyzer", () => ({
  analyzeCoveredCalls: vi.fn().mockResolvedValue([]),
  storeCoveredCallRecommendations: vi.fn().mockResolvedValue({ stored: 0, alertsCreated: 0 }),
  getCoveredCallPositions: vi.fn().mockResolvedValue({
    pairs: [],
    opportunities: [],
    standaloneCalls: [],
  }),
}));
vi.mock("../protective-put-analyzer", () => ({
  analyzeProtectivePuts: vi.fn().mockResolvedValue([]),
  storeProtectivePutRecommendations: vi.fn().mockResolvedValue({ stored: 0, alertsCreated: 0 }),
  getProtectivePutPositions: vi.fn().mockResolvedValue({ pairs: [], opportunities: [] }),
}));
vi.mock("../straddle-strangle-analyzer", () => ({
  analyzeStraddlesAndStrangles: vi.fn().mockResolvedValue([]),
  storeStraddleStrangleRecommendations: vi.fn().mockResolvedValue({ stored: 0, alertsCreated: 0 }),
}));

describe("Unified Options Scanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(optionScanner.scanOptions).mockResolvedValue([]);
    vi.mocked(optionScanner.storeOptionRecommendations).mockResolvedValue({ stored: 0, alertsCreated: 0 });
  });

  it("runs all four scanners in parallel and returns combined result", async () => {
    vi.mocked(optionScanner.scanOptions).mockResolvedValue([{ positionId: "1" }] as never[]);
    vi.mocked(optionScanner.storeOptionRecommendations).mockResolvedValue({
      stored: 1,
      alertsCreated: 1,
    });

    const result = await runUnifiedOptionsScanner("acc1");

    expect(optionScanner.scanOptions).toHaveBeenCalledWith("acc1", undefined);
    expect(coveredCallAnalyzer.analyzeCoveredCalls).toHaveBeenCalledWith(
      "acc1",
      undefined,
      expect.any(Map)
    );
    expect(protectivePutAnalyzer.analyzeProtectivePuts).toHaveBeenCalledWith(
      "acc1",
      undefined,
      expect.any(Map)
    );
    expect(straddleStrangleAnalyzer.analyzeStraddlesAndStrangles).toHaveBeenCalledWith("acc1");

    expect(result.optionScanner.scanned).toBe(1);
    expect(result.optionScanner.stored).toBe(1);
    expect(result.optionScanner.alertsCreated).toBe(1);
    expect(result.totalScanned).toBe(1);
    expect(result.totalStored).toBe(1);
    expect(result.totalAlertsCreated).toBe(1);
  });

  it("passes nested config to each scanner (validated and merged)", async () => {
    const config = {
      optionScanner: { holdDteMin: 21 },
      coveredCall: { minPremium: 1.5 },
      protectivePut: { minYield: 25 },
    };

    await runUnifiedOptionsScanner("acc2", config);

    expect(optionScanner.scanOptions).toHaveBeenCalledWith("acc2", { holdDteMin: 21 });
    expect(coveredCallAnalyzer.analyzeCoveredCalls).toHaveBeenCalledWith(
      "acc2",
      { minPremium: 1.5 },
      expect.any(Map)
    );
    expect(protectivePutAnalyzer.analyzeProtectivePuts).toHaveBeenCalledWith(
      "acc2",
      { minYield: 25 },
      expect.any(Map)
    );
  });

  it("returns zeros when no positions", async () => {
    const result = await runUnifiedOptionsScanner();

    expect(result.totalScanned).toBe(0);
    expect(result.totalStored).toBe(0);
    expect(result.totalAlertsCreated).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("continues after a scanner throws and returns partial result with errors", async () => {
    vi.mocked(optionScanner.scanOptions).mockRejectedValue(new Error("Yahoo API down"));
    vi.mocked(coveredCallAnalyzer.analyzeCoveredCalls).mockResolvedValue([]);
    vi.mocked(protectivePutAnalyzer.analyzeProtectivePuts).mockResolvedValue([]);
    vi.mocked(straddleStrangleAnalyzer.analyzeStraddlesAndStrangles).mockResolvedValue([]);

    const result = await runUnifiedOptionsScanner("acc1");

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toEqual({ scanner: "optionScanner", message: "Yahoo API down" });
    expect(result.optionScanner.scanned).toBe(0);
    expect(result.totalScanned).toBe(0);
    expect(result.totalStored).toBe(0);
  });
});
