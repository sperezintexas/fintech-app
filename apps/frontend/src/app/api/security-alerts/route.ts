import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auth } from "@/auth";
import { getDb } from "@/lib/mongodb";

const COLLECTION = "security_alerts";

export const dynamic = "force-dynamic";

/** GET /api/security-alerts - List security alerts (auth required). */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);
    const unacknowledged = searchParams.get("unacknowledged") === "true";

    const db = await getDb();
    const query: Record<string, unknown> = {};
    if (unacknowledged) query.acknowledged = { $ne: true };

    const alerts = await db
      .collection(COLLECTION)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    const formatted = alerts.map((a: { _id: ObjectId; [k: string]: unknown }) => ({
      ...a,
      _id: a._id.toString(),
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("Failed to fetch security alerts", error);
    return NextResponse.json(
      { error: "Failed to fetch security alerts" },
      { status: 500 }
    );
  }
}
