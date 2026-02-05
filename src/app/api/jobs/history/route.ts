import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

type AgendaJobDoc = {
  _id: unknown;
  name: string;
  lastRunAt?: Date | null;
  lastFinishedAt?: Date | null;
  failCount?: number;
  failReason?: string;
  nextRunAt?: Date | null;
  data?: { lastError?: string; lastRun?: string; [key: string]: unknown };
};

/**
 * GET /api/jobs/history?date=YYYY-MM-DD
 * Returns job run history from Agenda's scheduledJobs collection.
 * If date is provided, only jobs that ran (lastRunAt) on that day are returned.
 * Sorted by lastRunAt descending.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");

    const db = await getDb();
    const collection = db.collection<AgendaJobDoc>("scheduledJobs");

    const query: Record<string, unknown> = {};
    // Only include documents that have run at least once
    query.lastRunAt = { $exists: true, $ne: null };

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const start = new Date(dateParam + "T00:00:00.000Z");
      const end = new Date(dateParam + "T23:59:59.999Z");
      query.lastRunAt = { $gte: start, $lte: end };
    }

    const docs = await collection
      .find(query)
      .sort({ lastRunAt: -1 })
      .limit(500)
      .toArray();

    const runs = docs.map((doc) => {
      const lastRunAt = doc.lastRunAt instanceof Date ? doc.lastRunAt.toISOString() : null;
      const lastFinishedAt =
        doc.lastFinishedAt instanceof Date ? doc.lastFinishedAt.toISOString() : null;
      const error =
        doc.data?.lastError ?? doc.failReason ?? (doc.failCount && doc.failCount > 0 ? "Job failed" : undefined);
      const status = error ? "failed" : "success";
      return {
        id: (doc._id as { toString?: () => string })?.toString?.() ?? String(doc._id),
        name: doc.name ?? "unknown",
        lastRunAt,
        lastFinishedAt,
        failCount: doc.failCount ?? 0,
        status,
        error: error ?? null,
      };
    });

    return NextResponse.json(runs);
  } catch (error) {
    console.error("Failed to fetch job run history:", error);
    return NextResponse.json(
      { error: "Failed to fetch job run history" },
      { status: 500 }
    );
  }
}
