import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

type ReportJobDoc = {
  _id: { toString(): string };
  name: string;
  jobType?: string;
  lastRunAt?: string;
  lastRunError?: string;
};

/**
 * GET /api/jobs/history?date=YYYY-MM-DD
 * Returns job run history from reportJobs (where "Run now" and scheduled runs write lastRunAt).
 * If date is provided, only jobs that ran (lastRunAt) on that day (UTC) are returned.
 * Sorted by lastRunAt descending.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");

    const db = await getDb();
    const collection = db.collection<ReportJobDoc>("reportJobs");

    const query: Record<string, unknown> = {};
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const start = dateParam + "T00:00:00.000Z";
      const end = dateParam + "T23:59:59.999Z";
      query.lastRunAt = { $gte: start, $lte: end };
    } else {
      query.lastRunAt = { $exists: true, $nin: [null, ""] };
    }

    const docs = await collection
      .find(query)
      .sort({ lastRunAt: -1 })
      .limit(500)
      .toArray();

    const runs = docs.map((doc) => {
      const lastRunAt = doc.lastRunAt ?? null;
      const error = doc.lastRunError ?? null;
      const status = error ? "failed" : "success";
      return {
        id: String(doc._id),
        name: doc.name ?? "unknown",
        lastRunAt,
        lastFinishedAt: lastRunAt,
        failCount: error ? 1 : 0,
        status,
        error,
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
