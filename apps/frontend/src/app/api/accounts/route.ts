import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSessionFromRequest } from "@/lib/require-session";
import { getPortfolioOr401Response } from "@/lib/tenant";
import type { Account } from "@/types/portfolio";

export const dynamic = "force-dynamic";

// GET /api/accounts - List accounts for active portfolio
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  const result = await getPortfolioOr401Response(request, session);
  if (!result.ok) return result.response;
  const { portfolio } = result;
  try {
    const db = await getDb();
    const raw = await db
      .collection("accounts")
      .find({ portfolioId: portfolio._id })
      .toArray();
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

// POST /api/accounts - Create new account in active portfolio
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  const result = await getPortfolioOr401Response(request, session);
  if (!result.ok) return result.response;
  const { portfolio } = result;
  try {
    const body = await request.json();

    const brokerType =
      body.brokerType === "Merrill" || body.brokerType === "Fidelity" ? body.brokerType : undefined;
    const brokerId = typeof body.brokerId === "string" && body.brokerId.trim() ? body.brokerId.trim() : undefined;
    const newAccount: Omit<Account, "_id"> & { portfolioId: string } = {
      name: body.name,
      ...(body.accountRef != null && body.accountRef !== "" && { accountRef: String(body.accountRef).trim() }),
      ...(brokerType && { brokerType }),
      ...(brokerId && { brokerId }),
      balance: body.balance || 0,
      riskLevel: body.riskLevel || "medium",
      strategy: body.strategy || "balanced",
      positions: [],
      recommendations: [],
      portfolioId: portfolio._id,
    };

    const db = await getDb();
    const resultInsert = await db.collection("accounts").insertOne(newAccount);

    return NextResponse.json(
      { _id: resultInsert.insertedId.toString(), ...newAccount },
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
