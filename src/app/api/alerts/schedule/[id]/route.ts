import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// DELETE - Cancel a scheduled alert
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Scheduled alert ID is required" },
        { status: 400 }
      );
    }

    const db = await getDb();

    const result = await db.collection("scheduledAlerts").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: "cancelled",
          updatedAt: new Date().toISOString(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Scheduled alert not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Scheduled alert cancelled",
    });
  } catch (error) {
    console.error("Failed to cancel scheduled alert:", error);
    return NextResponse.json(
      { error: "Failed to cancel scheduled alert" },
      { status: 500 }
    );
  }
}
