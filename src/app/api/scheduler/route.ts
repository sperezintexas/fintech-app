/**
 * Scheduler API: get status, schedule/run/cancel jobs, create recommended jobs.
 * Uses agenda-client and scheduler helpers (web does not start Agenda; smart-scheduler runs jobs).
 */
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getAgendaClient } from "@/lib/agenda-client";
import {
  scheduleJob,
  runJobNow,
  getJobStatus,
  cancelJob,
  upsertReportJobSchedule,
} from "@/lib/scheduler";
import { ensureDefaultReportTypes } from "@/lib/report-types-seed";

export const dynamic = "force-dynamic";

type JobDoc = {
  accountId: string | null;
  name: string;
  jobType: string;
  scheduleCron: string;
  channels: string[];
  status: "active" | "paused";
  config?: Record<string, unknown>;
  templateId?: string;
  createdAt: string;
  updatedAt: string;
};

async function createRecommendedJobs(): Promise<{ created: number; jobs: string[] }> {
  const db = await getDb();
  await ensureDefaultReportTypes(db);

  const now = new Date().toISOString();
  // Portfolio-level (accountId: null) so jobs appear in Setup > Scheduled Jobs and run for all accounts where applicable
  const recommended: Array<{ name: string; jobType: string; accountId: string | null; scheduleCron: string; config?: Record<string, unknown> }> = [
    { name: "Weekly Portfolio", jobType: "portfoliosummary", accountId: null, scheduleCron: "0 18 * * 0", config: { includeAiInsights: true } },
    { name: "Daily Options Scanner", jobType: "unifiedOptionsScanner", accountId: null, scheduleCron: "15 14-20 * * 1-5" },
    { name: "Watchlist Snapshot", jobType: "watchlistreport", accountId: null, scheduleCron: "0 9,16 * * 1-5" },
    { name: "Risk Scanner", jobType: "riskScanner", accountId: null, scheduleCron: "0 17 * * 1-5" },
    { name: "Deliver Alerts", jobType: "deliverAlerts", accountId: null, scheduleCron: "30 16 * * 1-5" },
    { name: "Data Cleanup", jobType: "cleanup", accountId: null, scheduleCron: "0 3 * * *" },
  ];

  const agenda = await getAgendaClient();
  const legacyNames = ["daily-analysis", "cleanup-alerts"];
  for (const name of legacyNames) {
    await agenda.cancel({ name });
  }

  const jobsColl = db.collection<JobDoc>("reportJobs");
  let created = 0;
  const jobNames: string[] = [];

  /** Daily Options Scanner must run only during market hours (9:15 AM–4:15 PM ET). */
  const DAILY_OPTIONS_SCANNER_CRON = "15 14-20 * * 1-5";

  for (const r of recommended) {
    const exists = await jobsColl.findOne({ name: r.name });
    if (exists) {
      if (r.name === "Daily Options Scanner" && exists.scheduleCron !== DAILY_OPTIONS_SCANNER_CRON) {
        await jobsColl.updateOne(
          { name: r.name },
          { $set: { scheduleCron: DAILY_OPTIONS_SCANNER_CRON, updatedAt: now } }
        );
        const existingId = (exists as { _id: ObjectId })._id.toString();
        await upsertReportJobSchedule(existingId, DAILY_OPTIONS_SCANNER_CRON);
      }
      continue;
    }

    const doc: JobDoc = {
      accountId: r.accountId,
      name: r.name,
      jobType: r.jobType,
      scheduleCron: r.scheduleCron,
      channels: ["slack"],
      status: "active",
      config: r.config,
      templateId: r.jobType === "watchlistreport" ? "concise" : undefined,
      createdAt: now,
      updatedAt: now,
    };

    const result = await jobsColl.insertOne(doc as JobDoc & { _id?: ObjectId });
    const jobId = result.insertedId.toString();
    await upsertReportJobSchedule(jobId, r.scheduleCron);
    created++;
    jobNames.push(r.name);
  }

  return { created, jobs: jobNames };
}

