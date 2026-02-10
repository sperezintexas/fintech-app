/**
 * Merrill Edge Activities CSV → parseMerrillCsv().
 * Fixture: tests/data/merrill/Activities.csv (randomized, checked-in).
 */

import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";
import { parseMerrillCsv } from "../merrill-csv";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const FIXTURE_CSV = path.join(REPO_ROOT, "tests", "data", "merrill", "Activities.csv");

function loadCsv(): string {
  const raw = fs.readFileSync(FIXTURE_CSV, "utf-8");
  if (!raw || !raw.trim()) throw new Error("Activities.csv fixture is empty");
  return raw;
}

describe("merrill-csv (Merrill Edge Activities CSV)", () => {
  it("parses CSV and produces accounts with activities (symbol, date, type, quantity, unitPrice, optional option fields)", () => {
    const csv = loadCsv();
    const result = parseMerrillCsv(csv);

    expect(result.accounts.length).toBeGreaterThanOrEqual(1);
    for (const acc of result.accounts) {
      expect(acc.accountRef || acc.label).toBeTruthy();
      expect(Array.isArray(acc.activities)).toBe(true);
      for (const a of acc.activities) {
        expect(a).toHaveProperty("symbol");
        expect(a).toHaveProperty("date");
        expect(a).toHaveProperty("type");
        expect(a).toHaveProperty("quantity");
        expect(a).toHaveProperty("unitPrice");
        if (a.optionType != null) {
          expect(["call", "put"]).toContain(a.optionType);
          expect(a).toHaveProperty("strike");
          expect(a).toHaveProperty("expiration");
        }
      }
    }
  });

  it("produces exactly two accounts (IRA-Edge and Roth IRA-Edge) with expected refs", () => {
    const csv = loadCsv();
    const result = parseMerrillCsv(csv);

    expect(result.accounts).toHaveLength(2);
    const refs = result.accounts.map((a) => a.accountRef).sort();
    expect(refs).toEqual(["AA-11111", "BB-22222"]);
    const labels = result.accounts.map((a) => a.label);
    expect(labels).toContain("IRA-Edge");
    expect(labels).toContain("Roth IRA-Edge");
  });

  it("IRA-Edge account has 10+ activities and Roth IRA-Edge has 2", () => {
    const csv = loadCsv();
    const result = parseMerrillCsv(csv);
    const gotIra = result.accounts.find((a) => a.accountRef === "AA-11111");
    const gotRoth = result.accounts.find((a) => a.accountRef === "BB-22222");
    expect(gotIra?.activities.length).toBeGreaterThanOrEqual(10);
    expect(gotRoth?.activities).toHaveLength(2);
  });
});
