/**
 * Access keys: key-based auth. Keys stored hashed in MongoDB.
 * Optional env ACCESS_KEY_SEED for bootstrap (exact match).
 */

import type { OptionalId } from "mongodb";
import { getDb } from "./mongodb";
import { createHash, randomBytes } from "crypto";

const COLLECTION = "accessKeys";
const KEY_BYTES = 32;
const HASH_ALG = "sha256";

function hashKey(key: string): string {
  return createHash(HASH_ALG).update(key.trim()).digest("hex");
}

export type AccessKeyDoc = {
  _id?: unknown;
  keyHash: string;
  name: string;
  createdAt: Date;
  revoked?: boolean;
};

export async function validateAccessKey(key: string): Promise<boolean> {
  const trimmed = key.trim();
  if (!trimmed) return false;

  const seed = process.env.ACCESS_KEY_SEED;
  if (seed && trimmed === seed.trim()) return true;

  const keyHash = hashKey(trimmed);
  const db = await getDb();
  const doc = await db.collection<AccessKeyDoc>(COLLECTION).findOne({
    keyHash,
    revoked: { $ne: true },
  });
  return !!doc;
}

export async function listAccessKeys(): Promise<
  { id: string; name: string; createdAt: string; revoked: boolean; mask: string }[]
> {
  const db = await getDb();
  const docs = await db
    .collection<AccessKeyDoc>(COLLECTION)
    .find({})
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map((d) => ({
    id: String(d._id),
    name: d.name,
    createdAt: d.createdAt.toISOString(),
    revoked: !!d.revoked,
    mask: `••••${d.keyHash.slice(-4)}`,
  }));
}

export async function createAccessKey(name: string): Promise<{ id: string; key: string }> {
  const rawKey = randomBytes(KEY_BYTES).toString("hex");
  const keyHash = hashKey(rawKey);
  const db = await getDb();
  const doc: Omit<AccessKeyDoc, "_id"> = {
    keyHash,
    name: name.trim() || "Unnamed",
    createdAt: new Date(),
  };
  const result = await db.collection<AccessKeyDoc>(COLLECTION).insertOne(doc as OptionalId<AccessKeyDoc>);
  return { id: String(result.insertedId), key: rawKey };
}

export async function revokeAccessKey(id: string): Promise<boolean> {
  const { ObjectId } = await import("mongodb");
  if (!ObjectId.isValid(id)) return false;
  const db = await getDb();
  const result = await db.collection<AccessKeyDoc>(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { revoked: true } }
  );
  return result.modifiedCount > 0;
}
