/**
 * Broker import CLI: config-driven import of Holdings + Activities.
 * Broker export contains multiple accounts; mapping is via the accounts table (accountRef).
 * Create app accounts with matching accountRef (e.g. "51X-98940") so import can match by accountRef.
 *
 * Usage:
 *   pnpm run broker-import [config.json] [--preview[=out.json]]
 *   pnpm run broker-import data/merrill-test/import-config.json --preview
 *   pnpm run broker-import data/merrill-test/import-config.json
 *   ENV_FILE=.env.prod pnpm run broker-import data/merrill-test/import-config.json   # import into prod DB
 *
 * Config (JSON):
 *   holdings: { path: string, broker?: "merrill" | "fidelity" }
 *   activities: { path: string, broker?: "merrill" | "fidelity", recomputePositions?: boolean, replaceExisting?: boolean }
 *   replaceExisting: if true, delete existing activities for each account before importing (use for re-import).
 * Paths are relative to the config file directory.
 *
 * Mapping: Import inspects the accounts table and matches broker accountRef to account.accountRef.
 * Each broker account in the CSV is imported into the app account with that accountRef.
 * Broker accounts with no matching app account are skipped (and reported).
 *
 * --preview: Parse both files and write preview JSON. No DB.
 * Without --preview: Import holdings then activities per matched account; recompute positions for activities.
 */

import * as fs from "fs";
import * as path from "path";
import { ObjectId } from "mongodb";
import { parseMerrillHoldingsCsv } from "../apps/frontend/src/lib/merrill-holdings-csv";
import { parseMerrillCsv } from "../apps/frontend/src/lib/merrill-csv";
import { parseFidelityHoldingsCsv } from "../apps/frontend/src/lib/fidelity-holdings-csv";
import { parseFidelityActivitiesCsv } from "../apps/frontend/src/lib/fidelity-csv";
import { setAccountPositions, importActivitiesForAccount, deleteActivitiesForAccount } from "../apps/frontend/src/lib/activities";
import { getDb } from "../apps/frontend/src/lib/mongodb";
import type { Position, ActivityImportItem } from "../apps/frontend/src/types/portfolio";

type Broker = "merrill" | "fidelity";

type ImportConfig = {
  /** Optional. Omit for Fidelity activities-only import (positions recomputed from activities). */
  holdings?: {
    path: string;
    broker?: Broker;
  };
  activities: {
    path: string;
    broker?: Broker;
    recomputePositions?: boolean;
    replaceExisting?: boolean;
  };
  /** When broker is Fidelity, holdings file has no Account column; use this to map to one app account. */
  fidelity?: {
    holdingsDefaultAccountRef?: string;
  };
};

type ParsedAccount = {
  accountRef: string;
  label: string;
  activities?: unknown[];
  positions?: unknown[];
};

function loadEnv(): void {
  const envFile = process.env.ENV_FILE || ".env.local";
  const envPath = path.isAbsolute(envFile) ? envFile : path.join(process.cwd(), envFile);
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\"/g, '"');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function loadConfig(configPath: string): { config: ImportConfig; configDir: string } {
  const abs = path.isAbsolute(configPath) ? configPath : path.join(process.cwd(), configPath);
  if (!fs.existsSync(abs)) {
    console.error("Config file not found:", abs);
    process.exit(1);
  }
  const raw = fs.readFileSync(abs, "utf-8");
  const config = JSON.parse(raw) as ImportConfig;
  if (!config.activities?.path) {
    console.error("Config must have activities.path");
    process.exit(1);
  }
  return { config, configDir: path.dirname(abs) };
}

function resolvePath(configDir: string, filePath: string): string {
  const p = path.isAbsolute(filePath) ? filePath : path.join(configDir, filePath);
  if (!fs.existsSync(p)) {
    console.error("File not found:", p);
    process.exit(1);
  }
  return p;
}

function parseHoldings(csv: string, broker: Broker, fidelityDefaultAccountRef: string = ""): ParsedAccount[] {
  if (broker === "fidelity") {
    const result = parseFidelityHoldingsCsv(csv, fidelityDefaultAccountRef);
    if (result.parseError && result.positions.length === 0) {
      throw new Error(result.parseError);
    }
    return [{ accountRef: result.accountRef, label: result.label, positions: result.positions }];
  }
  const result = parseMerrillHoldingsCsv(csv);
  if (result.accounts.length === 0 && result.parseError) {
    throw new Error(result.parseError);
  }
  return result.accounts.map((a) => ({
    accountRef: a.accountRef,
    label: a.label,
    positions: a.positions,
  }));
}

