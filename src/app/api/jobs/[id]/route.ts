import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { executeJob, upsertReportJobSchedule, cancelReportJobSchedule } from "@/lib/scheduler";
import { validateJobConfig } from "@/lib/job-config-schemas";
import type { Job, AlertDeliveryChannel, ReportTemplateId, OptionScannerConfig, JobConfig } from "@/types/portfolio";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/jobs/[id] - Run job now
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    const result = await executeJob(id);
    if (!result.success) {
      if (result.summary) {
        return NextResponse.json({
          success: true,
          message: result.error ?? "Job completed; delivery had issues",
          summary: result.summary,
        });
      }
      return NextResponse.json(
        { success: false, error: result.error ?? "Job failed" },
        { status: 400 }
      );
    }
    const channels = result.deliveredChannels ?? [];
    const failed = result.failedChannels ?? [];
    let message =
      channels.length === 0
        ? "Job completed successfully"
        : channels.length === 1
          ? `Sent to ${channels[0]}`
          : channels.length === 2
            ? `Sent to ${channels[0]} and ${channels[1]}`
            : `Sent to ${channels.slice(0, -1).join(", ")}, and ${channels[channels.length - 1]}`;
    if (failed.length > 0) {
      message += `. ${failed.map((f) => `${f.channel}: ${f.error}`).join("; ")}`;
    }
    return NextResponse.json({
      success: true,
      message,
      summary: result.summary,
    });
  } catch (error) {
    console.error("Run job failed:", error);
    return NextResponse.json({ error: "Failed to run job" }, { status: 500 });
  }
}

// PUT /api/jobs/[id]
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    const body = (await request.json()) as Partial<{
      name: string;
      jobType: string;
      messageTemplate: string;
      config: JobConfig;
      templateId: ReportTemplateId;
      customSlackTemplate: string;
      customXTemplate: string;
      scannerConfig: OptionScannerConfig;
      scheduleCron: string;
      channels: AlertDeliveryChannel[];
      deliveryChannels: AlertDeliveryChannel[];
      status: "active" | "paused";
    }>;

    const db = await getDb();
    const update: Partial<Job> & { updatedAt: string } = { updatedAt: new Date().toISOString() };
    if (body.name !== undefined) update.name = body.name.trim();
    if (body.jobType !== undefined) update.jobType = body.jobType.trim();
    if (body.messageTemplate !== undefined) update.messageTemplate = body.messageTemplate?.trim() || undefined;
    if (body.config !== undefined) {
      const existing = await db.collection("reportJobs").findOne({ _id: new ObjectId(id) });
      const existingJob = existing as Job | null;
      const typeDoc = existingJob
        ? await db.collection("reportTypes").findOne({ id: existingJob.jobType })
        : null;
      const handlerKey = (typeDoc as { handlerKey?: string } | null)?.handlerKey ?? body.jobType ?? "";
      try {
        update.config = validateJobConfig(body.jobType ?? existingJob?.jobType ?? "", handlerKey, body.config) as JobConfig | undefined;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Invalid config";
        return NextResponse.json({ error: `Config validation failed: ${msg}` }, { status: 400 });
      }
    }
    if (body.templateId !== undefined) update.templateId = body.templateId;
    if (body.customSlackTemplate !== undefined) update.customSlackTemplate = body.customSlackTemplate;
    if (body.customXTemplate !== undefined) update.customXTemplate = body.customXTemplate;
    if (body.scannerConfig !== undefined) update.scannerConfig = body.scannerConfig;
    if (body.scheduleCron !== undefined) update.scheduleCron = body.scheduleCron.trim();
    if (body.deliveryChannels !== undefined || body.channels !== undefined) update.channels = body.deliveryChannels ?? body.channels ?? [];
    if (body.status !== undefined) update.status = body.status;

    if (update.name !== undefined && !update.name) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
    if (update.scheduleCron !== undefined && !update.scheduleCron) {
      return NextResponse.json({ error: "scheduleCron cannot be empty" }, { status: 400 });
    }

    if (update.jobType) {
      const typeDoc = await db.collection("reportTypes").findOne({ id: update.jobType });
      if (!typeDoc || !(typeDoc as { enabled?: boolean }).enabled) {
        return NextResponse.json({ error: "Invalid or disabled job type" }, { status: 400 });
      }
    }

    const result = await db.collection("reportJobs").updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const updated = await db.collection("reportJobs").findOne({ _id: new ObjectId(id) });
    const status = (updated?.status ?? "paused") as "active" | "paused";
    const cron = (updated?.scheduleCron ?? "") as string;
    if (status === "active" && cron) {
      await upsertReportJobSchedule(id, cron);
    } else {
      await cancelReportJobSchedule(id);
    }

    return NextResponse.json({ ...updated, _id: (updated as { _id: ObjectId })?._id.toString() });
  } catch (error) {
    console.error("Failed to update job:", error);
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}

// DELETE /api/jobs/[id]
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    const db = await getDb();
    const result = await db.collection("reportJobs").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    await cancelReportJobSchedule(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete job:", error);
    return NextResponse.json({ error: "Failed to delete job" }, { status: 500 });
  }
}
