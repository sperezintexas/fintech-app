import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getAgenda } from "@/lib/scheduler";
import type { ReportJob, AlertDeliveryChannel } from "@/types/portfolio";

export const dynamic = "force-dynamic";

type ReportJobDoc = Omit<ReportJob, "_id"> & { _id: ObjectId };

async function upsertAgendaSchedule(jobId: string, cron: string): Promise<void> {
  const agenda = await getAgenda();
  // ensure one schedule per jobId
  await agenda.cancel({ name: "scheduled-report", "data.jobId": jobId });
  await agenda.every(cron, "scheduled-report", { jobId });
}

async function cancelAgendaSchedule(jobId: string): Promise<void> {
  const agenda = await getAgenda();
  await agenda.cancel({ name: "scheduled-report", "data.jobId": jobId });
}

// GET /api/report-jobs?accountId=...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    const db = await getDb();
    const jobs = await db
      .collection<ReportJobDoc>("reportJobs")
      .find({ accountId })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(
      jobs.map((j) => ({
        ...j,
        _id: j._id.toString(),
      }))
    );
  } catch (error) {
    console.error("Failed to fetch report jobs:", error);
    return NextResponse.json({ error: "Failed to fetch report jobs" }, { status: 500 });
  }
}

// POST /api/report-jobs
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      accountId?: string;
      name?: string;
      reportId?: string;
      scheduleCron?: string;
      channels?: AlertDeliveryChannel[];
      status?: "active" | "paused";
    };

    const accountId = body.accountId;
    const name = (body.name ?? "").trim();
    const reportId = body.reportId;
    const scheduleCron = (body.scheduleCron ?? "").trim();
    const channels = body.channels ?? [];
    const status = body.status ?? "active";

    if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!reportId) return NextResponse.json({ error: "reportId is required" }, { status: 400 });
    if (!scheduleCron) return NextResponse.json({ error: "scheduleCron is required" }, { status: 400 });

    const db = await getDb();
    const account = await db.collection("accounts").findOne({ _id: new ObjectId(accountId) });
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    const report = await db.collection("reportDefinitions").findOne({ _id: new ObjectId(reportId) });
    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    const now = new Date().toISOString();
    const doc: Omit<ReportJobDoc, "_id"> = {
      accountId,
      name,
      reportId,
      scheduleCron,
      channels,
      status,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection<ReportJobDoc>("reportJobs").insertOne(doc as ReportJobDoc);
    const jobId = result.insertedId.toString();

    if (status === "active") {
      await upsertAgendaSchedule(jobId, scheduleCron);
    }

    return NextResponse.json({ ...doc, _id: jobId }, { status: 201 });
  } catch (error) {
    console.error("Failed to create report job:", error);
    return NextResponse.json({ error: "Failed to create report job" }, { status: 500 });
  }
}
