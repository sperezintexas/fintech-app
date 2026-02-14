import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireSessionFromRequest } from "@/lib/require-session";
import {
  getGoalConfig,
  upsertGoalConfig,
  getDefaultGoalConfig,
  type GoalConfigInput,
} from "@/lib/goals-config";

export const dynamic = "force-dynamic";

/** GET /api/goals/config — Returns current goal config (or defaults). */
export async function GET() {
  try {
    const db = await getDb();
    const doc = await getGoalConfig(db);
    const defaults = getDefaultGoalConfig();
    return NextResponse.json({
      targetValue: doc?.targetValue ?? defaults.targetValue,
      targetYear: doc?.targetYear ?? defaults.targetYear,
      label: doc?.label ?? defaults.label,
      updatedAt: doc?.updatedAt?.toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch goal config:", error);
    return NextResponse.json(
      { error: "Failed to fetch goal config" },
      { status: 500 }
    );
  }
}

/** PUT /api/goals/config — Update goal config (auth required). */
export async function PUT(request: NextRequest) {
  const session = await requireSessionFromRequest(request);
  if (session instanceof NextResponse) return session;
  try {
    const body = (await request.json()) as GoalConfigInput;
    const db = await getDb();
    const doc = await upsertGoalConfig(db, {
      targetValue: typeof body.targetValue === "number" ? body.targetValue : undefined,
      targetYear: typeof body.targetYear === "number" ? body.targetYear : undefined,
      label: typeof body.label === "string" ? body.label : undefined,
    });
    return NextResponse.json({
      targetValue: doc.targetValue,
      targetYear: doc.targetYear,
      label: doc.label,
      updatedAt: doc.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Failed to update goal config:", error);
    return NextResponse.json(
      { error: "Failed to update goal config" },
      { status: 500 }
    );
  }
}
