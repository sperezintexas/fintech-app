/**
 * Fidelity import config + test data (Positions + Activity).
 * Validates that both files parse and produce expected structure for broker import.
 * Run import from CLI: pnpm run broker-import data/fidelity/import-config.json [--preview]
 */

import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";
import { parseFidelityHoldingsCsv } from "../fidelity-holdings-csv";
import { parseFidelityActivitiesCsv } from "../fidelity-csv";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const CONFIG_DIR = path.join(REPO_ROOT, "data", "fidelity");
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
      expect(config.fidelity?.holdingsDefaultAccountRef).toBe("0196");
    }
  });

  it("parses Positions CSV and produces one account with positions (when file present)", () => {
    const config = loadConfig();
    if (!config.holdings?.path) return;
    const holdingsPath = resolvePath(CONFIG_DIR, config.holdings.path);
    if (!fs.existsSync(holdingsPath)) return;
    const csv = fs.readFileSync(holdingsPath, "utf-8");
    const defaultRef = config.fidelity?.holdingsDefaultAccountRef ?? "";
    const result = parseFidelityHoldingsCsv(csv, defaultRef);
    expect(result.accountRef).toBe("0196");
    expect(result.positions.length).toBeGreaterThanOrEqual(5);
  });

  it("parses Activity CSV and produces multiple accounts with activities (when file present)", () => {
    const config = loadConfig();
    const activitiesPath = resolvePath(CONFIG_DIR, config.activities.path);
    if (!fs.existsSync(activitiesPath)) {
      return;
    }
    const csv = fs.readFileSync(activitiesPath, "utf-8");
    const result = parseFidelityActivitiesCsv(csv);
    expect(result.accounts.length).toBeGreaterThanOrEqual(2);
    const totalActivities = result.accounts.reduce((s, a) => s + a.activities.length, 0);
    expect(totalActivities).toBeGreaterThanOrEqual(5);
  });
});
