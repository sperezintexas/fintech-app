import { MongoClient, Db } from "mongodb";

export function getMongoUri(): string {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  if (process.env.MONGODB_URI_B64) {
    return Buffer.from(process.env.MONGODB_URI_B64, "base64").toString("utf8");
  }
  return "mongodb://localhost:27017";
}

const MONGODB_URI = getMongoUri();
const MONGODB_DB = process.env.MONGODB_DB || "SmartTrader";

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<{
  client: MongoClient;
  db: Db;
}> {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB);

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

export async function getDb(): Promise<Db> {
  const { db } = await connectToDatabase();
  return db;
}
