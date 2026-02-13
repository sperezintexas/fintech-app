/**
 * Fidelity import config + test data (activities in importActOrders).
 * Fixtures: tests/data/fidelity/importActOrders (randomized, checked-in).
 * CLI with test data: pnpm run broker-import tests/data/fidelity/importActOrders/import-config.json [--preview]
 */

import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";
import { parseFidelityHoldingsCsv } from "../fidelity-holdings-csv";
import { parseFidelityActivitiesCsv } from "../fidelity-csv";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const CONFIG_DIR = path.join(REPO_ROOT, "tests", "data", "fidelity", "importActOrders");
const CONFIG_PATH = path.join(CONFIG_DIR, "import-config.json");

type ImportConfig = {
  holdings: { path: string; broker?: string };
  activities: { path: string; broker?: string; replaceExisting?: boolean };
  fidelity?: { holdingsDefaultAccountRef?: string };
};

function loadConfig(): ImportConfig {
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as ImportConfig;
}

function resolvePath(dir: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(dir, filePath);
}

describe("Fidelity import config + test data", () => {
  it("loads import-config.json with broker fidelity and activities path", () => {
    const config = loadConfig();
    expect(config.activities?.path).toBeDefined();
    expect(config.activities.broker).toBe("fidelity");
    if (config.holdings?.path) {
      expect(config.holdings.broker).toBe("fidelity");
    }
  });

  it("parses Positions CSV and produces one account with positions (when file present)", () => {
    const config = loadConfig();
    if (!config.holdings?.path) return;
    const holdingsPath = resolvePath(CONFIG_DIR, config.holdings.path);
    if (!fs.existsSync(holdingsPath)) return;
    const csv = fs.readFileSync(holdingsPath, "utf-8");
    const defaultRef = config.fidelity?.holdingsDefaultAccountRef ?? "1111";
    const result = parseFidelityHoldingsCsv(csv, defaultRef);
    expect(result.positions.length).toBeGreaterThanOrEqual(3);
  });

  it("parses Activity CSV and produces multiple accounts with activities", () => {
    const config = loadConfig();
    const activitiesPath = resolvePath(CONFIG_DIR, config.activities.path);
    expect(fs.existsSync(activitiesPath)).toBe(true);
    const csv = fs.readFileSync(activitiesPath, "utf-8");
    const result = parseFidelityActivitiesCsv(csv);
    expect(result.accounts.length).toBeGreaterThanOrEqual(2);
    const totalActivities = result.accounts.reduce((s, a) => s + a.activities.length, 0);
    expect(totalActivities).toBeGreaterThanOrEqual(5);
  });
});