// GET - Get job status and schedules. Does not schedule Agenda jobs (smart-scheduler does that when running).
export async function GET() {
  try {
    const status = await getJobStatus();
    return NextResponse.json({
      status: "running",
      ...status,
    });
  } catch (error) {
    console.error("Failed to get scheduler status:", error);
    return NextResponse.json(
      { error: "Failed to get scheduler status" },
      { status: 500 }
    );
  }
}

// POST - Manage jobs (schedule, run, cancel)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, jobName, schedule, data } = body;

    switch (action) {
      case "schedule": {
        if (!jobName || !schedule) {
          return NextResponse.json(
            { error: "jobName and schedule are required" },
            { status: 400 }
          );
        }

        await scheduleJob(jobName, schedule, data);

        return NextResponse.json({
          success: true,
          message: `Job "${jobName}" scheduled with "${schedule}"`,
        });
      }

      case "run": {
        if (!jobName) {
          return NextResponse.json(
            { error: "jobName is required" },
            { status: 400 }
          );
        }

        await runJobNow(jobName, data);

        return NextResponse.json({
          success: true,
          message: `Job "${jobName}" triggered to run now`,
        });
      }

      case "cancel": {
        if (!jobName) {
          return NextResponse.json(
            { error: "jobName is required" },
            { status: 400 }
          );
        }

        const cancelled = await cancelJob(jobName);

        return NextResponse.json({
          success: true,
          message: `Cancelled ${cancelled} job(s)`,
        });
      }

      case "runPortfolio": {
        const db = await getDb();
        const firstAccount = await db.collection("accounts").findOne({});
        const accountId = firstAccount ? { accountId: firstAccount._id.toString() } : {};
        await runJobNow("unifiedOptionsScanner", accountId);
        await runJobNow("watchlistreport", accountId);
        await runJobNow("deliverAlerts", {});

        return NextResponse.json({
          success: true,
          message: "Unified scanners triggered (unifiedOptionsScanner, watchlistreport, deliverAlerts)",
        });
      }

      case "createRecommendedJobs": {
        const { created, jobs } = await createRecommendedJobs();
        return NextResponse.json({
          success: true,
          message: created > 0 ? `Created ${created} recommended job(s)` : "Recommended jobs already exist",
          created,
          jobs,
        });
      }

      case "fixDailyOptionsScannerSchedule": {
        const db = await getDb();
        const MARKET_HOURS_CRON = "15 14-20 * * 1-5";
        const jobsColl = db.collection<JobDoc>("reportJobs");
        const job =
          (await jobsColl.findOne({ jobType: "unifiedOptionsScanner" })) ??
          (await jobsColl.findOne({ name: "Daily Options Scanner" }));
        if (!job) {
          return NextResponse.json({
            success: true,
            message: "No Daily Options Scanner / Unified Options Scanner job found; create it via Create recommended jobs.",
          });
        }
        const jobId = (job as { _id: ObjectId })._id.toString();
        if (job.scheduleCron?.trim() === MARKET_HOURS_CRON) {
          return NextResponse.json({
            success: true,
            message: "Daily Options Scanner already set to market hours (9:15 AM–4:15 PM ET).",
          });
        }
        await jobsColl.updateOne(
          { _id: (job as { _id: ObjectId })._id },
          { $set: { scheduleCron: MARKET_HOURS_CRON, updatedAt: new Date().toISOString() } }
        );
        await upsertReportJobSchedule(jobId, MARKET_HOURS_CRON);
        return NextResponse.json({
          success: true,
          message: "Daily Options Scanner schedule updated to market hours only (9:15 AM–4:15 PM ET, weekdays).",
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Scheduler action failed:", error);
    return NextResponse.json(
      { error: "Scheduler action failed" },
      { status: 500 }
    );
  }
}
