import { MongoClient, Db } from "mongodb";
import { getEnv } from "@/lib/env";

export function getMongoUri(): string {
  return getEnv().MONGODB_URI;
}

export function getMongoDbName(): string {
  return getEnv().MONGODB_DB;
}

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<{
  client: MongoClient;
  db: Db;
}> {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const uri = getMongoUri();
  const dbName = getMongoDbName();
  const client = await MongoClient.connect(uri);
  const db = client.db(dbName);

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

export async function getDb(): Promise<Db> {
  const { db } = await connectToDatabase();
  return db;
}
