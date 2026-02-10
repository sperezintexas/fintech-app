import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import type { Account } from "@/types/portfolio";

// GET /api/accounts - List all accounts
export async function GET() {
  try {
    const db = await getDb();
    const accounts = await db.collection("accounts").find({}).toArray();
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
  try {
    const body = await request.json();

    const newAccount: Omit<Account, "_id"> = {
      name: body.name,
      ...(body.accountRef != null && body.accountRef !== "" && { accountRef: String(body.accountRef).trim() }),
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
