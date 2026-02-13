import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getAgendaClient } from "@/lib/agenda-client";
import { getNextRunFromCron } from "@/lib/cron-utils";
import { ensureDefaultReportTypes } from "@/lib/report-types-seed";
import { validateJobConfig } from "@/lib/job-config-schemas";
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
    const body = (await request.json()) as {
      accountId?: string | null;
      name?: string;
      jobType?: string;
      messageTemplate?: string;
      config?: JobConfig;
      templateId?: ReportTemplateId;
      customSlackTemplate?: string;
      customXTemplate?: string;
      scannerConfig?: OptionScannerConfig;
      scheduleCron?: string;
      channels?: AlertDeliveryChannel[];
      deliveryChannels?: AlertDeliveryChannel[];
      status?: "active" | "paused";
    };

    const accountIdRaw = body.accountId;
    const accountId: string | null =
      accountIdRaw === null || accountIdRaw === undefined || accountIdRaw === ""
        ? null
        : String(accountIdRaw);
    const name = (body.name ?? "").trim();
    const jobType = body.jobType?.trim();
    const scheduleCron = (body.scheduleCron ?? "").trim();
    const channels = body.deliveryChannels ?? body.channels ?? [];
    const status = body.status ?? "active";

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!jobType) return NextResponse.json({ error: "jobType is required" }, { status: 400 });
    if (!scheduleCron) return NextResponse.json({ error: "scheduleCron is required" }, { status: 400 });

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
        body.config
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
      templateId: body.templateId,
      customSlackTemplate: body.customSlackTemplate,
      customXTemplate: body.customXTemplate,
      scannerConfig: body.scannerConfig,
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
