import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSessionFromRequest } from "@/lib/require-session";
import { setAccountPositions } from "@/lib/activities";
import { checkImportRateLimit } from "@/lib/rate-limit";
import type { Position } from "@/types/portfolio";

export const dynamic = "force-dynamic";

type PositionImportItem = {
  type: "stock" | "option" | "cash";
  ticker?: string;
  shares?: number;
  contracts?: number;
  purchasePrice?: number;
  premium?: number;
  optionType?: "call" | "put";
  strike?: number;
  expiration?: string;
};

function validatePosition(item: unknown): item is PositionImportItem {
  if (!item || typeof item !== "object") return false;
  const o = item as Record<string, unknown>;
  const type = o.type as string;
  if (type !== "stock" && type !== "option" && type !== "cash") return false;
  if (type === "cash" && o.ticker == null) return false;
  if ((type === "stock" || type === "option") && !o.ticker) return false;
  return true;
}

function toPosition(item: PositionImportItem): Position {
  const _id = new ObjectId().toString();
  const base: Position = {
    _id,
    type: item.type,
    ticker: item.ticker ?? "",
  };
  if (item.type === "stock") {
    base.shares = item.shares ?? 0;
    base.purchasePrice = item.purchasePrice;
  }
  if (item.type === "option") {
    base.contracts = item.contracts ?? 0;
    base.premium = item.premium;
    base.optionType = item.optionType;
    base.strike = item.strike;
    base.expiration = item.expiration;
  }
  if (item.type === "cash") {
    base.amount = item.shares != null ? item.shares * (item.purchasePrice ?? 1) : undefined;
    base.shares = item.shares;
    base.purchasePrice = item.purchasePrice ?? 1;
  }
  return base;
}

/**
 * POST /api/import/holdings
 * Body: { accountId: string, positions: PositionImportItem[] }
 * Replaces account.positions with the imported positions (each gets an _id).
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rateLimit = await checkImportRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Import rate limit exceeded.", retryAfter: rateLimit.retryAfter },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } }
    );
  }

  try {
    const body = await request.json();
    const accountId = typeof body?.accountId === "string" ? body.accountId.trim() : null;
    const raw = Array.isArray(body?.positions) ? body.positions : null;

    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    const positions: Position[] = [];
    for (let i = 0; i < (raw?.length ?? 0); i++) {
      if (!validatePosition(raw[i])) {
        return NextResponse.json(
          { error: `positions[${i}] invalid: need type (stock|option|cash) and ticker` },
          { status: 400 }
        );
      }
      positions.push(toPosition(raw[i] as PositionImportItem));
    }

    const updated = await setAccountPositions(accountId, positions);
    if (!updated) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({
      imported: positions.length,
      positionsCount: positions.length,
    });
  } catch (error) {
    console.error("[import/holdings]", error);
    return NextResponse.json(
      { error: "Failed to import holdings" },
      { status: 500 }
    );
  }
}
