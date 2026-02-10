/**
 * Merrill Edge Holdings CSV → parseMerrillHoldingsCsv().
 * Fixture: tests/data/merrill/Holdings.csv (randomized, checked-in).
 */

import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";
import { parseMerrillHoldingsCsv } from "../merrill-holdings-csv";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const FIXTURE = path.join(REPO_ROOT, "tests", "data", "merrill", "Holdings.csv");

describe("merrill-holdings-csv", () => {
  it("parses Holdings CSV into two accounts with positions", () => {
    const csv = fs.readFileSync(FIXTURE, "utf-8");
    const result = parseMerrillHoldingsCsv(csv);
    expect(result.accounts).toHaveLength(2);

    const ira = result.accounts.find((a) => a.accountRef === "AA-11111");
    const roth = result.accounts.find((a) => a.accountRef === "BB-22222");
    expect(ira).toBeDefined();
    expect(roth).toBeDefined();
    expect(ira!.label).toBe("IRA-Edge");
    expect(roth!.label).toBe("Roth IRA-Edge");

    expect(ira!.positions.length).toBe(5);
    const iraCash = ira!.positions.find((p) => p.type === "cash");
    const iraStock = ira!.positions.find((p) => p.type === "stock" && p.ticker === "XYZ");
    const iraOption = ira!.positions.find((p) => p.type === "option");
    expect(iraCash).toBeDefined();
    expect(iraStock?.shares).toBe(500);
    expect(iraOption).toBeDefined();

    expect(roth!.positions.length).toBe(1);
    expect(roth!.positions[0].type).toBe("cash");
    expect(roth!.positions[0].ticker).toBe("IIAXX");
  });
});
