import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseBrokerCsv } from "@/lib/csv-import";
import { parseMerrillHoldingsCsv } from "@/lib/merrill-holdings-csv";
import { parseMerrillCsv } from "@/lib/merrill-csv";

const FORMATS = ["merrill", "fidelity", "schwab", "generic"] as const;
type Format = (typeof FORMATS)[number];

const SOURCE_TYPES = ["activities", "holdings"] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

function isFormat(s: unknown): s is Format {
  return typeof s === "string" && FORMATS.includes(s as Format);
}

function isSourceType(s: unknown): s is SourceType {
  return typeof s === "string" && SOURCE_TYPES.includes(s as SourceType);
}

/**
 * POST /api/import/format
 * Body: { csv: string, format: "merrill" | "fidelity" | "schwab" | "generic", sourceType?: "activities" | "holdings" }
 * Returns: { accounts: [{ accountRef, label, activities }] } or { accounts: [{ accountRef, label, positions }] } for holdings.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const csv = typeof body?.csv === "string" ? body.csv : null;
    const format = isFormat(body?.format) ? body.format : "generic";
    const sourceType: SourceType = isSourceType(body?.sourceType) ? body.sourceType : "activities";

    if (!csv) {
      return NextResponse.json(
        { error: "csv is required (raw CSV string)" },
        { status: 400 }
      );
    }

    if (format === "merrill") {
      if (sourceType === "holdings") {
        const result = parseMerrillHoldingsCsv(csv);
        if (result.accounts.length === 0 && result.parseError) {
          return NextResponse.json(
            { accounts: [], error: result.parseError },
            { status: 200 }
          );
        }
        return NextResponse.json(result);
      }
      const result = parseMerrillCsv(csv);
      return NextResponse.json(result);
    }

    const { activities, errors } = parseBrokerCsv(
      csv,
      format === "generic" ? "generic" : format
    );
    const accounts = [
      {
        accountRef: "",
        label: "Import",
        activities,
      },
    ];
    return NextResponse.json({
      accounts,
      ...(errors.length > 0 ? { parseErrors: errors } : {}),
    });
  } catch (error) {
    console.error("[import/format]", error);
    return NextResponse.json(
      { error: "Failed to format CSV" },
      { status: 500 }
    );
  }
}
