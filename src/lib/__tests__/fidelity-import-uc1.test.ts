/**
 * Fidelity import UC1: initial import and test case using FidelityActOrdersHistory.csv.
 * Format: Run Date, Account, Account Number, Action, Symbol, ... (same as FidelityAccounts).
 * Run: pnpm run broker-import data/fidelity/importUC1/import-config.json [--preview]
 */

import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";
import { parseFidelityActivitiesCsv } from "../fidelity-csv";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const CONFIG_DIR = path.join(REPO_ROOT, "data", "fidelity", "importUC1");
const CONFIG_PATH = path.join(CONFIG_DIR, "import-config.json");
const FIXTURE = path.join(CONFIG_DIR, "FidelityActOrdersHistory.csv");

type ImportConfig = {
  activities: { path: string; broker?: string; recomputePositions?: boolean; replaceExisting?: boolean };
};

function loadConfig(): ImportConfig {
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as ImportConfig;
}

describe("Fidelity import UC1 (FidelityActOrdersHistory.csv)", () => {
  it("loads importUC1 import-config.json with activities path", () => {
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
    expect(accountRefs).toContain("0196");
    expect(accountRefs).toContain("8941");
    expect(accountRefs).toContain("6930");
    expect(accountRefs).toContain("8837");

    const totalActivities = result.accounts.reduce((s, a) => s + a.activities.length, 0);
    expect(totalActivities).toBeGreaterThanOrEqual(15);

    const individual = result.accounts.find((a) => a.accountRef === "0196");
    expect(individual).toBeDefined();
    const tslaSells = individual!.activities.filter((e) => e.symbol === "TSLA" && e.type === "SELL");
    expect(tslaSells.length).toBeGreaterThanOrEqual(2);
    const rdwBuy = individual!.activities.find((e) => e.symbol === "RDW" && e.type === "BUY");
    expect(rdwBuy?.quantity).toBe(500);
    expect(rdwBuy?.unitPrice).toBe(10.19);
  });
});
