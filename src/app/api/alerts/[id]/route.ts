import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ id: string }>;
};

// PUT /api/alerts/[id] - Acknowledge an alert
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    const body = await request.json();
    const { acknowledged } = body;

    const db = await getDb();

    const updateFields: Record<string, unknown> = {};
    if (acknowledged !== undefined) {
      updateFields.acknowledged = acknowledged;
      if (acknowledged) {
        updateFields.acknowledgedAt = new Date().toISOString();
      }
    }

    const result = await db.collection("alerts").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Alert not found" },
        { status: 404 }
      );
    }

    const updatedAlert = await db.collection("alerts").findOne({
      _id: new ObjectId(id),
    });

    return NextResponse.json({
      ...updatedAlert,
      _id: updatedAlert?._id.toString(),
    });
  } catch (error) {
    console.error("Failed to update alert:", error);
    return NextResponse.json(
      { error: "Failed to update alert" },
      { status: 500 }
    );
  }
}

// DELETE /api/alerts/[id] - Delete an alert
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    const db = await getDb();
    const result = await db.collection("alerts").deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Alert not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete alert:", error);
    return NextResponse.json(
      { error: "Failed to delete alert" },
      { status: 500 }
    );
  }
}
