import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getAgenda } from "@/lib/scheduler";
import type { AlertDeliveryChannel, ReportJob } from "@/types/portfolio";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ id: string }>;
};

async function upsertAgendaSchedule(jobId: string, cron: string): Promise<void> {
  const agenda = await getAgenda();
  await agenda.cancel({ name: "scheduled-report", "data.jobId": jobId });
  await agenda.every(cron, "scheduled-report", { jobId });
}

async function cancelAgendaSchedule(jobId: string): Promise<void> {
  const agenda = await getAgenda();
  await agenda.cancel({ name: "scheduled-report", "data.jobId": jobId });
}

// PUT /api/report-jobs/[id]
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    const body = (await request.json()) as Partial<{
      name: string;
      reportId: string;
      scheduleCron: string;
      channels: AlertDeliveryChannel[];
      status: "active" | "paused";
    }>;

    const update: Partial<ReportJob> & { updatedAt: string } = { updatedAt: new Date().toISOString() };
    if (body.name !== undefined) update.name = body.name.trim();
    if (body.reportId !== undefined) update.reportId = body.reportId;
    if (body.scheduleCron !== undefined) update.scheduleCron = body.scheduleCron.trim();
    if (body.channels !== undefined) update.channels = body.channels;
    if (body.status !== undefined) update.status = body.status;

    if (update.name !== undefined && !update.name) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
    if (update.scheduleCron !== undefined && !update.scheduleCron) {
      return NextResponse.json({ error: "scheduleCron cannot be empty" }, { status: 400 });
    }

    const db = await getDb();

    // If reportId provided, validate it exists
    if (update.reportId) {
      const exists = await db.collection("reportDefinitions").findOne({ _id: new ObjectId(update.reportId) });
      if (!exists) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const result = await db.collection("reportJobs").updateOne({ _id: new ObjectId(id) }, { $set: update });
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Report job not found" }, { status: 404 });
    }

    const updated = (await db.collection("reportJobs").findOne({ _id: new ObjectId(id) })) as any;

    // Sync agenda schedule
    const status = (updated?.status ?? "paused") as "active" | "paused";
    const cron = (updated?.scheduleCron ?? "") as string;
    if (status === "active" && cron) {
      await upsertAgendaSchedule(id, cron);
    } else {
      await cancelAgendaSchedule(id);
    }

    return NextResponse.json({ ...updated, _id: updated?._id.toString() });
  } catch (error) {
    console.error("Failed to update report job:", error);
    return NextResponse.json({ error: "Failed to update report job" }, { status: 500 });
  }
}

// DELETE /api/report-jobs/[id]
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    const db = await getDb();
    const result = await db.collection("reportJobs").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Report job not found" }, { status: 404 });
    }

    await cancelAgendaSchedule(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete report job:", error);
    return NextResponse.json({ error: "Failed to delete report job" }, { status: 500 });
  }
}
