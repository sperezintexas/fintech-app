import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireSessionFromRequest } from "@/lib/require-session";
import { getAgendaClient } from "@/lib/agenda-client";
import { getNextRunFromCron } from "@/lib/cron-utils";
import { ensureDefaultReportTypes } from "@/lib/report-types-seed";
import { validateJobConfig } from "@/lib/job-config-schemas";
import type { Task, AlertDeliveryChannel, ReportTemplateId, OptionScannerConfig, TaskConfig } from "@/types/portfolio";

export const dynamic = "force-dynamic";

type TaskDoc = Omit<Task, "_id"> & { _id: ObjectId };

// GET /api/tasks?accountId=... (omit for portfolio-level) | ?all=1 (all tasks for schedule management)
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

    const tasks = await db
      .collection<TaskDoc>("reportJobs")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    const nextRunByTaskId = new Map<string, string>();
    try {
      const agenda = await getAgendaClient();
      const scheduledReports = await agenda.jobs({ name: "scheduled-report" });
      for (const job of scheduledReports) {
        const jid = (job.attrs.data as { jobId?: string })?.jobId;
        if (jid && job.attrs.nextRunAt) {
          nextRunByTaskId.set(jid, job.attrs.nextRunAt.toISOString());
        }
      }
    } catch (agendaErr) {
      console.warn("Agenda jobs unavailable (nextRunAt omitted):", agendaErr instanceof Error ? agendaErr.message : agendaErr);
    }

    return NextResponse.json(
      tasks.map((t) => {
        const id = t._id.toString();
        let nextRunAt = nextRunByTaskId.get(id) ?? t.nextRunAt ?? undefined;
        if (!nextRunAt && (t.status === "active" || !t.status) && t.scheduleCron?.trim()) {
          const fromCron = getNextRunFromCron(t.scheduleCron);
          if (fromCron) nextRunAt = fromCron;
        }
        return {
          ...t,
          _id: id,
          nextRunAt,
        };
      })
    );
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

// POST /api/tasks
export async function POST(request: NextRequest) {
  const session = await requireSessionFromRequest(request);
  if (session instanceof NextResponse) return session;
  try {
    const body = (await request.json()) as {
      accountId?: string | null;
      name?: string;
      jobType?: string;
      messageTemplate?: string;
      config?: TaskConfig;
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
      return NextResponse.json({ error: "Invalid or disabled task type" }, { status: 400 });
    }

    let validatedConfig: TaskConfig | undefined;
    try {
      validatedConfig = validateJobConfig(
        jobType,
        typeDoc.handlerKey ?? jobType,
        body.config
      ) as TaskConfig | undefined;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid config";
      return NextResponse.json({ error: `Config validation failed: ${msg}` }, { status: 400 });
    }
    if (accountId === null && !typeDoc.supportsPortfolio) {
      return NextResponse.json({ error: "This task type does not support portfolio-level tasks" }, { status: 400 });
    }
    if (accountId && !typeDoc.supportsAccount) {
      return NextResponse.json({ error: "This task type does not support account-level tasks" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const taskDoc: Omit<TaskDoc, "_id"> = {
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

    const result = await db.collection<TaskDoc>("reportJobs").insertOne(taskDoc as TaskDoc);
    const taskId = result.insertedId.toString();
    // Scheduling is handled by the Kotlin backend (reads reportJobs and triggers run-task by cron).
    return NextResponse.json({ ...taskDoc, _id: taskId }, { status: 201 });
  } catch (error) {
    console.error("Failed to create task:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
