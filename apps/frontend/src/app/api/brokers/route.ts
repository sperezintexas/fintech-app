import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { requireSession } from "@/lib/require-session";

export const dynamic = "force-dynamic";

const COLLECTION = "brokers";

// GET /api/brokers - List all brokers (sorted by order, then name). Strips internal logo fields.
export async function GET() {
  try {
    const db = await getDb();
    const raw = await db
      .collection(COLLECTION)
      .find({})
      .sort({ order: 1, name: 1 })
      .toArray();
    const brokers = raw.map((b: { _id?: unknown; logoData?: string; logoUrl?: string; [k: string]: unknown }) => {
      const { logoData: _d, logoUrl: _u, ...rest } = b;
      return {
        ...rest,
        _id: b._id?.toString?.() ?? String(b._id),
      };
    });
    return NextResponse.json(brokers);
  } catch (error) {
    console.error("Failed to fetch brokers:", error);
    return NextResponse.json(
      { error: "Failed to fetch brokers" },
      { status: 500 }
    );
  }
}

// POST /api/brokers - Create broker (logo from disk by name or color fallback in UI)
export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }
    const order = typeof body.order === "number" ? body.order : undefined;

    const db = await getDb();
    const now = new Date().toISOString();
    const doc = {
      name,
      ...(order !== undefined && { order }),
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection(COLLECTION).insertOne(doc as { name: string; order?: number; createdAt: string; updatedAt: string });
    const inserted = await db.collection(COLLECTION).findOne({ _id: result.insertedId });
    const broker = {
      ...inserted,
      _id: (inserted as { _id: ObjectId })?._id?.toString(),
    };
    delete (broker as Record<string, unknown>).logoData;
    delete (broker as Record<string, unknown>).logoUrl;
    return NextResponse.json(broker, { status: 201 });
  } catch (error) {
    console.error("Failed to create broker:", error);
    return NextResponse.json(
      { error: "Failed to create broker" },
      { status: 500 }
    );
  }
}
