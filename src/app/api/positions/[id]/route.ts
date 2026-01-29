import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type { Account } from "@/types/portfolio";

export const dynamic = "force-dynamic";

// GET a single position
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    type AccountDoc = Omit<Account, "_id"> & { _id: ObjectId };
    const account = await db
      .collection<AccountDoc>("accounts")
      .findOne({ _id: new ObjectId(accountId) });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const position = account.positions?.find((p: { _id: string }) => p._id === id);

    if (!position) {
      return NextResponse.json(
        { error: "Position not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(position);
  } catch (error) {
    console.error("Error fetching position:", error);
    return NextResponse.json(
      { error: "Failed to fetch position" },
      { status: 500 }
    );
  }
}

// PUT update a position
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { accountId, ...positionData } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    type AccountDoc = Omit<Account, "_id"> & { _id: ObjectId };

    // Update the position within the account's positions array
    const result = await db.collection<AccountDoc>("accounts").updateOne(
      { _id: new ObjectId(accountId), "positions._id": id },
      {
        $set: {
          "positions.$.type": positionData.type,
          "positions.$.ticker": positionData.ticker,
          "positions.$.shares": positionData.shares,
          "positions.$.purchasePrice": positionData.purchasePrice,
          "positions.$.currentPrice": positionData.currentPrice,
          "positions.$.strike": positionData.strike,
          "positions.$.expiration": positionData.expiration,
          "positions.$.optionType": positionData.optionType,
          "positions.$.contracts": positionData.contracts,
          "positions.$.premium": positionData.premium,
        },
      } as Record<string, unknown>
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Position not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ _id: id, ...positionData });
  } catch (error) {
    console.error("Error updating position:", error);
    return NextResponse.json(
      { error: "Failed to update position" },
      { status: 500 }
    );
  }
}

// DELETE a position
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    type AccountDoc = Omit<Account, "_id"> & { _id: ObjectId };

    const result = await db.collection<AccountDoc>("accounts").updateOne(
      { _id: new ObjectId(accountId) },
      { $pull: { positions: { _id: id } } } as Record<string, unknown>
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting position:", error);
    return NextResponse.json(
      { error: "Failed to delete position" },
      { status: 500 }
    );
  }
}
