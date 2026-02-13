/**
 * X allowed usernames for sign-in. Stored in auth_users collection.
 * No X user IDs are stored — only usernames (lowercase).
 */

import type { OptionalId } from "mongodb";
import { getDb } from "./mongodb";

const COLLECTION = "auth_users";

export type AuthUserXDoc = {
  _id?: unknown;
  username: string;
  createdAt: Date;
};

export async function listAllowedXUsernames(): Promise<{ username: string; createdAt: string }[]> {
  const db = await getDb();
  const docs = await db
    .collection<AuthUserXDoc>(COLLECTION)
    .find({})
    .sort({ username: 1 })
    .toArray();
  return docs.map((d) => ({
    username: d.username,
    createdAt: d.createdAt.toISOString(),
  }));
}

export async function isAllowedXUsername(username: string): Promise<boolean> {
  const lower = username.trim().toLowerCase();
  if (!lower) return false;
  const db = await getDb();
  const doc = await db.collection<AuthUserXDoc>(COLLECTION).findOne({ username: lower });
  return !!doc;
}

export async function addAllowedXUsername(username: string): Promise<{ ok: boolean; error?: string }> {
  const lower = username.trim().toLowerCase();
  if (!lower) return { ok: false, error: "Username is required" };
  const db = await getDb();
  const existing = await db.collection<AuthUserXDoc>(COLLECTION).findOne({ username: lower });
  if (existing) return { ok: false, error: "Username already allowed" };
  const doc: Omit<AuthUserXDoc, "_id"> = { username: lower, createdAt: new Date() };
  await db.collection<AuthUserXDoc>(COLLECTION).insertOne(doc as OptionalId<AuthUserXDoc>);
  return { ok: true };
}

export async function removeAllowedXUsername(username: string): Promise<boolean> {
  const lower = username.trim().toLowerCase();
  if (!lower) return false;
  const db = await getDb();
  const result = await db.collection<AuthUserXDoc>(COLLECTION).deleteOne({ username: lower });
  return result.deletedCount === 1;
}

/**
 * Seed from env ALLOWED_X_USERNAMES (comma-separated). Skips existing.
 * No usernames in repo — set env and call once.
 */
export async function seedAllowedXUsernamesFromEnv(): Promise<{ added: number }> {
  const raw = process.env.ALLOWED_X_USERNAMES;
  if (!raw || typeof raw !== "string") return { added: 0 };
  const usernames = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  let added = 0;
  for (const u of usernames) {
    const result = await addAllowedXUsername(u);
    if (result.ok) added++;
  }
  return { added };
}
