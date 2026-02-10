import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { createAccountSchema, formatZodErrors } from "@/lib/api-schemas";
import { sanitizeMongoValue, logSecurityEvent } from "@/lib/security";
import type { Account } from "@/types/portfolio";

export const dynamic = "force-dynamic";

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

    // Validate input with Zod schema
    const validated = createAccountSchema.parse(body);

    // Sanitize for MongoDB (defense in depth)
    const sanitized = sanitizeMongoValue(validated);

    const newAccount: Omit<Account, "_id"> = {
      name: sanitized.name,
      balance: sanitized.balance,
      riskLevel: sanitized.riskLevel,
      strategy: sanitized.strategy,
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
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: formatZodErrors(error) },
        { status: 400 }
      );
    }

    // Log security events for suspicious input
    if (error instanceof Error && error.message.includes("injection")) {
      logSecurityEvent({
        type: "injection_attempt",
        message: error.message,
        path: "/api/accounts",
      });
      return NextResponse.json(
        { error: "Invalid input" },
        { status: 400 }
      );
    }

    console.error("Failed to create account:", error);
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}
