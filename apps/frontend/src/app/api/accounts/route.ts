import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import type { Account } from "@/types/portfolio";
import { requireSession } from "@/lib/require-session";

// GET /api/accounts - List all accounts (_id normalized to string for client)
export async function GET() {
  try {
    const db = await getDb();
    const raw = await db.collection("accounts").find({}).toArray();
    const accounts = raw.map((a: { _id?: unknown; [k: string]: unknown }) => ({
      ...a,
      _id: a._id?.toString?.() ?? String(a._id),
    }));
    return NextResponse.json(accounts);
  } catch (error) {
    console.error("Failed to fetch accounts:", error);
    return NextResponse.json(
      { error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}

// POST /api/accounts - Create new account
export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    const body = await request.json();

    const brokerType =
      body.brokerType === "Merrill" || body.brokerType === "Fidelity" ? body.brokerType : undefined;
    const brokerId = typeof body.brokerId === "string" && body.brokerId.trim() ? body.brokerId.trim() : undefined;
    const newAccount: Omit<Account, "_id"> = {
      name: body.name,
      ...(body.accountRef != null && body.accountRef !== "" && { accountRef: String(body.accountRef).trim() }),
      ...(brokerType && { brokerType }),
      ...(brokerId && { brokerId }),
      balance: body.balance || 0,
      riskLevel: body.riskLevel || "medium",
      strategy: body.strategy || "balanced",
      positions: [],
      recommendations: [],
    };

    const db = await getDb();
    const result = await db.collection("accounts").insertOne(newAccount);

    return NextResponse.json(
      { _id: result.insertedId, ...newAccount },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create account:", error);
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}
