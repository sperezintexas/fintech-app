import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { executeJob } from "@/lib/scheduler";
import { REPORT_HANDLER_KEYS } from "../route";

export const dynamic = "force-dynamic";

/**
 * POST /api/report-types/run
 * Run a job type immediately and post result to Slack.
 * Body: { handlerKey: string, accountId?: string | null }
 * - handlerKey: e.g. coveredCallScanner, smartxai
 * - accountId: account for Slack config and account-scoped jobs; null for portfolio-level
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { handlerKey?: string; accountId?: string | null };
    const handlerKey = body.handlerKey?.trim();
    const accountId = body.accountId === undefined || body.accountId === "" ? null : String(body.accountId);

    if (!handlerKey) {
      return NextResponse.json({ error: "handlerKey is required" }, { status: 400 });
    }
    if (!REPORT_HANDLER_KEYS.includes(handlerKey as (typeof REPORT_HANDLER_KEYS)[number])) {
      return NextResponse.json(
        { error: `handlerKey must be one of: ${REPORT_HANDLER_KEYS.join(", ")}` },
        { status: 400 }
      );
    }

    const db = await getDb();
    const reportTypeDoc = await db.collection("reportTypes").findOne({ id: handlerKey });
    const reportTypeName = (reportTypeDoc as { name?: string } | null)?.name ?? handlerKey;

    // Create temporary job (jobType + minimal config)
    const jobDoc = {
      _id: new ObjectId(),
      name: `Test: ${reportTypeName}`,
      jobType: handlerKey,
      accountId,
      scheduleCron: "0 0 1 1 *",
      channels: ["slack" as const],
      status: "active" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.collection("reportJobs").insertOne(jobDoc);
    const jobId = jobDoc._id.toString();

    try {
      const result = await executeJob(jobId);

      await db.collection("reportJobs").deleteOne({ _id: jobDoc._id });

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }

      const channels = result.deliveredChannels ?? [];
      const failed = result.failedChannels ?? [];
      const message =
        channels.length > 0
          ? `Sent to Slack${failed.length > 0 ? `. ${failed.map((f) => f.error).join("; ")}` : ""}`
          : result.error ?? "Job completed but not delivered";

      return NextResponse.json({
        success: true,
        message,
        deliveredChannels: channels,
        failedChannels: failed.length > 0 ? failed : undefined,
      });
    } catch (err) {
      await db.collection("reportJobs").deleteOne({ _id: jobDoc._id });
      throw err;
    }
  } catch (error) {
    console.error("Run job type failed:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
