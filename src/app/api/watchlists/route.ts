import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type { Watchlist } from "@/types/portfolio";

export const dynamic = "force-dynamic";

// GET /api/watchlists - Get all watchlists (portfolio-level)
export async function GET() {
  try {
    const db = await getDb();
    const watchlists = await db
      .collection<Watchlist & { _id: ObjectId }>("watchlists")
      .find({})
      .sort({ name: 1 })
      .toArray();

    // Ensure at least one default watchlist exists
    if (watchlists.length === 0) {
      const now = new Date().toISOString();
      const defaultWatchlist = {
        _id: new ObjectId(),
        name: "Default",
        purpose: "General watchlist for tracking positions and opportunities",
        createdAt: now,
        updatedAt: now,
      };
      await db.collection("watchlists").insertOne(defaultWatchlist);
      return NextResponse.json([
        { ...defaultWatchlist, _id: defaultWatchlist._id.toString() },
      ]);
    }

    return NextResponse.json(
      watchlists.map((w) => ({ ...w, _id: w._id.toString() }))
    );
  } catch (error) {
    console.error("Failed to fetch watchlists:", error);
    return NextResponse.json(
      { error: "Failed to fetch watchlists" },
      { status: 500 }
    );
  }
}

// POST /api/watchlists - Create a new watchlist
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { name?: string; purpose?: string };
    const name = (body.name ?? "").trim();
    const purpose = (body.purpose ?? "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const now = new Date().toISOString();
    const doc = {
      _id: new ObjectId(),
      name,
      purpose,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection("watchlists").insertOne(doc);

    return NextResponse.json(
      { ...doc, _id: doc._id.toString() },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create watchlist:", error);
    return NextResponse.json(
      { error: "Failed to create watchlist" },
      { status: 500 }
    );
  }
}
