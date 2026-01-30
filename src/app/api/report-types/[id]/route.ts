import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { REPORT_HANDLER_KEYS, type ReportHandlerKey } from "../route";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/report-types/[id] - get by MongoDB _id or by type id
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = await getDb();

    const byObjectId = ObjectId.isValid(id) && id.length === 24;
    const query = byObjectId ? { _id: new ObjectId(id) } : { id };

    const doc = await db.collection("reportTypes").findOne(query);
    if (!doc) return NextResponse.json({ error: "Report type not found" }, { status: 404 });

    return NextResponse.json({
      ...doc,
      _id: (doc as { _id: ObjectId })._id.toString(),
    });
  } catch (error) {
    console.error("Failed to fetch report type:", error);
    return NextResponse.json({ error: "Failed to fetch report type" }, { status: 500 });
  }
}

// PUT /api/report-types/[id]
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      id?: string;
      handlerKey?: string;
      name?: string;
      description?: string;
      supportsPortfolio?: boolean;
      supportsAccount?: boolean;
      order?: number;
      enabled?: boolean;
    };

    const db = await getDb();
    const byObjectId = ObjectId.isValid(id) && id.length === 24;
    const query = byObjectId ? { _id: new ObjectId(id) } : { id };
    const existing = await db.collection("reportTypes").findOne(query);
    if (!existing) return NextResponse.json({ error: "Report type not found" }, { status: 404 });

    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      update.name = name;
    }
    if (body.description !== undefined) update.description = body.description.trim();
    if (body.handlerKey !== undefined) {
      if (!REPORT_HANDLER_KEYS.includes(body.handlerKey as ReportHandlerKey)) {
        return NextResponse.json(
          { error: `handlerKey must be one of: ${REPORT_HANDLER_KEYS.join(", ")}` },
          { status: 400 }
        );
      }
      update.handlerKey = body.handlerKey;
    }
    if (body.supportsPortfolio !== undefined) update.supportsPortfolio = body.supportsPortfolio;
    if (body.supportsAccount !== undefined) update.supportsAccount = body.supportsAccount;
    if (body.order !== undefined) update.order = body.order;
    if (body.enabled !== undefined) update.enabled = body.enabled;
    if (body.id !== undefined) {
      const newId = body.id.trim().toLowerCase().replace(/\s+/g, "-");
      if (!newId) return NextResponse.json({ error: "id cannot be empty" }, { status: 400 });
      const conflict = await db.collection("reportTypes").findOne({ id: newId });
      if (conflict && (conflict as { _id: ObjectId })._id.toString() !== (existing as { _id: ObjectId })._id.toString()) {
        return NextResponse.json({ error: "A report type with this id already exists" }, { status: 400 });
      }
      update.id = newId;
    }

    await db.collection("reportTypes").updateOne(query, { $set: update });
    const updated = await db.collection("reportTypes").findOne(query);

    return NextResponse.json({
      ...updated,
      _id: (updated as { _id: ObjectId })._id.toString(),
    });
  } catch (error) {
    console.error("Failed to update report type:", error);
    return NextResponse.json({ error: "Failed to update report type" }, { status: 500 });
  }
}

// DELETE /api/report-types/[id]
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = await getDb();

    const byObjectId = ObjectId.isValid(id) && id.length === 24;
    const query = byObjectId ? { _id: new ObjectId(id) } : { id };
    const existing = await db.collection("reportTypes").findOne(query);
    if (!existing) return NextResponse.json({ error: "Report type not found" }, { status: 404 });

    const typeId = (existing as unknown as { id: string }).id;
    const inUse = await db.collection("reportJobs").countDocuments({ jobType: typeId });
    if (inUse > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${inUse} job(s) use this type. Disable it instead or update those jobs first.` },
        { status: 400 }
      );
    }

    await db.collection("reportTypes").deleteOne(query);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete report type:", error);
    return NextResponse.json({ error: "Failed to delete report type" }, { status: 500 });
  }
}
