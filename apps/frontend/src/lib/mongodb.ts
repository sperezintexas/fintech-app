import { MongoClient, Db, MongoClientOptions } from "mongodb";
import { getEnv } from "@/lib/env";

export function getMongoUri(): string {
  return getEnv().MONGODB_URI;
}

export function getMongoDbName(): string {
  return getEnv().MONGODB_DB;
}

/**
 * Options for MongoClient when used by Agenda (smart-scheduler, scheduler).
 * Force IPv4 to avoid TLS "internal error" (alert 80) and ReplicaSetNoPrimary
 * when connecting to Atlas or managed MongoDB from containers (Node 17+ may prefer IPv6).
 */
export function getMongoClientOptions(): MongoClientOptions {
  return {
    family: 4,
    serverSelectionTimeoutMS: 15_000,
  };
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
