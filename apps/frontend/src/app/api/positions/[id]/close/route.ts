import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { Account, Position } from "@/types/portfolio";
import { requireSession } from "@/lib/require-session";

export const dynamic = "force-dynamic";

type CloseBody = {
  accountId: string;
  quantity: number;
  orderType: "market" | "limit";
  limitPrice?: number;
  /** Price per contract used for the close (for cash balance update). */
  pricePerContract: number;
};

/**
 * POST /api/positions/[id]/close
 * Buy to close an option position: reduce contracts or remove position.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    const { id: positionId } = await params;
    const body = (await request.json()) as CloseBody;
    const { accountId, quantity, pricePerContract } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    if (typeof quantity !== "number" || quantity < 1) {
      return NextResponse.json(
        { error: "quantity must be a positive number" },
        { status: 400 }
      );
    }

    if (typeof pricePerContract !== "number" || pricePerContract < 0) {
      return NextResponse.json(
        { error: "pricePerContract is required and must be >= 0" },
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

    const positions = account.positions ?? [];
    const position = positions.find(
      (p: Position) => p._id === positionId
    ) as Position | undefined;

    if (!position) {
      return NextResponse.json(
        { error: "Position not found" },
        { status: 404 }
      );
    }

    if (position.type !== "option") {
      return NextResponse.json(
        { error: "Buy to close is only valid for option positions" },
        { status: 400 }
      );
    }

    const contracts = position.contracts ?? 0;
    if (quantity > contracts) {
      return NextResponse.json(
        { error: `Quantity cannot exceed position size (${contracts} contracts)` },
        { status: 400 }
      );
    }

    const costToClose = quantity * pricePerContract * 100;
    const premiumReceived = quantity * (position.premium ?? 0) * 100;
    const currentBalance = account.balance ?? 0;
    const newBalance = currentBalance + premiumReceived - costToClose;

    if (quantity === contracts) {
      const result = await db.collection<AccountDoc>("accounts").updateOne(
        { _id: new ObjectId(accountId) },
        {
          $pull: { positions: { _id: positionId } },
          $set: { balance: newBalance },
        } as Record<string, unknown>
      );
      if (result.matchedCount === 0) {
        return NextResponse.json(
          { error: "Account not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        action: "removed",
        positionId,
        quantity,
        costToClose,
        newBalance,
      });
    }

    const newContracts = contracts - quantity;
    const result = await db.collection<AccountDoc>("accounts").updateOne(
      { _id: new ObjectId(accountId), "positions._id": positionId },
      {
        $set: {
          "positions.$.contracts": newContracts,
          balance: newBalance,
        },
      } as Record<string, unknown>
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Position not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      action: "reduced",
      positionId,
      quantity,
      remainingContracts: newContracts,
      costToClose,
      newBalance,
    });
  } catch (error) {
    console.error("Error closing position:", error);
    return NextResponse.json(
      { error: "Failed to close position" },
      { status: 500 }
    );
  }
}
