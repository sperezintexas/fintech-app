import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getAgendaClient } from "@/lib/agenda-client";
import { getNextRunFromCron } from "@/lib/cron-utils";
import { ensureDefaultReportTypes } from "@/lib/report-types-seed";
import { validateJobConfig } from "@/lib/job-config-schemas";
import { jobsPostBodySchema } from "@/lib/api-request-schemas";
import type { Job, AlertDeliveryChannel, ReportTemplateId, OptionScannerConfig, JobConfig } from "@/types/portfolio";

export const dynamic = "force-dynamic";

type JobDoc = Omit<Job, "_id"> & { _id: ObjectId };

// GET /api/jobs?accountId=... (omit for portfolio-level) | ?all=1 (all jobs for schedule management)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountIdParam = searchParams.get("accountId");
    const allParam = searchParams.get("all");

    const db = await getDb();
    const query: Record<string, unknown> =
      allParam === "1" || allParam === "true"
        ? {}
        : accountIdParam === null || accountIdParam === ""
          ? { accountId: null }
          : { accountId: accountIdParam };

    const jobs = await db
      .collection<JobDoc>("reportJobs")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    const nextRunByJobId = new Map<string, string>();
    try {
      const agenda = await getAgendaClient();
      const scheduledReports = await agenda.jobs({ name: "scheduled-report" });
      for (const job of scheduledReports) {
        const jid = (job.attrs.data as { jobId?: string })?.jobId;
        if (jid && job.attrs.nextRunAt) {
          nextRunByJobId.set(jid, job.attrs.nextRunAt.toISOString());
        }
      }
    } catch (agendaErr) {
      console.warn("Agenda jobs unavailable (nextRunAt omitted):", agendaErr instanceof Error ? agendaErr.message : agendaErr);
    }

    return NextResponse.json(
      jobs.map((j) => {
        const id = j._id.toString();
        let nextRunAt = nextRunByJobId.get(id) ?? j.nextRunAt ?? undefined;
        if (!nextRunAt && (j.status === "active" || !j.status) && j.scheduleCron?.trim()) {
          const fromCron = getNextRunFromCron(j.scheduleCron);
          if (fromCron) nextRunAt = fromCron;
        }
        return {
          ...j,
          _id: id,
          nextRunAt,
        };
      })
    );
  } catch (error) {
    console.error("Failed to fetch jobs:", error);
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}

// POST /api/jobs
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const parsed = jobsPostBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const body = parsed.data;
    const accountId: string | null =
      body.accountId === null || body.accountId === undefined || body.accountId === ""
        ? null
        : String(body.accountId);
    const name = body.name;
    const jobType = body.jobType;
    const scheduleCron = body.scheduleCron;
    const channels = (body.deliveryChannels ?? body.channels ?? []) as AlertDeliveryChannel[];
    const status = body.status ?? "active";

    const db = await getDb();
    await ensureDefaultReportTypes(db);

    if (accountId) {
      const account = await db.collection("accounts").findOne({ _id: new ObjectId(accountId) });
      if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const typeDoc = (await db.collection("reportTypes").findOne({ id: jobType })) as {
      enabled?: boolean;
      supportsPortfolio?: boolean;
      supportsAccount?: boolean;
      handlerKey?: string;
    } | null;
    if (!typeDoc || !typeDoc.enabled) {
      return NextResponse.json({ error: "Invalid or disabled job type" }, { status: 400 });
    }

    let validatedConfig: JobConfig | undefined;
    try {
      validatedConfig = validateJobConfig(
        jobType,
        typeDoc.handlerKey ?? jobType,
        body.config as JobConfig
      ) as JobConfig | undefined;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid config";
      return NextResponse.json({ error: `Config validation failed: ${msg}` }, { status: 400 });
    }
    if (accountId === null && !typeDoc.supportsPortfolio) {
      return NextResponse.json({ error: "This job type does not support portfolio-level jobs" }, { status: 400 });
    }
    if (accountId && !typeDoc.supportsAccount) {
      return NextResponse.json({ error: "This job type does not support account-level jobs" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const jobDoc: Omit<JobDoc, "_id"> = {
      accountId,
      name,
      jobType,
      messageTemplate: body.messageTemplate?.trim() || undefined,
      config: validatedConfig,
      templateId: body.templateId as ReportTemplateId | undefined,
      customSlackTemplate: body.customSlackTemplate,
      customXTemplate: body.customXTemplate,
      scannerConfig: body.scannerConfig as OptionScannerConfig | undefined,
      scheduleCron,
      channels,
      status,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection<JobDoc>("reportJobs").insertOne(jobDoc as JobDoc);
    const jobId = result.insertedId.toString();
    return NextResponse.json({ ...jobDoc, _id: jobId }, { status: 201 });
  } catch (error) {
    console.error("Failed to create job:", error);
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }
}
