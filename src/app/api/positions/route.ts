import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type { Account, Position } from "@/types/portfolio";
import { getMultipleTickerPrices } from "@/lib/yahoo";

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
    type AccountDoc = Omit<Account, "_id"> & { _id: ObjectId };
    const account = await db
      .collection<AccountDoc>("accounts")
      .findOne({ _id: new ObjectId(accountId) });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const positions: Position[] = account.positions || [];

    // Fetch current prices for stock positions
    const stockTickers = positions
      .filter((p) => p.type === "stock" && p.ticker)
      .map((p) => p.ticker!);

    if (stockTickers.length > 0) {
      try {
        const prices = await getMultipleTickerPrices(stockTickers);

        // Update positions with current prices
        const updatedPositions = positions.map((position) => {
          if (position.type === "stock" && position.ticker) {
            const priceData = prices.get(position.ticker.toUpperCase());
            if (priceData) {
              return { ...position, currentPrice: priceData.price };
            }
          }
          return position;
        });

        return NextResponse.json(updatedPositions);
      } catch (priceError) {
        console.error("Error fetching prices:", priceError);
        // Return positions without updated prices if price fetch fails
        return NextResponse.json(positions);
      }
    }

    return NextResponse.json(positions);
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
      { $push: { positions: newPosition } } as any
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
