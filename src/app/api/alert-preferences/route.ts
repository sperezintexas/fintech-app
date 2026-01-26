import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type { AlertPreferences } from "@/types/portfolio";

export const dynamic = "force-dynamic";

// GET - Fetch alert preferences for an account
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const prefs = await db.collection("alertPreferences").findOne({
      accountId: accountId,
    });

    if (!prefs) {
      // Return default preferences if none exist
      const defaultPrefs: Omit<AlertPreferences, "_id"> = {
        accountId,
        channels: [],
        templateId: "concise",
        frequency: "daily",
        severityFilter: ["warning", "urgent", "critical"],
        thresholds: {
          profitThreshold: 50,
          lossThreshold: 20,
          dteWarning: 7,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return NextResponse.json(defaultPrefs);
    }

    return NextResponse.json({
      ...prefs,
      _id: prefs._id.toString(),
    });
  } catch (error) {
    console.error("Failed to fetch alert preferences:", error);
    return NextResponse.json(
      { error: "Failed to fetch alert preferences" },
      { status: 500 }
    );
  }
}

// POST - Create or update alert preferences
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      accountId,
      channels,
      templateId,
      frequency,
      severityFilter,
      quietHoursStart,
      quietHoursEnd,
      quietHoursTimezone,
      thresholds,
    } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Validate account exists
    const account = await db.collection("accounts").findOne({
      _id: new ObjectId(accountId),
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const now = new Date().toISOString();

    // Check if preferences already exist
    const existing = await db.collection("alertPreferences").findOne({
      accountId: accountId,
    });

    const prefsData: Omit<AlertPreferences, "_id"> = {
      accountId,
      channels: channels || [],
      templateId: templateId || "concise",
      frequency: frequency || "daily",
      severityFilter: severityFilter || ["warning", "urgent", "critical"],
      quietHoursStart,
      quietHoursEnd,
      quietHoursTimezone,
      thresholds: thresholds || {
        profitThreshold: 50,
        lossThreshold: 20,
        dteWarning: 7,
      },
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    if (existing) {
      // Update existing
      await db.collection("alertPreferences").updateOne(
        { accountId: accountId },
        { $set: prefsData }
      );
      return NextResponse.json({
        ...prefsData,
        _id: existing._id.toString(),
        message: "Alert preferences updated",
      });
    } else {
      // Create new
      const result = await db.collection("alertPreferences").insertOne(prefsData);
      return NextResponse.json({
        ...prefsData,
        _id: result.insertedId.toString(),
        message: "Alert preferences created",
      });
    }
  } catch (error) {
    console.error("Failed to save alert preferences:", error);
    return NextResponse.json(
      { error: "Failed to save alert preferences" },
      { status: 500 }
    );
  }
}
