import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

type RouteParams = {
  params: Promise<{ id: string }>;
};

// GET /api/accounts/[id] - Get single account
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = await getDb();

    let accountId: ObjectId;
    try {
      accountId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
    }

    const account = await db.collection("accounts").findOne({ _id: accountId });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json(account);
  } catch (error) {
    console.error("Failed to fetch account:", error);
    return NextResponse.json(
      { error: "Failed to fetch account" },
      { status: 500 }
    );
  }
}

// PUT /api/accounts/[id] - Update account
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const db = await getDb();

    let accountId: ObjectId;
    try {
      accountId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      name: body.name,
      balance: body.balance,
      riskLevel: body.riskLevel,
      strategy: body.strategy,
    };
    const updateOps: Record<string, unknown> = { $set: updateData };
    const unset: Record<string, number> = {};
    if (body.accountRef !== undefined) {
      const ref = body.accountRef === "" ? "" : String(body.accountRef).trim();
      if (ref) {
        updateData.accountRef = ref;
      } else {
        unset.accountRef = 1;
      }
    }
    if (body.brokerType !== undefined) {
      if (body.brokerType === "Merrill" || body.brokerType === "Fidelity") {
        updateData.brokerType = body.brokerType;
      } else {
        unset.brokerType = 1;
      }
    }
    if (Object.keys(unset).length > 0) {
      (updateOps as Record<string, unknown>).$unset = unset;
    }

    const result = await db.collection("accounts").updateOne({ _id: accountId }, updateOps);

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const updated = await db.collection("accounts").findOne({ _id: accountId });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update account:", error);
    return NextResponse.json(
      { error: "Failed to update account" },
      { status: 500 }
    );
  }
}

// DELETE /api/accounts/[id] - Delete account
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = await getDb();

    let accountId: ObjectId;
    try {
      accountId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
    }

    const result = await db.collection("accounts").deleteOne({ _id: accountId });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete account:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
