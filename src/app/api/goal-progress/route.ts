import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import type { GoalProgressDoc } from "@/lib/goal-progress";

export const dynamic = "force-dynamic";

const GOAL_ID = "1M_by_2030";

/** GET /api/goal-progress — Returns latest $1M by 2030 probability (from risk scanner run). */
export async function GET() {
  try {
    const db = await getDb();
    const doc = await db
      .collection<GoalProgressDoc>("goalProgress")
      .findOne({ _id: GOAL_ID });

    if (!doc) {
      return NextResponse.json({
        oneMillionBy2030Percent: undefined,
        updatedAt: undefined,
      });
    }

    return NextResponse.json({
      oneMillionBy2030Percent: doc.probabilityPercent,
      updatedAt: doc.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch goal progress:", error);
    return NextResponse.json(
      { error: "Failed to fetch goal progress" },
      { status: 500 }
    );
  }
}
