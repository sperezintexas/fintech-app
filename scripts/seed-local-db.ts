/**
 * Verify and create app collections in local MongoDB; seed auth_users with atxbogart.
 * Run from repo root. Loads .env.local for MONGODB_URI or MONGODB_URI_B64, and MONGODB_DB.
 *
 * Usage: pnpm run seed-local-db
 * Or:    node -r ts-node/register -r tsconfig-paths/register scripts/seed-local-db.ts
 */

/** Expects MONGODB_URI_B64 (or MONGODB_URI) and MONGODB_DB. */
function getMongoUri(): string {
  if (process.env.MONGODB_URI_B64?.trim()) {
    return Buffer.from(process.env.MONGODB_URI_B64.trim(), "base64").toString("utf8");
  }
  if (process.env.MONGODB_URI?.trim()) return process.env.MONGODB_URI.trim();
  return "mongodb://localhost:27017";
}

import * as fs from "fs";
import * as path from "path";
import { MongoClient } from "mongodb";

const REQUIRED_COLLECTIONS = [
  "portfolios",
  "accounts",
  "activities",
  "alerts",
  "alertConfigs",
  "alertPreferences",
  "scheduledAlerts",
  "watchlist",
  "watchlists",
  "reportTypes",
  "reportJobs",
  "pushSubscriptions",
  "smartXAIReports",
  "portfolioSummaryReports",
  "coveredCallRecommendations",
  "protectivePutRecommendations",
  "optionRecommendations",
  "straddleStrangleRecommendations",
  "auth_users",
  "login_successes",
  "login_failures",
  "security_alerts",
  "symbols",
];

const AUTH_SEED_USERNAME = "atxbogart";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.warn(".env.local not found; using process.env (e.g. MONGODB_URI, MONGODB_URI_B64, MONGODB_DB)");
    return;
  }
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const uri = getMongoUri();
  const dbName = process.env.MONGODB_DB?.trim() || "SmartTrader";

  console.log("Connecting to", uri.replace(/:[^:@]+@/, ":***@"), "db:", dbName);
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const existing = new Set(await db.listCollections().map((c) => c.name).toArray());

    let created = 0;
    for (const name of REQUIRED_COLLECTIONS) {
      if (existing.has(name)) {
        console.log("  OK", name);
      } else {
        await db.createCollection(name);
        existing.add(name);
        created++;
        console.log("  CREATED", name);
      }
    }
    console.log("Required collections: %d total, %d already existed, %d created.", REQUIRED_COLLECTIONS.length, REQUIRED_COLLECTIONS.length - created, created);

    const authColl = db.collection("auth_users");
    const username = AUTH_SEED_USERNAME.toLowerCase();
    const existingUser = await authColl.findOne({ username });
    if (existingUser) {
      console.log("Auth user '%s' already present.", username);
    } else {
      await authColl.insertOne({ username, createdAt: new Date() });
      console.log("Seeded auth_users with username '%s'.", username);
    }
  } finally {
    await client.close();
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
