import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { AlertConfig, AlertConfigJobType } from "@/types/portfolio";

export const dynamic = "force-dynamic";

const JOB_TYPES: AlertConfigJobType[] = [
  "daily-analysis",
  "option-scanner",
  "covered-call",
  "protective-put",
  "straddle-strangle",
];

const DEFAULT_CONFIG: Omit<AlertConfig, "_id" | "createdAt" | "updatedAt"> = {
  jobType: "option-scanner",
  channels: ["slack"],
  templateId: "concise",
  thresholds: { minPlPercent: 10, maxDte: 45 },
  quietHours: { start: "22:00", end: "08:00", timezone: "America/New_York" },
  enabled: true,
};

// GET - List alert configs (optionally filter by jobType, accountId)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobType = searchParams.get("jobType") as AlertConfigJobType | null;
    const accountId = searchParams.get("accountId");

    const db = await getDb();
    const query: Record<string, unknown> = {};
    if (jobType) query.jobType = jobType;
    if (accountId) query.accountId = accountId;

    const configs = await db
      .collection<AlertConfig>("alertConfigs")
      .find(query)
      .sort({ jobType: 1, accountId: 1 })
      .toArray();

    const formatted = configs.map((c) => ({
      ...c,
      _id: c._id?.toString(),
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("Failed to fetch alert configs:", error);
    return NextResponse.json(
      { error: "Failed to fetch alert configs" },
      { status: 500 }
    );
  }
}

// POST - Create or update alert config
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      jobType,
      accountId,
      channels,
      templateId,
      thresholds,
      quietHours,
      enabled,
    } = body;

    if (!jobType || !JOB_TYPES.includes(jobType)) {
      return NextResponse.json(
        { error: `jobType must be one of: ${JOB_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const db = await getDb();
    const now = new Date().toISOString();

    const configData: Omit<AlertConfig, "_id"> = {
      jobType,
      accountId: accountId || undefined,
      channels: Array.isArray(channels) ? channels : DEFAULT_CONFIG.channels,
      templateId: templateId || DEFAULT_CONFIG.templateId,
      thresholds: thresholds || DEFAULT_CONFIG.thresholds,
      quietHours: quietHours || DEFAULT_CONFIG.quietHours,
      enabled: enabled !== false,
      createdAt: now,
      updatedAt: now,
    };

    const existing = await db.collection<AlertConfig>("alertConfigs").findOne(
      accountId
        ? { jobType, accountId }
        : { jobType, accountId: { $exists: false } }
    );

    if (existing) {
      await db.collection("alertConfigs").updateOne(
        { _id: existing._id as unknown as ObjectId },
        { $set: { ...configData, updatedAt: now } }
      );
      return NextResponse.json({
        ...configData,
        _id: existing._id.toString(),
        message: "Alert config updated",
      });
    }

    const result = await db.collection("alertConfigs").insertOne(configData);
    return NextResponse.json(
      {
        ...configData,
        _id: result.insertedId.toString(),
        message: "Alert config created",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to save alert config:", error);
    return NextResponse.json(
      { error: "Failed to save alert config" },
      { status: 500 }
    );
  }
}
