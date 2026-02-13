import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import type { GoalProgressDoc } from "@/lib/goal-progress";
import { getEffectiveGoalConfig } from "@/lib/goals-config";

export const dynamic = "force-dynamic";

const GOAL_ID = "1M_by_2030";

/** GET /api/goal-progress — Returns latest goal probability and label (from risk scanner run; label from Setup > Goals). */
export async function GET() {
  try {
    const db = await getDb();
    const [doc, config] = await Promise.all([
      db.collection<GoalProgressDoc>("goalProgress").findOne({ _id: GOAL_ID }),
      getEffectiveGoalConfig(db),
    ]);

    if (!doc) {
      return NextResponse.json({
        oneMillionBy2030Percent: undefined,
        goalLabel: config.label,
        updatedAt: undefined,
      });
    }

    return NextResponse.json({
      oneMillionBy2030Percent: doc.probabilityPercent,
      goalLabel: config.label,
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
