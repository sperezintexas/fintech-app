import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { StrategySettings } from "@/types/portfolio";

export const dynamic = "force-dynamic";

type StrategySettingsDoc = Omit<StrategySettings, "_id"> & { _id: ObjectId };

function defaultThresholds(): StrategySettings["thresholds"] {
  return {
    "covered-call": { minOpenInterest: 500, minVolume: 0, maxAssignmentProbability: 100 },
    "cash-secured-put": { minOpenInterest: 500, minVolume: 0, maxAssignmentProbability: 100 },
  };
}

// GET /api/strategy-settings?accountId=...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId")?.trim();
    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    const db = await getDb();
    const existing = await db
      .collection<StrategySettingsDoc>("strategySettings")
      .findOne({ accountId });

    if (existing) {
      const defaults = defaultThresholds();
      const thresholds = {
        "covered-call": {
          minOpenInterest: existing.thresholds?.["covered-call"]?.minOpenInterest ?? defaults["covered-call"].minOpenInterest,
          minVolume: existing.thresholds?.["covered-call"]?.minVolume ?? defaults["covered-call"].minVolume,
          maxAssignmentProbability: existing.thresholds?.["covered-call"]?.maxAssignmentProbability ?? defaults["covered-call"].maxAssignmentProbability,
        },
        "cash-secured-put": {
          minOpenInterest: existing.thresholds?.["cash-secured-put"]?.minOpenInterest ?? defaults["cash-secured-put"].minOpenInterest,
          minVolume: existing.thresholds?.["cash-secured-put"]?.minVolume ?? defaults["cash-secured-put"].minVolume,
          maxAssignmentProbability: existing.thresholds?.["cash-secured-put"]?.maxAssignmentProbability ?? defaults["cash-secured-put"].maxAssignmentProbability,
        },
      };
      return NextResponse.json({
        ...existing,
        thresholds,
        _id: existing._id.toString(),
      });
    }

    const now = new Date().toISOString();
    return NextResponse.json({
      _id: "default",
      accountId,
      thresholds: defaultThresholds(),
      createdAt: now,
      updatedAt: now,
    } satisfies StrategySettings);
  } catch (error) {
    console.error("Failed to fetch strategy settings:", error);
    return NextResponse.json({ error: "Failed to fetch strategy settings" }, { status: 500 });
  }
}

// PUT /api/strategy-settings
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      accountId?: string;
      thresholds?: Partial<StrategySettings["thresholds"]>;
    };

    const accountId = body.accountId?.trim();
    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    const defaults = defaultThresholds();
    const thresholds = {
      "covered-call": {
        minOpenInterest: body.thresholds?.["covered-call"]?.minOpenInterest ?? defaults["covered-call"].minOpenInterest,
        minVolume: body.thresholds?.["covered-call"]?.minVolume ?? defaults["covered-call"].minVolume,
        maxAssignmentProbability: body.thresholds?.["covered-call"]?.maxAssignmentProbability ?? defaults["covered-call"].maxAssignmentProbability,
      },
      "cash-secured-put": {
        minOpenInterest: body.thresholds?.["cash-secured-put"]?.minOpenInterest ?? defaults["cash-secured-put"].minOpenInterest,
        minVolume: body.thresholds?.["cash-secured-put"]?.minVolume ?? defaults["cash-secured-put"].minVolume,
        maxAssignmentProbability: body.thresholds?.["cash-secured-put"]?.maxAssignmentProbability ?? defaults["cash-secured-put"].maxAssignmentProbability,
      },
    };

    // Validate
    for (const key of ["covered-call", "cash-secured-put"] as const) {
      const oi = thresholds[key]?.minOpenInterest;
      const vol = thresholds[key]?.minVolume;
      const maxAssign = thresholds[key]?.maxAssignmentProbability;
      if (typeof oi !== "number" || !Number.isFinite(oi) || oi < 0) {
        return NextResponse.json(
          { error: `Invalid minOpenInterest for ${key}` },
          { status: 400 }
        );
      }
      if (typeof vol !== "number" || !Number.isFinite(vol) || vol < 0) {
        return NextResponse.json(
          { error: `Invalid minVolume for ${key}` },
          { status: 400 }
        );
      }
      if (typeof maxAssign !== "number" || !Number.isFinite(maxAssign) || maxAssign < 0 || maxAssign > 100) {
        return NextResponse.json(
          { error: `Invalid maxAssignmentProbability for ${key} (0–100)` },
          { status: 400 }
        );
      }
    }

    const db = await getDb();
    const accountExists = await db.collection("accounts").findOne({ _id: new ObjectId(accountId) });
    if (!accountExists) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const update: Omit<StrategySettingsDoc, "_id"> = {
      accountId,
      thresholds: thresholds as StrategySettings["thresholds"],
      createdAt: now, // will be overridden if exists
      updatedAt: now,
    };

    const existing = await db
      .collection<StrategySettingsDoc>("strategySettings")
      .findOne({ accountId });

    if (existing) {
      await db.collection<StrategySettingsDoc>("strategySettings").updateOne(
        { _id: existing._id },
        { $set: { thresholds: update.thresholds, updatedAt: now } }
      );

      return NextResponse.json({
        ...existing,
        thresholds: update.thresholds,
        updatedAt: now,
        _id: existing._id.toString(),
      });
    }

    const insertDoc: Omit<StrategySettingsDoc, "_id"> = {
      accountId,
      thresholds: update.thresholds,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db
      .collection<StrategySettingsDoc>("strategySettings")
      .insertOne(insertDoc as StrategySettingsDoc);

    return NextResponse.json(
      {
        ...insertDoc,
        _id: result.insertedId.toString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to save strategy settings:", error);
    return NextResponse.json({ error: "Failed to save strategy settings" }, { status: 500 });
  }
}
