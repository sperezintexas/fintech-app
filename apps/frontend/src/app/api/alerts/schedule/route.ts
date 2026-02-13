import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type { ScheduledAlert, ScheduledAlertSchedule, AlertDeliveryChannel, AlertTemplateId } from "@/types/portfolio";

export const dynamic = "force-dynamic";

// POST - Schedule an alert
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      watchlistItemId,
      alert,
      channels,
      templateId,
      schedule,
    } = body;

    if (!watchlistItemId || !alert || !channels || !templateId || !schedule) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Verify watchlist item exists
    const item = await db.collection("watchlist").findOne({
      _id: new ObjectId(watchlistItemId),
    });

    if (!item) {
      return NextResponse.json({ error: "Watchlist item not found" }, { status: 404 });
    }

    const now = new Date().toISOString();

    // Create scheduled alert
    const scheduledAlert: Omit<ScheduledAlert, "_id"> = {
      watchlistItemId,
      accountId: item.accountId,
      alert,
      channels: channels as AlertDeliveryChannel[],
      templateId: templateId as AlertTemplateId,
      schedule: schedule as ScheduledAlertSchedule,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("scheduledAlerts").insertOne(scheduledAlert);

    // If immediate schedule, trigger now
    if (schedule.type === "immediate") {
      // Queue for immediate sending (we'll handle this in the scheduler)
      await db.collection("scheduledAlerts").updateOne(
        { _id: result.insertedId },
        { $set: { status: "pending", updatedAt: new Date().toISOString() } }
      );
    }

    return NextResponse.json({
      success: true,
      scheduledAlert: {
        ...scheduledAlert,
        _id: result.insertedId.toString(),
      },
      message: "Alert scheduled successfully",
    });
  } catch (error) {
    console.error("Failed to schedule alert:", error);
    return NextResponse.json(
      { error: "Failed to schedule alert" },
      { status: 500 }
    );
  }
}

// GET - Get scheduled alerts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const status = searchParams.get("status");

    const db = await getDb();
    const query: Record<string, unknown> = {};

    if (accountId) {
      query.accountId = accountId;
    }

    if (status) {
      query.status = status;
    }

    const scheduledAlerts = await db
      .collection<ScheduledAlert>("scheduledAlerts")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(
      scheduledAlerts.map((alert) => ({
        ...alert,
        _id: alert._id.toString(),
      }))
    );
  } catch (error) {
    console.error("Failed to fetch scheduled alerts:", error);
    return NextResponse.json(
      { error: "Failed to fetch scheduled alerts" },
      { status: 500 }
    );
  }
}
