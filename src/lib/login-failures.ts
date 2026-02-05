/**
 * Login failure tracking: log attempts, enforce 3-attempt redirect per IP,
 * create security alert after 10 distinct IPs in window.
 */

import { getDb } from "@/lib/mongodb";

const COLLECTION = "login_failures";
const SECURITY_ALERTS_COLLECTION = "security_alerts";
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS_PER_IP = 3;
const ALERT_THRESHOLD_DISTINCT_IPS = 10;

export type LoginFailureRecord = {
  ip: string;
  userAgent?: string;
  createdAt: string; // ISO
};

export type SecurityAlertRecord = {
  type: "login_failure_spike";
  message: string;
  distinctIps: number;
  windowMinutes: number;
  createdAt: string;
  acknowledged?: boolean;
};

function getWindowStart(): Date {
  return new Date(Date.now() - WINDOW_MS);
}

/** Log a failed login attempt and return whether to block (3+ for this IP) and whether to create alert (10+ distinct IPs). */
export async function recordLoginFailure(ip: string, userAgent?: string): Promise<{
  blocked: boolean;
  alertCreated: boolean;
  attemptCount: number;
  distinctIpsInWindow: number;
}> {
  const db = await getDb();
  const now = new Date().toISOString();
  const record: LoginFailureRecord = { ip, userAgent, createdAt: now };

  await db.collection(COLLECTION).insertOne(record);

  const windowStart = getWindowStart();
  const windowStartStr = windowStart.toISOString();

  const [attemptCount, distinctResult] = await Promise.all([
    db
      .collection(COLLECTION)
      .countDocuments({ ip, createdAt: { $gte: windowStartStr } }),
    db
      .collection(COLLECTION)
      .aggregate<{ count: number }>([
        { $match: { createdAt: { $gte: windowStartStr } } },
        { $group: { _id: "$ip" } },
        { $count: "count" },
      ])
      .toArray(),
  ]);

  const distinctIpsInWindow = distinctResult[0]?.count ?? 0;
  const blocked = attemptCount >= MAX_ATTEMPTS_PER_IP;

  let alertCreated = false;
  if (distinctIpsInWindow >= ALERT_THRESHOLD_DISTINCT_IPS) {
    const existing = await db
      .collection(SECURITY_ALERTS_COLLECTION)
      .findOne({
        type: "login_failure_spike",
        createdAt: { $gte: windowStartStr },
      });
    if (!existing) {
      const alert: SecurityAlertRecord = {
        type: "login_failure_spike",
        message: `Multiple failed login attempts: ${distinctIpsInWindow} distinct IPs in the last ${WINDOW_MS / 60000} minutes.`,
        distinctIps: distinctIpsInWindow,
        windowMinutes: WINDOW_MS / 60000,
        createdAt: now,
        acknowledged: false,
      };
      await db.collection(SECURITY_ALERTS_COLLECTION).insertOne(alert);
      alertCreated = true;
    }
  }

  return {
    blocked,
    alertCreated,
    attemptCount,
    distinctIpsInWindow,
  };
}

/** Get client IP from request headers (Next.js / Vercel). */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return headers.get("x-real-ip") ?? "unknown";
}
