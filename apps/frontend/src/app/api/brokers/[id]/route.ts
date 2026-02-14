import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireSessionFromRequest } from "@/lib/require-session";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

const COLLECTION = "brokers";

// GET /api/brokers/[id] - omit logo fields from JSON response. No auth.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid broker id" }, { status: 400 });
    }
    const db = await getDb();
    const broker = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
    if (!broker) {
      return NextResponse.json({ error: "Broker not found" }, { status: 404 });
    }
    const { logoData: _d, logoUrl: _u, ...rest } = broker as { _id: ObjectId; logoData?: string; logoUrl?: string; [k: string]: unknown };
    return NextResponse.json({
      ...rest,
      _id: (broker as { _id: ObjectId })._id.toString(),
    });
  } catch (error) {
    console.error("Failed to fetch broker:", error);
    return NextResponse.json(
      { error: "Failed to fetch broker" },
      { status: 500 }
    );
  }
}

// PUT /api/brokers/[id] - update name/order (logo from disk by name or color in UI)
export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await requireSessionFromRequest(request);
  if (session instanceof NextResponse) return session;
  try {
    const { id } = await ctx.params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid broker id" }, { status: 400 });
    }
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    if (name !== undefined && !name) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    const order = typeof body.order === "number" ? body.order : undefined;

    const db = await getDb();
    const setFields: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (name !== undefined) setFields.name = name;
    if (order !== undefined) setFields.order = order;

    const result = await db.collection(COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { $set: setFields }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Broker not found" }, { status: 404 });
    }

    const updated = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
    const { logoData: _d, logoUrl: _u, ...rest } = (updated ?? {}) as { _id: ObjectId; logoData?: string; logoUrl?: string; [k: string]: unknown };
    return NextResponse.json({
      ...rest,
      _id: (updated as { _id: ObjectId })?._id?.toString(),
    });
  } catch (error) {
    console.error("Failed to update broker:", error);
    return NextResponse.json(
      { error: "Failed to update broker" },
      { status: 500 }
    );
  }
}

// DELETE /api/brokers/[id]
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await requireSessionFromRequest(request);
  if (session instanceof NextResponse) return session;
  try {
    const { id } = await ctx.params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid broker id" }, { status: 400 });
    }
    const db = await getDb();
    const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Broker not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete broker:", error);
    return NextResponse.json(
      { error: "Failed to delete broker" },
      { status: 500 }
    );
  }
}
