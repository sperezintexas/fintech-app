import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseMerrillCsv } from "@/lib/merrill-csv";

/**
 * POST /api/import/format-merrill
 * Body: { csv: string }
 * Returns: { accounts: [{ accountRef, label, activities }] } — same as CLI "Format Broker" output.
 * Use this to format raw Merrill Edge CSV to JSON without importing (e.g. download JSON for later import).
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const csv = typeof body?.csv === "string" ? body.csv : null;
    if (!csv) {
      return NextResponse.json(
        { error: "csv is required (raw CSV string)" },
        { status: 400 }
      );
    }

    const result = parseMerrillCsv(csv);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[import/format-merrill]", error);
    return NextResponse.json(
      { error: "Failed to format CSV" },
      { status: 500 }
    );
  }
}
