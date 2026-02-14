/**
 * One-time or periodic: ensure MongoDB indexes exist for performance.
 * Run: npx tsx scripts/mongo-indexes.ts (set MONGODB_URI or MONGODB_URI_B64 and MONGODB_DB).
 */

import { MongoClient } from "mongodb";

function getMongoUri(): string {
  if (process.env.MONGODB_URI_B64?.trim()) {
    return Buffer.from(process.env.MONGODB_URI_B64.trim(), "base64").toString("utf8");
  }
  if (process.env.MONGODB_URI?.trim()) return process.env.MONGODB_URI.trim();
  return "";
}

const resolvedUri = getMongoUri();
const dbName = process.env.MONGODB_DB?.trim() || "myinvestments";

if (!resolvedUri) {
  console.error("Set MONGODB_URI_B64 or MONGODB_URI");
  process.exit(1);
}

async function main(): Promise<void> {
  const client = await MongoClient.connect(resolvedUri);
  const db = client.db(dbName);
  try {
    const accounts = db.collection("accounts");
    await accounts.createIndex({ portfolioId: 1 }, { background: true });
    await accounts.createIndex({ portfolioId: 1, "positions.ticker": 1 }, { background: true });
    console.log("accounts: indexes created (portfolioId, portfolioId+positions.ticker)");

    const alerts = db.collection("alerts");
    await alerts.createIndex({ createdAt: -1 }, { background: true });
    console.log("alerts: index created (createdAt -1)");

    const priceCache = db.collection("priceCache");
    await priceCache.createIndex({ symbol: 1 }, { unique: true, background: true });
    console.log("priceCache: index created (symbol unique)");

    const optionRecs = db.collection("optionRecommendations");
    await optionRecs.createIndex({ accountId: 1, createdAt: -1 }, { background: true });
    const coveredCallRecs = db.collection("coveredCallRecommendations");
    await coveredCallRecs.createIndex({ accountId: 1, createdAt: -1 }, { background: true });
    const protectivePutRecs = db.collection("protectivePutRecommendations");
    await protectivePutRecs.createIndex({ accountId: 1, createdAt: -1 }, { background: true });
    const straddleRecs = db.collection("straddleStrangleRecommendations");
    await straddleRecs.createIndex({ accountId: 1, createdAt: -1 }, { background: true });
    console.log("recommendation collections: index created (accountId, createdAt -1)");

    console.log("Done.");
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
