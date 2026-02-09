import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getAgendaClient } from "@/lib/agenda-client";
import { getDbStats } from "@/lib/cleanup-storage";

export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "degraded" | "error";

type HealthCheck = {
  status: CheckStatus;
  message?: string;
  latencyMs?: number;
  jobsCount?: number;
  nextRunAt?: string;
  dataSizeMB?: number;
  percentOfLimit?: number;
  /** Sanitized connection string (password masked) for debugging */
  connectionDisplay?: string;
  /** Database name in use */
  database?: string;
};

export async function GET() {
  const checks: Record<string, HealthCheck> = {};
  let overallStatus: "ok" | "degraded" | "error" = "ok";

  // App - always ok if we reach this route
  checks.app = { status: "ok" };

  // MongoDB
  const rawUri = process.env.MONGODB_URI || process.env.MONGODB_URI_B64
    ? (process.env.MONGODB_URI ?? Buffer.from(process.env.MONGODB_URI_B64!, "base64").toString("utf8"))
    : "mongodb://localhost:27017";
  const dbName = process.env.MONGODB_DB || "myinvestments";
  const sanitizeUri = (uri: string): string => {
    try {
      const at = uri.indexOf("@");
      if (at === -1) return uri;
      const cred = uri.slice(0, at);
      const hostPart = uri.slice(at);
      const protocolEnd = cred.indexOf("://") + 3;
      const colon = cred.lastIndexOf(":");
      if (colon > protocolEnd) return cred.slice(0, colon) + ":***" + hostPart;
      return cred + hostPart;
    } catch {
      return "(hidden)";
    }
  };

  try {
    const start = Date.now();
    const db = await getDb();
    await db.command({ ping: 1 });
    const mongodbCheck: HealthCheck = {
      status: "ok",
      latencyMs: Date.now() - start,
      connectionDisplay: sanitizeUri(rawUri),
      database: dbName,
    };
    try {
      const stats = await getDbStats();
      mongodbCheck.dataSizeMB = Math.round(stats.dataSizeMB * 100) / 100;
      mongodbCheck.percentOfLimit = Math.round(stats.percentOfLimit * 10) / 10;
      if (stats.percentOfLimit >= 75) {
        mongodbCheck.status = "degraded";
        mongodbCheck.message = `Storage at ${stats.percentOfLimit.toFixed(1)}% - cleanup recommended`;
        if (overallStatus === "ok") overallStatus = "degraded";
      }
    } catch {
      // Stats optional
    }
    checks.mongodb = mongodbCheck;
  } catch (e) {
    checks.mongodb = {
      status: "error",
      message: e instanceof Error ? e.message : "Connection failed",
      connectionDisplay: sanitizeUri(rawUri),
      database: dbName,
    };
    overallStatus = "error";
  }

  // Scheduler (Agenda jobs in DB; worker runs in smart-scheduler service)
  try {
    const agenda = await getAgendaClient();
    const jobs = await agenda.jobs({ name: "scheduled-report" });
    const nextRun = jobs
      .map((j) => j.attrs.nextRunAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime())[0];

    checks.scheduler = {
      status: "ok",
      jobsCount: jobs.length,
      nextRunAt: nextRun?.toISOString(),
    };
    if (jobs.length === 0) {
      checks.scheduler.status = "degraded";
      checks.scheduler.message = "No scheduled report jobs";
      if (overallStatus === "ok") overallStatus = "degraded";
    }
  } catch (e) {
    checks.scheduler = {
      status: "error",
      message: e instanceof Error ? e.message : "Scheduler failed",
    };
    overallStatus = overallStatus === "ok" ? "error" : overallStatus;
  }

  return NextResponse.json({
    status: overallStatus,
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? undefined,
    timestamp: new Date().toISOString(),
    checks,
  });
}
