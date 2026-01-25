import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { Position } from "@/types/portfolio";

export const dynamic = "force-dynamic";

// GET all positions for an account
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const account = await db
      .collection("accounts")
      .findOne({ _id: new ObjectId(accountId) });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json(account.positions || []);
  } catch (error) {
    console.error("Error fetching positions:", error);
    return NextResponse.json(
      { error: "Failed to fetch positions" },
      { status: 500 }
    );
  }
}

// POST create a new position
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, ...positionData } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    const db = await getDb();

    const newPosition: Position = {
      _id: new ObjectId().toString(),
      ...positionData,
    };

    const result = await db.collection("accounts").updateOne(
      { _id: new ObjectId(accountId) },
      { $push: { positions: newPosition } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json(newPosition, { status: 201 });
  } catch (error) {
    console.error("Error creating position:", error);
    return NextResponse.json(
      { error: "Failed to create position" },
      { status: 500 }
    );
  }
}