function parseActivities(csv: string, broker: Broker): ParsedAccount[] {
  if (broker === "merrill") {
    const result = parseMerrillCsv(csv);
    return result.accounts.map((a) => ({
      accountRef: a.accountRef,
      label: a.label,
      activities: a.activities,
    }));
  }
  if (broker === "fidelity") {
    const result = parseFidelityActivitiesCsv(csv);
    if (result.parseError && result.accounts.length === 0) {
      throw new Error(result.parseError);
    }
    return result.accounts.map((a) => ({
      accountRef: a.accountRef,
      label: a.label,
      activities: a.activities,
    }));
  }
  return [];
}

function runPreview(configPath: string, previewOutPath: string | null): void {
  loadEnv();
  const { config, configDir } = loadConfig(configPath);
  const brokerA = (config.activities.broker ?? "merrill") as Broker;
  const activitiesPath = resolvePath(configDir, config.activities.path);
  const activitiesCsv = fs.readFileSync(activitiesPath, "utf-8");
  const activitiesAccounts = parseActivities(activitiesCsv, brokerA);

  let holdingsSection: { path: string; broker: Broker; accounts: Array<{ accountRef: string; label: string; positionCount: number; positions?: unknown[] }> } | null = null;
  if (config.holdings?.path) {
    const brokerH = (config.holdings.broker ?? "merrill") as Broker;
    const holdingsPath = resolvePath(configDir, config.holdings.path);
    const holdingsCsv = fs.readFileSync(holdingsPath, "utf-8");
    const fidelityDefaultRef = config.fidelity?.holdingsDefaultAccountRef ?? "";
    const holdingsAccounts = parseHoldings(holdingsCsv, brokerH, fidelityDefaultRef);
    holdingsSection = {
      path: config.holdings.path,
      broker: brokerH,
      accounts: holdingsAccounts.map((a) => ({
        accountRef: a.accountRef,
        label: a.label,
        positionCount: a.positions?.length ?? 0,
        positions: a.positions,
      })),
    };
  }

  const preview = {
    configPath,
    mappingNote: "Import matches broker accountRef to accounts.accountRef in DB",
    ...(holdingsSection ? { holdings: holdingsSection } : { holdings: null, holdingsNote: "No holdings file; positions will be recomputed from activities." }),
    activities: {
      path: config.activities.path,
      broker: brokerA,
      recomputePositions: config.activities.recomputePositions !== false,
      accounts: activitiesAccounts.map((a) => ({
        accountRef: a.accountRef,
        label: a.label,
        activityCount: a.activities?.length ?? 0,
        activities: a.activities,
      })),
    },
  };

  const json = JSON.stringify(preview, null, 2);
  if (previewOutPath) {
    fs.writeFileSync(previewOutPath, json, "utf-8");
    console.error("Preview written to", previewOutPath);
  } else {
    console.log(json);
  }
}

