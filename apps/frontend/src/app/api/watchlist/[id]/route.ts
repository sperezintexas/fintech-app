import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ id: string }>;
};

// GET /api/watchlist/[id] - Get single watchlist item
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    const db = await getDb();
    const item = await db.collection("watchlist").findOne({
      _id: new ObjectId(id),
    });

    if (!item) {
      return NextResponse.json(
        { error: "Watchlist item not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...item,
      _id: item._id.toString(),
    });
  } catch (error) {
    console.error("Failed to fetch watchlist item:", error);
    return NextResponse.json(
      { error: "Failed to fetch watchlist item" },
      { status: 500 }
    );
  }
}

// PUT /api/watchlist/[id] - Update watchlist item
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    const body = await request.json();
    const {
      currentPrice,
      currentPremium,
      notes,
      quantity,
    } = body;

    const db = await getDb();

    // Build update object with only provided fields
    const updateFields: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (currentPrice !== undefined) updateFields.currentPrice = currentPrice;
    if (currentPremium !== undefined) updateFields.currentPremium = currentPremium;
    if (notes !== undefined) updateFields.notes = notes;
    if (quantity !== undefined) updateFields.quantity = quantity;

    // Calculate profit/loss if we have current price
    const existingItem = await db.collection("watchlist").findOne({
      _id: new ObjectId(id),
    });

    if (existingItem && currentPrice !== undefined) {
      const priceDiff = currentPrice - existingItem.entryPrice;
      updateFields.profitLoss = priceDiff * existingItem.quantity * (existingItem.type === "stock" ? 1 : 100);
      updateFields.profitLossPercent = (priceDiff / existingItem.entryPrice) * 100;
    }

    const result = await db.collection("watchlist").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Watchlist item not found" },
        { status: 404 }
      );
    }

    // Fetch updated item
    const updatedItem = await db.collection("watchlist").findOne({
      _id: new ObjectId(id),
    });

    return NextResponse.json({
      ...updatedItem,
      _id: updatedItem?._id.toString(),
    });
  } catch (error) {
    console.error("Failed to update watchlist item:", error);
    return NextResponse.json(
      { error: "Failed to update watchlist item" },
      { status: 500 }
    );
  }
}

// DELETE /api/watchlist/[id] - Remove from watchlist
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    const db = await getDb();
    const result = await db.collection("watchlist").deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Watchlist item not found" },
        { status: 404 }
      );
    }

    // Also delete any alerts for this item
    await db.collection("alerts").deleteMany({
      watchlistItemId: id,
    });

    return NextResponse.json({ success: true, message: "Item removed from watchlist" });
  } catch (error) {
    console.error("Failed to remove from watchlist:", error);
    return NextResponse.json(
      { error: "Failed to remove from watchlist" },
      { status: 500 }
    );
  }
}
