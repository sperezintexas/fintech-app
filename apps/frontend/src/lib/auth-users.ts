/**
 * Email/password auth users. Passwords hashed with scrypt (Node crypto).
 */

import type { OptionalId } from "mongodb";
import { getDb } from "./mongodb";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

const COLLECTION = "authUsers";
const SALT_BYTES = 16;
const KEY_LEN = 64;

export type AuthUserDoc = {
  _id?: unknown;
  email: string;
  salt: string;
  hash: string;
  createdAt: Date;
};

function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN);
}

export async function validateAuthUser(email: string, password: string): Promise<boolean> {
  const db = await getDb();
  const doc = await db
    .collection<AuthUserDoc>(COLLECTION)
    .findOne({ email: email.trim().toLowerCase() });
  if (!doc) return false;
  const salt = Buffer.from(doc.salt, "hex");
  const expected = Buffer.from(doc.hash, "hex");
  const got = hashPassword(password, salt);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

export async function createAuthUser(email: string, password: string): Promise<boolean> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !password) return false;
  const db = await getDb();
  const existing = await db.collection<AuthUserDoc>(COLLECTION).findOne({ email: trimmed });
  if (existing) return false;
  const salt = randomBytes(SALT_BYTES);
  const hash = hashPassword(password, salt);
  const doc: Omit<AuthUserDoc, "_id"> = {
    email: trimmed,
    salt: salt.toString("hex"),
    hash: hash.toString("hex"),
    createdAt: new Date(),
  };
  await db.collection<AuthUserDoc>(COLLECTION).insertOne(doc as OptionalId<AuthUserDoc>);
  return true;
}
