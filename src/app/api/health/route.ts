import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getAgenda } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "degraded" | "error";

type HealthCheck = {
  status: CheckStatus;
  message?: string;
  latencyMs?: number;
  jobsCount?: number;
  nextRunAt?: string;
};

export async function GET() {
  const checks: Record<string, HealthCheck> = {};
  let overallStatus: "ok" | "degraded" | "error" = "ok";

  // App - always ok if we reach this route
  checks.app = { status: "ok" };

  // MongoDB
  try {
    const start = Date.now();
    const db = await getDb();
    await db.command({ ping: 1 });
    checks.mongodb = {
      status: "ok",
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    checks.mongodb = {
      status: "error",
      message: e instanceof Error ? e.message : "Connection failed",
    };
    overallStatus = "error";
  }

  // Scheduler (Agenda)
  try {
    const agenda = await getAgenda();
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
    timestamp: new Date().toISOString(),
    checks,
  });
}
