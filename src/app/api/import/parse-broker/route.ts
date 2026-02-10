/**
 * POST /api/import/parse-broker
 * Body: { broker: "merrill" | "fidelity", exportType: "activities" | "holdings", csv: string }
 * Returns: { accounts: [{ accountRef, label, activities? | positions? }] } for preview.
 * Merrill: activities + holdings. Fidelity: activities only.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseBrokerCsv } from "@/lib/csv-import";
import { parseMerrillHoldingsCsv } from "@/lib/merrill-holdings-csv";
import { parseMerrillCsv } from "@/lib/merrill-csv";

const BROKERS = ["merrill", "fidelity"] as const;
const EXPORT_TYPES = ["activities", "holdings"] as const;

type Broker = (typeof BROKERS)[number];
type ExportType = (typeof EXPORT_TYPES)[number];

function isBroker(s: unknown): s is Broker {
  return typeof s === "string" && BROKERS.includes(s as Broker);
}
function isExportType(s: unknown): s is ExportType {
  return typeof s === "string" && EXPORT_TYPES.includes(s as ExportType);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const csv = typeof body?.csv === "string" ? body.csv : null;
    const broker = isBroker(body?.broker) ? body.broker : "merrill";
    const exportType = isExportType(body?.exportType) ? body.exportType : "activities";

    if (!csv || !csv.trim()) {
      return NextResponse.json(
        { error: "csv is required" },
        { status: 400 }
      );
    }

    if (broker === "fidelity" && exportType === "holdings") {
      return NextResponse.json(
        { error: "Fidelity Holdings export is not supported. Use Activities." },
        { status: 400 }
      );
    }

    if (broker === "merrill") {
      if (exportType === "holdings") {
        const result = parseMerrillHoldingsCsv(csv);
        if (result.accounts.length === 0 && result.parseError) {
          return NextResponse.json({ accounts: [], error: result.parseError }, { status: 200 });
        }
        return NextResponse.json({ accounts: result.accounts });
      }
      const result = parseMerrillCsv(csv);
      return NextResponse.json({ accounts: result.accounts });
    }

    const { activities, errors } = parseBrokerCsv(csv, "fidelity");
    const accounts = [
      {
        accountRef: "",
        label: "Fidelity",
        activities,
      },
    ];
    return NextResponse.json({
      accounts,
      ...(errors.length > 0 ? { parseErrors: errors } : {}),
    });
  } catch (error) {
    console.error("[import/parse-broker]", error);
    return NextResponse.json(
      { error: "Failed to parse CSV" },
      { status: 500 }
    );
  }
}