async function runImport(configPath: string): Promise<void> {
  loadEnv();
  console.error("Broker import: loading config and files...");
  const { config, configDir } = loadConfig(configPath);

  const brokerA = (config.activities.broker ?? "merrill") as Broker;
  const recomputePositions = config.activities.recomputePositions !== false;
  const activitiesPath = resolvePath(configDir, config.activities.path);
  const activitiesCsv = fs.readFileSync(activitiesPath, "utf-8");
  const activitiesAccounts = parseActivities(activitiesCsv, brokerA);

  let holdingsAccounts: ParsedAccount[] = [];
  if (config.holdings?.path) {
    const brokerH = (config.holdings.broker ?? "merrill") as Broker;
    const holdingsPath = resolvePath(configDir, config.holdings.path);
    const holdingsCsv = fs.readFileSync(holdingsPath, "utf-8");
    const fidelityDefaultRef = config.fidelity?.holdingsDefaultAccountRef ?? "";
    holdingsAccounts = parseHoldings(holdingsCsv, brokerH, fidelityDefaultRef);
  }

  console.error("Connecting to DB and resolving accountRef mapping...");
  const db = await getDb();
  type AccountRow = { _id: ObjectId; name?: string; accountRef?: string };
  const accounts = await db
    .collection<AccountRow>("accounts")
    .find({ accountRef: { $exists: true, $ne: "" } })
    .project({ _id: 1, name: 1, accountRef: 1 })
    .toArray();

  const refToId = new Map<string, string>();
  for (const a of accounts) {
    const id = (a._id as ObjectId).toString();
    const ref = (a.accountRef ?? "").trim();
    const name = (a.name ?? "").trim();
    if (ref) refToId.set(ref, id);
    if (name) refToId.set(name, id);
  }
  if (refToId.size === 0) {
    console.error("No accounts with accountRef found. Create accounts and set accountRef (e.g. 51X-98940) to match broker export.");
    process.exit(1);
  }

  function accountIdFor(accountRef: string, label: string): string | null {
    const id = refToId.get((accountRef ?? "").trim());
    if (id) return id;
    return refToId.get((label ?? "").trim()) ?? null;
  }

  const results: Array<{ accountRef: string; label: string; holdingsSet?: number; activitiesImported?: number; positionsCount?: number; skipped?: string }> = [];
  const accountRefsWithHoldings = new Set<string>();

  for (const acc of holdingsAccounts) {
    const accountId = accountIdFor(acc.accountRef, acc.label);
    if (!accountId) {
      results.push({ accountRef: acc.accountRef, label: acc.label, skipped: "No app account with matching accountRef" });
      console.error("Skip holdings:", acc.accountRef || acc.label, "- no matching accountRef in accounts table");
      continue;
    }
    const positions = (acc.positions ?? []) as Record<string, unknown>[];
    const positionDocs: Position[] = positions.map((p) => {
      const type = (p.type as string) || "stock";
      const ticker = String(p.ticker ?? "").toUpperCase();
      const pos: Position = {
        _id: new ObjectId().toString(),
        type: type as "stock" | "option" | "cash",
        ticker,
      };
      if (type === "stock") {
        pos.shares = Number(p.shares ?? 0);
        pos.purchasePrice = p.purchasePrice != null ? Number(p.purchasePrice) : undefined;
      }
      if (type === "option") {
        pos.contracts = Number(p.contracts ?? 0);
        pos.premium = p.premium != null ? Number(p.premium) : undefined;
        pos.optionType = p.optionType as "call" | "put" | undefined;
        pos.strike = p.strike != null ? Number(p.strike) : undefined;
        pos.expiration = typeof p.expiration === "string" ? p.expiration : undefined;
      }
      if (type === "cash") {
        pos.amount =
          p.shares != null ? Number(p.shares) * (p.purchasePrice != null ? Number(p.purchasePrice) : 1) : undefined;
      }
      return pos;
    });
    const updated = await setAccountPositions(accountId, positionDocs);
    if (updated) accountRefsWithHoldings.add(acc.accountRef || acc.label);
    results.push({
      accountRef: acc.accountRef,
      label: acc.label,
      holdingsSet: updated ? positionDocs.length : 0,
    });
    console.error("Holdings:", acc.accountRef || acc.label, "->", updated ? `${positionDocs.length} positions` : "failed");
  }

  for (const acc of activitiesAccounts) {
    const accountId = accountIdFor(acc.accountRef, acc.label);
    if (!accountId) {
      results.push({ accountRef: acc.accountRef, label: acc.label, skipped: "No app account with matching accountRef" });
      console.error("Skip activities:", acc.accountRef || acc.label, "- no matching accountRef in accounts table");
      continue;
    }
    const activities = (acc.activities ?? []) as ActivityImportItem[];
    const hadHoldingsThisRun = accountRefsWithHoldings.has(acc.accountRef || acc.label);
    const syncOnly = hadHoldingsThisRun;
    const replaceExisting = config.activities.replaceExisting === true;
    if (replaceExisting) {
      const deleted = await deleteActivitiesForAccount(accountId);
      console.error("Activities: replaced", deleted, "existing for", acc.accountRef || acc.label);
    }
    console.error("Activities:", acc.accountRef || acc.label, "->", activities.length, "from CSV");
    if (syncOnly) {
      console.error("  (sync only, positions from Holdings)");
    }
    const result = await importActivitiesForAccount(accountId, activities, syncOnly ? false : recomputePositions);
    if (result === null) {
      results.push({ accountRef: acc.accountRef, label: acc.label, skipped: "Account not found" });
      continue;
    }
    results.push({
      accountRef: acc.accountRef,
      label: acc.label,
      activitiesImported: result.imported,
      positionsCount: result.positionsCount,
    });
    console.error("Activities:", acc.accountRef || acc.label, "->", result.imported, "imported, positions:", result.positionsCount);
  }

  const summary = {
    done: true,
    holdingsProcessed: holdingsAccounts.length,
    activitiesProcessed: activitiesAccounts.length,
    results,
  };
  console.log(JSON.stringify(summary));
  console.error("Broker import complete.");
}

function main(): void {
  const args = process.argv.slice(2);
  const configArg = args.find((a) => !a.startsWith("--"));
  const previewArg = args.find((a) => a === "--preview" || a.startsWith("--preview="));
  const configPath = configArg ?? path.join(process.cwd(), "data", "merrill-test", "import-config.json");

  if (previewArg) {
    const outPath = previewArg === "--preview" ? null : previewArg.slice("--preview=".length);
    runPreview(configPath, outPath || null);
    return;
  }

  runImport(configPath)
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("Broker import failed:", err);
      process.exit(1);
    });
}

main();
