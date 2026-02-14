/**
 * One-time setup: delete all users, accounts, portfolios and dependent data;
 * then seed auth_users and create the initial portfolio from config/seed-defaults.json.
 *
 * Run from repo root. Loads .env.local for MONGODB_URI (or MONGODB_URI_B64) and MONGODB_DB.
 *
 * Usage: pnpm run one-time-setup
 */

import * as fs from "fs";
import * as path from "path";
import { MongoClient } from "mongodb";

function getMongoUri(): string {
  if (process.env.MONGODB_URI_B64?.trim()) {
    return Buffer.from(process.env.MONGODB_URI_B64.trim(), "base64").toString("utf8");
  }
  if (process.env.MONGODB_URI?.trim()) return process.env.MONGODB_URI.trim();
  return "mongodb://localhost:27017";
}

type SeedDefaults = {
  defaultUser: string;
  defaultPortfolioName: string;
  defaultAccountName: string;
  defaultBrokerType: string;
};

const FALLBACKS: SeedDefaults = {
  defaultUser: "atxbogart",
  defaultPortfolioName: "Default",
  defaultAccountName: "Default",
  defaultBrokerType: "Merrill",
};

function loadSeedDefaults(): SeedDefaults {
  const cwd = process.cwd();
  const pathsToTry = [
    path.join(cwd, "config", "seed-defaults.json"),
    path.join(cwd, "..", "config", "seed-defaults.json"),
  ];
  for (const p of pathsToTry) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf-8");
        const data = JSON.parse(raw) as Partial<SeedDefaults>;
        return {
          defaultUser:
            typeof data.defaultUser === "string" && data.defaultUser.trim()
              ? data.defaultUser.trim()
              : FALLBACKS.defaultUser,
          defaultPortfolioName:
            typeof data.defaultPortfolioName === "string" && data.defaultPortfolioName.trim()
              ? data.defaultPortfolioName.trim()
              : FALLBACKS.defaultPortfolioName,
          defaultAccountName:
            typeof data.defaultAccountName === "string"
              ? data.defaultAccountName.trim()
              : FALLBACKS.defaultAccountName,
          defaultBrokerType:
            typeof data.defaultBrokerType === "string" && data.defaultBrokerType.trim()
              ? data.defaultBrokerType.trim()
              : FALLBACKS.defaultBrokerType,
        };
      }
    } catch {
      // ignore
    }
  }
  return FALLBACKS;
}

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.warn(".env.local not found; using process.env");
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

/** Collections to wipe (order: dependents first). */
const COLLECTIONS_TO_WIPE = [
  "activities",
  "alerts",
  "alertPreferences",
  "scheduledAlerts",
  "reportJobs",
  "watchlist",
  "accounts",
  "portfolios",
  "userSettings",
  "auth_users",
];

async function main(): Promise<void> {
  loadEnvLocal();
  const uri = getMongoUri();
  const dbName = process.env.MONGODB_DB?.trim() || "SmartTrader";
  const defaults = loadSeedDefaults();

  console.log("One-time setup: wipe users, accounts, portfolios; then seed from config.");
  console.log("Config:", defaults);
  console.log("Connecting to", uri.replace(/:[^:@]+@/, ":***@"), "db:", dbName);

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);

    for (const name of COLLECTIONS_TO_WIPE) {
      const coll = db.collection(name);
      const deleted = await coll.deleteMany({});
      console.log("  Deleted", deleted.deletedCount, name);
    }

    const defaultUser = defaults.defaultUser.trim().toLowerCase();
    await db.collection("auth_users").insertOne({
      username: defaultUser,
      createdAt: new Date(),
    });
    console.log("  Seeded auth_users with username:", defaultUser);

    const now = new Date();
    const portfolio = {
      name: defaults.defaultPortfolioName,
      ownerId: defaultUser,
      ownerXHandle: defaultUser,
      authorizedUserIds: [defaultUser],
      authorizedUsers: [defaultUser],
      defaultAccountName: defaults.defaultAccountName || undefined,
      defaultBrokerName: defaults.defaultBrokerType || undefined,
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection("portfolios").insertOne(portfolio);
    const portfolioId = result.insertedId.toString();
    console.log("  Created initial portfolio:", portfolioId, portfolio.name);

    console.log("Done. When", defaultUser, "logs in, they will see this portfolio.");
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
