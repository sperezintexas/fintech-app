/**
 * One-off script to add a username to auth_users (X allowed usernames).
 * Usage (from repo root):
 *   node --env-file=.env.local apps/frontend/scripts/add-auth-user.mjs atxbogart
 * Or set MONGODB_URI and MONGODB_DB, then:
 *   node apps/frontend/scripts/add-auth-user.mjs atxbogart
 */
import { MongoClient } from "mongodb";

const COLLECTION = "auth_users";

async function main() {
  const username = process.argv[2]?.trim()?.toLowerCase();
  if (!username) {
    console.error("Usage: node add-auth-user.mjs <username>");
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  const dbName = process.env.MONGODB_DB || "myinvestments";

  const client = await MongoClient.connect(uri);
  try {
    const db = client.db(dbName);
    const existing = await db.collection(COLLECTION).findOne({ username });
    if (existing) {
      console.log(`Username "${username}" is already in auth_users.`);
      return;
    }
    await db.collection(COLLECTION).insertOne({
      username,
      createdAt: new Date(),
    });
    console.log(`Added "${username}" to auth_users.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
