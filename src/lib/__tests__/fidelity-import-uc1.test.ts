/**
 * Fidelity import (Act Orders): test case using FidelityActOrdersHistory.csv.
 * Fixtures: tests/data/fidelity/importActOrders (randomized, checked-in).
 * CLI with test data: pnpm run broker-import tests/data/fidelity/importActOrders/import-config.json [--preview]
 */

import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";
import { parseFidelityActivitiesCsv } from "../fidelity-csv";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const CONFIG_DIR = path.join(REPO_ROOT, "tests", "data", "fidelity", "importActOrders");
const CONFIG_PATH = path.join(CONFIG_DIR, "import-config.json");
const FIXTURE = path.join(CONFIG_DIR, "FidelityActOrdersHistory.csv");

type ImportConfig = {
  activities: { path: string; broker?: string; recomputePositions?: boolean; replaceExisting?: boolean };
};

function loadConfig(): ImportConfig {
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as ImportConfig;
}

describe("Fidelity import Act Orders (FidelityActOrdersHistory.csv)", () => {
  it("loads importActOrders import-config.json with activities path", () => {
    const config = loadConfig();
    expect(config.activities?.path).toBe("FidelityActOrdersHistory.csv");
    expect(config.activities?.broker).toBe("fidelity");
  });

  it("parses FidelityActOrdersHistory.csv into multiple accounts with activities", () => {
    expect(fs.existsSync(FIXTURE)).toBe(true);
    const csv = fs.readFileSync(FIXTURE, "utf-8");
    const result = parseFidelityActivitiesCsv(csv);
    expect(result.accounts.length).toBeGreaterThanOrEqual(2);
    const accountRefs = result.accounts.map((a) => a.accountRef);
    expect(accountRefs).toContain("1111");
    expect(accountRefs).toContain("3333");
    expect(accountRefs).toContain("4444");

    const totalActivities = result.accounts.reduce((s, a) => s + a.activities.length, 0);
    expect(totalActivities).toBeGreaterThanOrEqual(5);

    const individual = result.accounts.find((a) => a.accountRef === "1111");
    expect(individual).toBeDefined();
    const xyzSells = individual!.activities.filter((e) => e.symbol === "XYZ" && e.type === "SELL");
    expect(xyzSells.length).toBeGreaterThanOrEqual(2);
    const xyzBuy = individual!.activities.find((e) => e.symbol === "XYZ" && e.type === "BUY");
    expect(xyzBuy?.quantity).toBe(500);
    expect(xyzBuy?.unitPrice).toBe(10.19);
  });
});
