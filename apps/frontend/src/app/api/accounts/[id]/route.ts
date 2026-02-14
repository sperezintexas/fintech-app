import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSessionFromRequest } from "@/lib/require-session";
import { getPortfolioOr401Response } from "@/lib/tenant";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

// GET /api/accounts/[id] - Get single account (scoped to portfolio)
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  const result = await getPortfolioOr401Response(request, session);
  if (!result.ok) return result.response;
  const { portfolio } = result;
  try {
    const { id } = await ctx.params;
    const db = await getDb();

    let accountId: ObjectId;
    try {
      accountId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
    }

    const account = await db
      .collection("accounts")
      .findOne({ _id: accountId, portfolioId: portfolio._id });

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

// PUT /api/accounts/[id] - Update account (scoped to portfolio)
export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  const result = await getPortfolioOr401Response(request, session);
  if (!result.ok) return result.response;
  const { portfolio } = result;
  try {
    const { id } = await ctx.params;
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
    if (body.brokerId !== undefined) {
      const bid = typeof body.brokerId === "string" && body.brokerId.trim() ? body.brokerId.trim() : null;
      if (bid) updateData.brokerId = bid;
      else unset.brokerId = 1;
    }
    if (Object.keys(unset).length > 0) {
      (updateOps as Record<string, unknown>).$unset = unset;
    }

    const updateResult = await db
      .collection("accounts")
      .updateOne({ _id: accountId, portfolioId: portfolio._id }, updateOps);

    if (updateResult.matchedCount === 0) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const updated = await db
      .collection("accounts")
      .findOne({ _id: accountId, portfolioId: portfolio._id });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update account:", error);
    return NextResponse.json(
      { error: "Failed to update account" },
      { status: 500 }
    );
  }
}

// DELETE /api/accounts/[id] - Delete account (scoped to portfolio)
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  const result = await getPortfolioOr401Response(request, session);
  if (!result.ok) return result.response;
  const { portfolio } = result;
  try {
    const { id } = await ctx.params;
    const db = await getDb();

    let accountId: ObjectId;
    try {
      accountId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
    }

    const deleteResult = await db
      .collection("accounts")
      .deleteOne({ _id: accountId, portfolioId: portfolio._id });

    if (deleteResult.deletedCount === 0) {
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
