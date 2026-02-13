import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

// POST - Register push subscription
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subscription, accountId } = body;

    if (!subscription || !accountId) {
      return NextResponse.json(
        { error: "subscription and accountId are required" },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Check if subscription already exists
    const existing = await db.collection("pushSubscriptions").findOne({
      accountId,
      "subscription.endpoint": subscription.endpoint,
    });

    const subscriptionData = {
      accountId,
      subscription,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      // Update existing
      await db.collection("pushSubscriptions").updateOne(
        { _id: existing._id },
        { $set: subscriptionData }
      );
    } else {
      // Create new
      await db.collection("pushSubscriptions").insertOne(subscriptionData);
    }

    return NextResponse.json({
      success: true,
      message: "Push subscription registered",
    });
  } catch (error) {
    console.error("Failed to register push subscription:", error);
    return NextResponse.json(
      { error: "Failed to register push subscription" },
      { status: 500 }
    );
  }
}

// DELETE - Unregister push subscription
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const endpoint = searchParams.get("endpoint");

    if (!accountId || !endpoint) {
      return NextResponse.json(
        { error: "accountId and endpoint are required" },
        { status: 400 }
      );
    }

    const db = await getDb();

    await db.collection("pushSubscriptions").deleteMany({
      accountId,
      "subscription.endpoint": endpoint,
    });

    return NextResponse.json({
      success: true,
      message: "Push subscription removed",
    });
  } catch (error) {
    console.error("Failed to remove push subscription:", error);
    return NextResponse.json(
      { error: "Failed to remove push subscription" },
      { status: 500 }
    );
  }
}
