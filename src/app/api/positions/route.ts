import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getPositionsWithMarketValues } from "@/lib/holdings";
import type { Account, Position } from "@/types/portfolio";

export const dynamic = "force-dynamic";

// GET all positions for an account (with market values from Yahoo Finance)
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

    const { positions, hasActivities } = await getPositionsWithMarketValues(accountId);
    return NextResponse.json({ positions, hasActivities });
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
    type AccountDoc = Omit<Account, "_id"> & { _id: ObjectId };

    const newPosition: Position = {
      _id: new ObjectId().toString(),
      ...positionData,
    };

    const result = await db.collection<AccountDoc>("accounts").updateOne(
      { _id: new ObjectId(accountId) },
      { $push: { positions: newPosition } } as Record<string, unknown>
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
