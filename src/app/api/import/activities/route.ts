import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { importActivitiesForAccount } from "@/lib/activities";
import type { ActivityImportItem, ActivityType } from "@/types/portfolio";

export const dynamic = "force-dynamic";

const ACTIVITY_TYPES: ActivityType[] = [
  "BUY",
  "SELL",
  "DIVIDEND",
  "FEE",
  "INTEREST",
  "LIABILITY",
];

function validateItem(item: unknown): item is ActivityImportItem {
  if (!item || typeof item !== "object") return false;
  const o = item as Record<string, unknown>;
  return (
    typeof o.symbol === "string" &&
    o.symbol.trim().length > 0 &&
    typeof o.date === "string" &&
    typeof o.type === "string" &&
    ACTIVITY_TYPES.includes(o.type as ActivityType) &&
    typeof o.quantity === "number" &&
    typeof o.unitPrice === "number" &&
    (o.fee === undefined || typeof o.fee === "number") &&
    (o.optionType === undefined ||
      (o.optionType === "call" || o.optionType === "put")) &&
    (o.strike === undefined || typeof o.strike === "number") &&
    (o.expiration === undefined || typeof o.expiration === "string")
  );
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const accountId =
      typeof body?.accountId === "string" ? body.accountId.trim() : null;
    const activitiesRaw = Array.isArray(body?.activities) ? body.activities : null;
    const recomputePositions = body?.recomputePositions !== false;

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    const activities: ActivityImportItem[] = [];
    for (let i = 0; i < (activitiesRaw?.length ?? 0); i++) {
      if (!validateItem(activitiesRaw[i])) {
        return NextResponse.json(
          { error: `activities[${i}] invalid: need symbol, date, type, quantity, unitPrice` },
          { status: 400 }
        );
      }
      activities.push(activitiesRaw[i] as ActivityImportItem);
    }

    const result = await importActivitiesForAccount(
      accountId,
      activities,
      recomputePositions
    );
    if (result === null) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({
      imported: result.imported,
      positionsUpdated: result.positionsUpdated,
    });
  } catch (error) {
    console.error("[import/activities]", error);
    return NextResponse.json(
      { error: "Failed to import activities" },
      { status: 500 }
    );
  }
}
