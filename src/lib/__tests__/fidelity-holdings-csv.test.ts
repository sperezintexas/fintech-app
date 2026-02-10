/**
 * Fidelity Positions CSV parser test.
 * Inline fixture + optional tests/data/fidelity/importActOrders/Positions_All_Accounts.csv (not present; inline only).
 */

import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";
import { parseFidelityHoldingsCsv } from "../fidelity-holdings-csv";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const FIXTURE = path.join(REPO_ROOT, "tests", "data", "fidelity", "importActOrders", "Positions_All_Accounts.csv");

const MINIMAL_CSV = `Symbol,Quantity,Last,$ Avg Cost,Value
Cash (FCASH),"1,638.26",1.00,1,1638.26
RDW,500,9.65,10.19,4825
CIFR260227P15,-1,0.78,1.5,-87
Cash (SPAXX),"2,761.66",1.00,1,2761.66
RDW260227P9,-10,0.70,0.84,-750`;

describe("fidelity-holdings-csv", () => {
  it("parses Positions CSV into one account with positions", () => {
    const result = parseFidelityHoldingsCsv(MINIMAL_CSV, "0196");
    expect(result.accountRef).toBe("0196");
    expect(result.label).toBe("Fidelity (All Accounts)");
    expect(result.positions.length).toBeGreaterThanOrEqual(4);

    const cash = result.positions.filter((p) => p.type === "cash");
    const stock = result.positions.find((p) => p.type === "stock" && p.ticker === "RDW");
    const options = result.positions.filter((p) => p.type === "option");
    expect(cash.length).toBeGreaterThanOrEqual(2);
    expect(stock).toBeDefined();
    expect(stock?.shares).toBe(500);
    expect(options.length).toBeGreaterThanOrEqual(2);

    const rdwPut = result.positions.find((p) => p.type === "option" && p.ticker === "RDW");
    expect(rdwPut?.optionType).toBe("put");
    expect(rdwPut?.strike).toBe(9);
    expect(rdwPut?.expiration).toBe("2026-02-27");
  });

  it("uses defaultAccountRef for the single account", () => {
    const result = parseFidelityHoldingsCsv(MINIMAL_CSV, "8941");
    expect(result.accountRef).toBe("8941");
  });

  it("parses full Positions file when present", () => {
    if (!fs.existsSync(FIXTURE)) return;
    const csv = fs.readFileSync(FIXTURE, "utf-8");
    const result = parseFidelityHoldingsCsv(csv, "0196");
    expect(result.positions.length).toBeGreaterThanOrEqual(5);
  });

  it("returns parseError when header row is missing", () => {
    const result = parseFidelityHoldingsCsv("no header here\n1,2,3", "0196");
    expect(result.positions).toHaveLength(0);
    expect(result.parseError).toBeDefined();
  });
});
