/**
 * Login history: record successful logins and aggregate success/failed counts
 * for the Setup > Login History page. Failures are stored by login-failures.ts.
 */

import { getDb } from "@/lib/mongodb";

const SUCCESS_COLLECTION = "login_successes";
const FAILURE_COLLECTION = "login_failures";

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_LIMIT = 50;

export type LoginSuccessRecord = {
  ip: string;
  userAgent?: string;
  userId?: string;
  createdAt: string;
};

/** Record a successful login (call from API when session is established). */
export async function recordLoginSuccess(
  ip: string,
  userAgent?: string,
  userId?: string
): Promise<void> {
  const db = await getDb();
  const record: LoginSuccessRecord = {
    ip,
    userAgent,
    userId,
    createdAt: new Date().toISOString(),
  };
  await db.collection(SUCCESS_COLLECTION).insertOne(record);
}

export type LoginAttemptItem = {
  success: boolean;
  ip: string;
  userAgent?: string;
  createdAt: string;
};

export type LoginHistoryResult = {
  successCount: number;
  failedCount: number;
  attempts: LoginAttemptItem[];
};

/** Get success count, failed count, and recent attempts (merged, sorted by date desc). */
export async function getLoginHistory(
  windowDays: number = DEFAULT_WINDOW_DAYS,
  limit: number = DEFAULT_LIMIT
): Promise<LoginHistoryResult> {
  const db = await getDb();
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);
  const windowStartStr = windowStart.toISOString();

  const [successCount, failedCount, successDocs, failureDocs] = await Promise.all([
    db.collection(SUCCESS_COLLECTION).countDocuments({ createdAt: { $gte: windowStartStr } }),
    db.collection(FAILURE_COLLECTION).countDocuments({ createdAt: { $gte: windowStartStr } }),
    db
      .collection(SUCCESS_COLLECTION)
      .find({ createdAt: { $gte: windowStartStr } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray(),
    db
      .collection(FAILURE_COLLECTION)
      .find({ createdAt: { $gte: windowStartStr } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray(),
  ]);

  type Doc = { ip: string; userAgent?: string; createdAt: string };
  const successItems: LoginAttemptItem[] = (successDocs as unknown as Doc[]).map((d) => ({
    success: true,
    ip: d.ip,
    userAgent: d.userAgent,
    createdAt: d.createdAt,
  }));
  const failureItems: LoginAttemptItem[] = (failureDocs as unknown as Doc[]).map((d) => ({
    success: false,
    ip: d.ip,
    userAgent: d.userAgent,
    createdAt: d.createdAt,
  }));

  const attempts = [...successItems, ...failureItems]
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
    .slice(0, limit);

  return {
    successCount,
    failedCount,
    attempts,
  };
}
