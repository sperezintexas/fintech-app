import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { importActivitiesForAccount } from "@/lib/activities";
import { parseBrokerCsv } from "@/lib/csv-import";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const accountId =
      typeof body?.accountId === "string" ? body.accountId.trim() : null;
    const csv = typeof body?.csv === "string" ? body.csv : null;
    const format =
      body?.format === "fidelity" || body?.format === "schwab"
        ? body.format
        : "generic";
    const recomputePositions = body?.recomputePositions !== false;

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }
    if (!csv) {
      return NextResponse.json(
        { error: "csv is required (raw CSV string)" },
        { status: 400 }
      );
    }

    const { activities, errors } = parseBrokerCsv(csv, format);

    if (errors.length > 0 && activities.length === 0) {
      return NextResponse.json(
        { error: "CSV parse failed", details: errors },
        { status: 400 }
      );
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
      positionsCount: result.positionsCount,
      parseErrors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[import/csv]", error);
    return NextResponse.json(
      { error: "Failed to import CSV" },
      { status: 500 }
    );
  }
}
