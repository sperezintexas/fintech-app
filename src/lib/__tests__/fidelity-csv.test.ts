/**
 * Fidelity Activity CSV parser test.
 * Inline fixture + optional tests/data/fidelity/FidelityActOrdersHistory.csv.
 */

import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";
import { parseFidelityCsv, parseFidelityActivitiesCsv, fidelityAccountToRef } from "../fidelity-csv";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const FIXTURE = path.join(REPO_ROOT, "tests", "data", "fidelity", "FidelityActOrdersHistory.csv");

const MINIMAL_CSV = `Date,Description,Symbol,Quantity,Price,Amount,Cash Balance,Security Description,Commission,Fees,Account
Feb-4-2026,YOU BOUGHT,RDW,500,10.19,"-5,092.50","+1,638.26",REDWIRE CORPORATION COM,--,--,Individual - TOD *0196
Feb-2-2026,YOU SOLD OPENING TRANSACTION,CIFR260227P15,-1,1.51,150.33,"+6,708.52",PUT (CIFR),0.65,0.02,Individual - TOD *0196
Jan-30-2026,DIVIDEND RECEIVED,SPAXX,--,--,0.93,+327.73,FIDELITY GOVERNMENT MONEY MARKET,--,--,Rollover IRA *8941`;

describe("fidelity-csv", () => {
  it("extracts accountRef from Account column", () => {
    expect(fidelityAccountToRef("Individual - TOD *0196")).toBe("0196");
    expect(fidelityAccountToRef("Rollover IRA *8941")).toBe("8941");
    expect(fidelityAccountToRef("Cash Management (Joint WROS - TOD) *6930")).toBe("6930");
    expect(fidelityAccountToRef("No asterisk")).toBe("No asterisk");
  });

  it("parses Activity CSV into accounts with activities", () => {
    const result = parseFidelityCsv(MINIMAL_CSV);
    expect(result.accounts.length).toBeGreaterThanOrEqual(2);

    const accountRefs = result.accounts.map((a) => a.accountRef);
    expect(accountRefs).toContain("0196");
    expect(accountRefs).toContain("8941");

    const individual = result.accounts.find((a) => a.accountRef === "0196");
    expect(individual).toBeDefined();
    const rdwBuy = individual!.activities.find((e) => e.symbol === "RDW" && e.type === "BUY");
    expect(rdwBuy?.quantity).toBe(500);
    expect(rdwBuy?.unitPrice).toBe(10.19);
  });

  it("parses full Activity file when present (FidelityActOrdersHistory or Activity_All_Accounts format)", () => {
    if (!fs.existsSync(FIXTURE)) return;
    const csv = fs.readFileSync(FIXTURE, "utf-8");
    const result = parseFidelityActivitiesCsv(csv);
    expect(result.accounts.length).toBeGreaterThanOrEqual(2);
    const totalActivities = result.accounts.reduce((s, a) => s + a.activities.length, 0);
    expect(totalActivities).toBeGreaterThanOrEqual(5);
  });

  it("returns parseError when header row is missing", () => {
    const result = parseFidelityCsv("no date column\n1,2,3");
    expect(result.accounts).toHaveLength(0);
    expect(result.parseError).toBeDefined();
  });
});
