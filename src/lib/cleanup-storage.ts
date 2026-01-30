/**
 * Data cleanup with MongoDB storage monitoring.
 * Purges old data when nearing free tier limit (75%) or every 30 days.
 * Config from appUtil collection (user-editable).
 */

import { getDb } from "./mongodb";
import {
  getCleanupConfig,
  setLastCleanupAt as saveLastCleanupAt,
} from "./app-util";

export type DbStats = {
  dataSize: number;
  storageSize: number;
  indexSize: number;
  totalSize: number;
  dataSizeMB: number;
  percentOfLimit: number;
};

/** Get current database size stats. */
export async function getDbStats(): Promise<DbStats> {
  const db = await getDb();
  const stats = await db.command({ dbStats: 1, scale: 1 });
  const dataSize = (stats.dataSize as number) ?? 0;
  const storageSize = (stats.storageSize as number) ?? 0;
  const indexSize = (stats.indexSize as number) ?? 0;
  const config = await getCleanupConfig();
  const limit = config.storageLimitMB * 1024 * 1024;
  const percentOfLimit = limit > 0 ? (dataSize / limit) * 100 : 0;

  return {
    dataSize,
    storageSize,
    indexSize,
    totalSize: storageSize + indexSize,
    dataSizeMB: dataSize / (1024 * 1024),
    percentOfLimit,
  };
}

/** Check if purge should run: at threshold % of limit OR purgeIntervalDays since last purge. */
export async function shouldRunPurge(): Promise<{
  shouldRun: boolean;
  reason: string;
  stats?: DbStats;
}> {
  const config = await getCleanupConfig();
  const stats = await getDbStats();
  const threshold = Math.min(1, Math.max(0.01, config.purgeThreshold));
  const limit = config.storageLimitMB * 1024 * 1024;
  const atThreshold = limit > 0 && stats.dataSize >= limit * threshold;
  const lastAt = config.lastDataCleanup ? new Date(config.lastDataCleanup) : null;
  const intervalDaysAgo = new Date();
  intervalDaysAgo.setDate(intervalDaysAgo.getDate() - config.purgeIntervalDays);
  const overdue = !lastAt || lastAt < intervalDaysAgo;

  if (atThreshold) {
    return {
      shouldRun: true,
      reason: `Storage at ${stats.percentOfLimit.toFixed(1)}% of limit (threshold ${(threshold * 100).toFixed(0)}%)`,
      stats,
    };
  }
  if (overdue) {
    return {
      shouldRun: true,
      reason: `Scheduled purge: last cleanup ${lastAt ? lastAt.toISOString() : "never"}`,
      stats,
    };
  }
  return {
    shouldRun: false,
    reason: `Storage OK (${stats.percentOfLimit.toFixed(1)}%), last cleanup ${lastAt?.toISOString() ?? "never"}`,
    stats,
  };
}

export type PurgeResult = {
  smartXAIReports: number;
  portfolioSummaryReports: number;
  alerts: number;
  scheduledAlerts: number;
  totalDeleted: number;
  statsBefore: DbStats;
  statsAfter?: DbStats;
};

/** Purge old data (records older than purgeIntervalDays). */
export async function runPurge(): Promise<PurgeResult> {
  const db = await getDb();
  const config = await getCleanupConfig();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.purgeIntervalDays);
  const cutoff = cutoffDate.toISOString();

  const statsBefore = await getDbStats();

  const [smartXAIResult, portfolioSummaryResult, alertsResult, scheduledAlertsResult] =
    await Promise.all([
      db.collection("smartXAIReports").deleteMany({ createdAt: { $lt: cutoff } }),
      db.collection("portfolioSummaryReports").deleteMany({ createdAt: { $lt: cutoff } }),
      db.collection("alerts").deleteMany({ createdAt: { $lt: cutoff } }),
      db.collection("scheduledAlerts").deleteMany({ createdAt: { $lt: cutoff } }),
    ]);

  const result: PurgeResult = {
    smartXAIReports: smartXAIResult.deletedCount,
    portfolioSummaryReports: portfolioSummaryResult.deletedCount,
    alerts: alertsResult.deletedCount,
    scheduledAlerts: scheduledAlertsResult.deletedCount,
    totalDeleted:
      smartXAIResult.deletedCount +
      portfolioSummaryResult.deletedCount +
      alertsResult.deletedCount +
      scheduledAlertsResult.deletedCount,
    statsBefore,
  };

  await saveLastCleanupAt();

  // Optionally fetch stats after (can be slow)
  try {
    result.statsAfter = await getDbStats();
  } catch {
    // Ignore
  }

  return result;
}
