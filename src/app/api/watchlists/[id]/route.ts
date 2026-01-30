import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/watchlists/[id]
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const db = await getDb();
    const watchlist = await db.collection("watchlists").findOne({
      _id: new ObjectId(id),
    });

    if (!watchlist) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...watchlist,
      _id: watchlist._id.toString(),
    });
  } catch (error) {
    console.error("Failed to fetch watchlist:", error);
    return NextResponse.json(
      { error: "Failed to fetch watchlist" },
      { status: 500 }
    );
  }
}

// PUT /api/watchlists/[id]
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = (await request.json()) as { name?: string; purpose?: string };
    const name = body.name?.trim();
    const purpose = body.purpose?.trim();

    const db = await getDb();
    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (name !== undefined) update.name = name;
    if (purpose !== undefined) update.purpose = purpose;

    const result = await db.collection("watchlists").updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }

    const updated = await db.collection("watchlists").findOne({
      _id: new ObjectId(id),
    });
    return NextResponse.json({
      ...updated,
      _id: updated?._id.toString(),
    });
  } catch (error) {
    console.error("Failed to update watchlist:", error);
    return NextResponse.json(
      { error: "Failed to update watchlist" },
      { status: 500 }
    );
  }
}

// DELETE /api/watchlists/[id]
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const db = await getDb();

    // Don't allow deleting if it's the only watchlist
    const count = await db.collection("watchlists").countDocuments({});
    if (count <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last watchlist. Create another first." },
        { status: 400 }
      );
    }

    const result = await db.collection("watchlists").deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }

    // Move items to default watchlist (first remaining)
    const defaultWatchlist = await db.collection("watchlists").findOne({});
    if (defaultWatchlist) {
      await db.collection("watchlist").updateMany(
        { watchlistId: id },
        { $set: { watchlistId: defaultWatchlist._id.toString(), updatedAt: new Date().toISOString() } }
      );
    } else {
      await db.collection("watchlist").deleteMany({ watchlistId: id });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete watchlist:", error);
    return NextResponse.json(
      { error: "Failed to delete watchlist" },
      { status: 500 }
    );
  }
}
