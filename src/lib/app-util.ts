/**
 * App utility config stored in appUtil collection.
 * User-editable config (cleanup thresholds, etc.) - env vars as fallback.
 */

import { getDb } from "./mongodb";

const COLLECTION = "appUtil";

export type CleanupConfig = {
  storageLimitMB: number;
  purgeThreshold: number;
  purgeIntervalDays: number;
  lastDataCleanup?: string;
  updatedAt?: string;
};

const DEFAULT_CLEANUP: CleanupConfig = {
  storageLimitMB: 512,
  purgeThreshold: 0.75,
  purgeIntervalDays: 30,
};

/** Get cleanup config from DB, fallback to env/defaults */
export async function getCleanupConfig(): Promise<CleanupConfig> {
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne({ key: "cleanup" });
  if (doc && doc.value) {
    const v = doc.value as Record<string, unknown>;
    return {
      storageLimitMB: (v.storageLimitMB as number) ?? parseInt(process.env.MONGODB_STORAGE_LIMIT_MB ?? "512", 10),
      purgeThreshold: (v.purgeThreshold as number) ?? parseFloat(process.env.MONGODB_PURGE_THRESHOLD ?? "0.75"),
      purgeIntervalDays: (v.purgeIntervalDays as number) ?? 30,
      lastDataCleanup: v.lastDataCleanup as string | undefined,
      updatedAt: doc.updatedAt as string | undefined,
    };
  }
  return {
    ...DEFAULT_CLEANUP,
    storageLimitMB: parseInt(process.env.MONGODB_STORAGE_LIMIT_MB ?? "512", 10),
    purgeThreshold: parseFloat(process.env.MONGODB_PURGE_THRESHOLD ?? "0.75"),
  };
}

/** Save cleanup config to DB */
export async function setCleanupConfig(config: Partial<CleanupConfig>): Promise<CleanupConfig> {
  const db = await getDb();
  const existing = await getCleanupConfig();
  const merged: CleanupConfig = {
    ...existing,
    ...config,
    storageLimitMB: config.storageLimitMB ?? existing.storageLimitMB,
    purgeThreshold: config.purgeThreshold ?? existing.purgeThreshold,
    purgeIntervalDays: config.purgeIntervalDays ?? existing.purgeIntervalDays,
  };
  const now = new Date().toISOString();
  await db.collection(COLLECTION).updateOne(
    { key: "cleanup" },
    {
      $set: {
        key: "cleanup",
        value: {
          storageLimitMB: merged.storageLimitMB,
          purgeThreshold: merged.purgeThreshold,
          purgeIntervalDays: merged.purgeIntervalDays,
          lastDataCleanup: merged.lastDataCleanup,
        },
        updatedAt: now,
      },
    },
    { upsert: true }
  );
  return { ...merged, updatedAt: now };
}

/** Update last cleanup timestamp */
export async function setLastCleanupAt(): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const doc = await db.collection(COLLECTION).findOne({ key: "cleanup" });
  const existing = (doc?.value as Record<string, unknown>) ?? {};
  await db.collection(COLLECTION).updateOne(
    { key: "cleanup" },
    {
      $set: {
        key: "cleanup",
        value: {
          ...existing,
          lastDataCleanup: now,
        },
        updatedAt: now,
      },
    },
    { upsert: true }
  );
}
