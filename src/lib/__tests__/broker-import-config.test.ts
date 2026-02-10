/**
 * E2E-style test: import config + Merrill test data (Holdings + Activities).
 * Fixtures: tests/data/merrill (randomized, checked-in).
 * CLI with test data: pnpm run broker-import tests/data/merrill/import-config.json [--preview]
 */

import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";
import { parseMerrillHoldingsCsv } from "../merrill-holdings-csv";
import { parseMerrillCsv } from "../merrill-csv";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const CONFIG_DIR = path.join(REPO_ROOT, "tests", "data", "merrill");
const CONFIG_PATH = path.join(CONFIG_DIR, "import-config.json");

type ImportConfig = {
  holdings: { path: string; broker?: string };
  activities: { path: string; broker?: string; recomputePositions?: boolean };
};

function loadConfig(): ImportConfig {
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as ImportConfig;
}

function resolvePath(dir: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(dir, filePath);
}

describe("broker import config + Merrill test data", () => {
  it("loads import-config.json with holdings and activities paths", () => {
    const config = loadConfig();
    expect(config.holdings?.path).toBeDefined();
    expect(config.activities?.path).toBeDefined();
    expect(config.holdings.broker ?? "merrill").toBe("merrill");
    expect(config.activities.broker ?? "merrill").toBe("merrill");
  });

  it("parses Holdings CSV and produces 2 accounts with 6 total positions", () => {
    const config = loadConfig();
    const holdingsPath = resolvePath(CONFIG_DIR, config.holdings.path);
    expect(fs.existsSync(holdingsPath)).toBe(true);
    const csv = fs.readFileSync(holdingsPath, "utf-8");
    const result = parseMerrillHoldingsCsv(csv);
    expect(result.accounts.length).toBeGreaterThanOrEqual(1);
    const totalPositions = result.accounts.reduce((s, a) => s + a.positions.length, 0);
    expect(totalPositions).toBeGreaterThanOrEqual(5);
    const accountRefs = result.accounts.map((a) => a.accountRef);
    expect(accountRefs).toContain("AA-11111");
  });

  it("parses Activities CSV and produces accounts with activities", () => {
    const config = loadConfig();
    const activitiesPath = resolvePath(CONFIG_DIR, config.activities.path);
    expect(fs.existsSync(activitiesPath)).toBe(true);
    const csv = fs.readFileSync(activitiesPath, "utf-8");
    const result = parseMerrillCsv(csv);
    expect(result.accounts.length).toBeGreaterThanOrEqual(1);
    const totalActivities = result.accounts.reduce((s, a) => s + (a.activities?.length ?? 0), 0);
    expect(totalActivities).toBeGreaterThanOrEqual(10);
  });
});
