/**
 * One-time setup: add MongoDB schema validators to alerts and recommendation collections.
 * Ensures bad or partial documents are rejected at insert time.
 *
 * Expects MONGODB_URI_B64 (or MONGODB_URI) and MONGODB_DB in env.
 * Run: node --env-file=.env.local --import=tsx scripts/mongo-validators.ts
 *
 * Uses collMod for existing collections. If a collection does not exist, it is created with the validator.
 */

import { MongoClient, Db } from "mongodb";

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

/** Alerts: required symbol, recommendation, reason, createdAt, acknowledged. All other fields optional. */
const alertsValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["symbol", "recommendation", "reason", "createdAt", "acknowledged"],
    properties: {
      symbol: { bsonType: "string" },
      recommendation: { bsonType: "string" },
      reason: { bsonType: "string" },
      createdAt: { bsonType: "string" },
      acknowledged: { bsonType: "bool" },
    },
  },
};

/** optionRecommendations: required fields per OptionRecommendation + storedAt optional. */
const optionRecommendationsValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "positionId",
      "accountId",
      "symbol",
      "underlyingSymbol",
      "strike",
      "expiration",
      "optionType",
      "contracts",
      "recommendation",
      "reason",
      "metrics",
      "createdAt",
    ],
    properties: {
      positionId: { bsonType: "string" },
      accountId: { bsonType: "string" },
      symbol: { bsonType: "string" },
      underlyingSymbol: { bsonType: "string" },
      strike: { bsonType: "number" },
      expiration: { bsonType: "string" },
      optionType: { enum: ["call", "put"] },
      contracts: { bsonType: "number" },
      recommendation: { enum: ["HOLD", "BUY_TO_CLOSE"] },
      reason: { bsonType: "string" },
      metrics: { bsonType: "object" },
      createdAt: { bsonType: "string" },
    },
  },
};

/** coveredCallRecommendations: required per CoveredCallRecommendation. */
const coveredCallRecommendationsValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["accountId", "symbol", "source", "recommendation", "confidence", "reason", "metrics", "createdAt"],
    properties: {
      accountId: { bsonType: "string" },
      symbol: { bsonType: "string" },
      source: { enum: ["holdings", "watchlist"] },
      recommendation: { enum: ["HOLD", "BUY_TO_CLOSE", "SELL_NEW_CALL", "ROLL", "NONE"] },
      confidence: { enum: ["HIGH", "MEDIUM", "LOW"] },
      reason: { bsonType: "string" },
      metrics: { bsonType: "object" },
      createdAt: { bsonType: "string" },
    },
  },
};

/** protectivePutRecommendations: required per ProtectivePutRecommendation. */
const protectivePutRecommendationsValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["accountId", "symbol", "recommendation", "confidence", "reason", "metrics", "createdAt"],
    properties: {
      accountId: { bsonType: "string" },
      symbol: { bsonType: "string" },
      recommendation: { enum: ["HOLD", "SELL_TO_CLOSE", "ROLL", "BUY_NEW_PUT", "NONE"] },
      confidence: { enum: ["HIGH", "MEDIUM", "LOW"] },
      reason: { bsonType: "string" },
      metrics: { bsonType: "object" },
      createdAt: { bsonType: "string" },
    },
  },
};

/** straddleStrangleRecommendations: required per StraddleStrangleRecommendation. */
const straddleStrangleRecommendationsValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["accountId", "symbol", "isStraddle", "recommendation", "confidence", "reason", "metrics", "createdAt"],
    properties: {
      accountId: { bsonType: "string" },
      symbol: { bsonType: "string" },
      isStraddle: { bsonType: "bool" },
      recommendation: { enum: ["HOLD", "SELL_TO_CLOSE", "ROLL", "ADD", "NONE"] },
      confidence: { enum: ["HIGH", "MEDIUM", "LOW"] },
      reason: { bsonType: "string" },
      metrics: { bsonType: "object" },
      createdAt: { bsonType: "string" },
    },
  },
};

type ValidatorSpec = { name: string; validator: Record<string, unknown> };

const specs: ValidatorSpec[] = [
  { name: "alerts", validator: alertsValidator },
  { name: "optionRecommendations", validator: optionRecommendationsValidator },
  { name: "coveredCallRecommendations", validator: coveredCallRecommendationsValidator },
  { name: "protectivePutRecommendations", validator: protectivePutRecommendationsValidator },
  { name: "straddleStrangleRecommendations", validator: straddleStrangleRecommendationsValidator },
];

async function applyValidator(db: Db, spec: ValidatorSpec): Promise<void> {
  const { name, validator } = spec;
  try {
    const collections = await db.listCollections({ name }).toArray();
    if (collections.length === 0) {
      await db.createCollection(name, { validator, validationLevel: "strict" });
      console.log(`Created collection "${name}" with validator.`);
    } else {
      await db.command({
        collMod: name,
        validator,
        validationLevel: "strict",
      });
      console.log(`Updated validator for collection "${name}".`);
    }
  } catch (e) {
    console.error(`Failed to apply validator for "${name}":`, e);
    throw e;
  }
}

async function main(): Promise<void> {
  const client = await MongoClient.connect(resolvedUri);
  const db = client.db(dbName);
  try {
    for (const spec of specs) {
      await applyValidator(db, spec);
    }
    console.log("Done.");
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
