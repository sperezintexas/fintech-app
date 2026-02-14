/**
 * Export MongoDB accounts collection to CSV (one row per account).
 * Use for backup or to replicate accounts on another DB (e.g. after pointing app at .env.prod).
 *
 * Loads .env.local by default (local DB). Use ENV_FILE=.env.prod to export from remote.
 * Expects MONGODB_URI or MONGODB_URI_B64, and MONGODB_DB.
 * Run from repo root: pnpm run export-accounts-csv [outfile]
 *
 * Output: _id, name, accountRef, brokerType, balance, riskLevel, strategy, positionsCount, recommendationsCount
 */

import * as fs from "fs";
import * as path from "path";
import { MongoClient } from "mongodb";

/** Expects MONGODB_URI_B64 (or MONGODB_URI) and MONGODB_DB. */
function getMongoUri(): string {
  if (process.env.MONGODB_URI_B64?.trim()) {
    return Buffer.from(process.env.MONGODB_URI_B64.trim(), "base64").toString("utf8");
  }
  if (process.env.MONGODB_URI?.trim()) return process.env.MONGODB_URI.trim();
  return "mongodb://localhost:27017";
}

function loadEnv(): void {
  const envFile = process.env.ENV_FILE || ".env.local";
  const envPath = path.isAbsolute(envFile) ? envFile : path.join(process.cwd(), envFile);
  if (!fs.existsSync(envPath)) {
    console.warn(envFile + " not found; using process.env (MONGODB_URI, MONGODB_URI_B64, MONGODB_DB)");
    return;
  }
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

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function main(): Promise<void> {
  loadEnv();
  const uri = getMongoUri();
  const dbName = process.env.MONGODB_DB?.trim() || "myinvestments";
  const outFile =
    process.argv[2] || path.join(process.cwd(), "data", "accounts-export.csv");

  console.log("Connecting to", uri.replace(/:[^:@]+@/, ":***@"), "db:", dbName);
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const raw = await db.collection("accounts").find({}).toArray();

    const headers = [
      "_id",
      "name",
      "accountRef",
      "brokerType",
      "balance",
      "riskLevel",
      "strategy",
      "positionsCount",
      "recommendationsCount",
    ];
    const rows: string[][] = [headers];

    for (const a of raw) {
      const _id = a._id?.toString?.() ?? String(a._id);
      const positions = Array.isArray(a.positions) ? a.positions : [];
      const recommendations = Array.isArray(a.recommendations) ? a.recommendations : [];
      rows.push([
        escapeCsvField(_id),
        escapeCsvField(a.name ?? ""),
        escapeCsvField(a.accountRef ?? ""),
        escapeCsvField(a.brokerType ?? ""),
        escapeCsvField(a.balance ?? 0),
        escapeCsvField(a.riskLevel ?? ""),
        escapeCsvField(a.strategy ?? ""),
        escapeCsvField(positions.length),
        escapeCsvField(recommendations.length),
      ]);
    }

    const csv = rows.map((r) => r.join(",")).join("\n");
    const outDir = path.dirname(outFile);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, csv, "utf-8");
    console.log("Exported", raw.length, "accounts to", outFile);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
