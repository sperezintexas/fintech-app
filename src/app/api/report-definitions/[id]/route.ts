import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { ReportDefinition, ReportDefinitionType } from "@/types/portfolio";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ id: string }>;
};

type ReportDefinitionDoc = Omit<ReportDefinition, "_id"> & { _id: ObjectId };

// PUT /api/report-definitions/[id]
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    const body = (await request.json()) as {
      name?: string;
      description?: string;
      type?: ReportDefinitionType;
    };

    const name = body.name !== undefined ? body.name.trim() : undefined;
    const description = body.description !== undefined ? body.description.trim() : undefined;
    const type = body.type;

    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (name !== undefined) {
      if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      update.name = name;
    }
    if (description !== undefined) update.description = description;
    if (type !== undefined) update.type = type;

    const db = await getDb();
    const result = await db
      .collection<ReportDefinitionDoc>("reportDefinitions")
      .updateOne({ _id: new ObjectId(id) }, { $set: update });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Report definition not found" }, { status: 404 });
    }

    const updated = await db
      .collection<ReportDefinitionDoc>("reportDefinitions")
      .findOne({ _id: new ObjectId(id) });

    return NextResponse.json({
      ...(updated as ReportDefinitionDoc),
      _id: id,
    });
  } catch (error) {
    console.error("Failed to update report definition:", error);
    return NextResponse.json({ error: "Failed to update report definition" }, { status: 500 });
  }
}

// DELETE /api/report-definitions/[id]
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    const db = await getDb();
    const result = await db.collection("reportDefinitions").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Report definition not found" }, { status: 404 });
    }

    // Also delete any report jobs referencing this report
    await db.collection("reportJobs").deleteMany({ reportId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete report definition:", error);
    return NextResponse.json({ error: "Failed to delete report definition" }, { status: 500 });
  }
}
