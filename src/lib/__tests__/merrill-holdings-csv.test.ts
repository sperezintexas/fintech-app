/**
 * Merrill Edge Holdings CSV parser test.
 * Fixture: data/merrill-test/Holdings_02092026.csv (IRA-Edge + Roth IRA-Edge).
 */

import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";
import { parseMerrillHoldingsCsv } from "../merrill-holdings-csv";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const FIXTURE = path.join(REPO_ROOT, "data", "merrill-test", "Holdings_02092026.csv");

describe("merrill-holdings-csv", () => {
  it("parses Holdings CSV into two accounts with positions", () => {
    const csv = fs.readFileSync(FIXTURE, "utf-8");
    const result = parseMerrillHoldingsCsv(csv);
    expect(result.accounts).toHaveLength(2);

    const ira = result.accounts.find((a) => a.accountRef === "51X-98940");
    const roth = result.accounts.find((a) => a.accountRef === "79Z-79494");
    expect(ira).toBeDefined();
    expect(roth).toBeDefined();
    expect(ira!.label).toBe("IRA-Edge");
    expect(roth!.label).toBe("Roth IRA-Edge");

    expect(ira!.positions.length).toBe(5);
    const iraCash = ira!.positions.find((p) => p.type === "cash");
    const iraStock = ira!.positions.find((p) => p.type === "stock" && p.ticker === "TSLA");
    const iraOption = ira!.positions.find((p) => p.type === "option");
    expect(iraCash).toBeDefined();
    expect(iraStock?.shares).toBe(500);
    expect(iraOption).toBeDefined();

    expect(roth!.positions.length).toBe(1);
    expect(roth!.positions[0].type).toBe("cash");
    expect(roth!.positions[0].ticker).toBe("IIAXX");
  });
});
