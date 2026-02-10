/**
 * POST /api/import/broker
 * Body: { broker, exportType, csv, mappings: { [accountRef]: accountId }, recomputePositions?: boolean }
 * Parses CSV once, then imports each account per mappings. No intermediary JSON.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { importActivitiesForAccount, setAccountPositions } from "@/lib/activities";
import { parseBrokerCsv } from "@/lib/csv-import";
import { parseMerrillHoldingsCsv } from "@/lib/merrill-holdings-csv";
import { parseMerrillCsv } from "@/lib/merrill-csv";
import { ObjectId } from "mongodb";
import type { ActivityImportItem, Position } from "@/types/portfolio";

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

function isMappings(m: unknown): m is Record<string, string> {
  if (!m || typeof m !== "object") return false;
  const o = m as Record<string, unknown>;
  return Object.values(o).every((v) => typeof v === "string");
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
    const mappings = isMappings(body?.mappings) ? body.mappings : {};
    const recomputePositions = body?.recomputePositions !== false;

    if (!csv || !csv.trim()) {
      return NextResponse.json({ error: "csv is required" }, { status: 400 });
    }

    if (broker === "fidelity" && exportType === "holdings") {
      return NextResponse.json(
        { error: "Fidelity Holdings is not supported." },
        { status: 400 }
      );
    }

    type AccountEntry = {
      accountRef: string;
      label: string;
      activities?: unknown[];
      positions?: unknown[];
    };

    let accounts: AccountEntry[] = [];

    if (broker === "merrill") {
      if (exportType === "holdings") {
        const result = parseMerrillHoldingsCsv(csv);
        if (result.accounts.length === 0) {
          return NextResponse.json(
            { error: result.parseError ?? "No accounts parsed from Holdings CSV." },
            { status: 400 }
          );
        }
        accounts = result.accounts.map((a) => ({
          accountRef: a.accountRef,
          label: a.label,
          positions: a.positions,
        }));
      } else {
        const result = parseMerrillCsv(csv);
        accounts = result.accounts.map((a) => ({
          accountRef: a.accountRef,
          label: a.label,
          activities: a.activities,
        }));
      }
    } else {
      const { activities, errors } = parseBrokerCsv(csv, "fidelity");
      if (activities.length === 0 && errors.length > 0) {
        return NextResponse.json(
          { error: "Parse failed", details: errors },
          { status: 400 }
        );
      }
      accounts = [{ accountRef: "", label: "Fidelity", activities }];
    }

    const results: Array<{ accountRef: string; label: string; imported: number; positionsCount?: number; error?: string }> = [];
    let firstAccountId: string | null = null;

    for (const acc of accounts) {
      const key = acc.accountRef || acc.label || "default";
      const accountId = mappings[key] ?? null;
      const label = acc.label || acc.accountRef || key;

      if (!accountId) {
        results.push({ accountRef: acc.accountRef, label, imported: 0, error: "No app account selected" });
        continue;
      }
      if (!firstAccountId) firstAccountId = accountId;

      if (exportType === "holdings" && Array.isArray(acc.positions) && acc.positions.length > 0) {
        const positions: Position[] = (acc.positions as Record<string, unknown>[]).map((p) => {
          const type = (p.type as string) || "stock";
          const ticker = String(p.ticker ?? "").toUpperCase();
          const pos: Position = {
            _id: new ObjectId().toString(),
            type: type as "stock" | "option" | "cash",
            ticker,
          };
          if (type === "stock") {
            pos.shares = Number(p.shares ?? 0);
            pos.purchasePrice = p.purchasePrice != null ? Number(p.purchasePrice) : undefined;
          }
          if (type === "option") {
            pos.contracts = Number(p.contracts ?? 0);
            pos.premium = p.premium != null ? Number(p.premium) : undefined;
            pos.optionType = p.optionType as "call" | "put" | undefined;
            pos.strike = p.strike != null ? Number(p.strike) : undefined;
            pos.expiration = typeof p.expiration === "string" ? p.expiration : undefined;
          }
          if (type === "cash") {
            pos.amount = p.shares != null ? Number(p.shares) * (p.purchasePrice != null ? Number(p.purchasePrice) : 1) : undefined;
          }
          return pos;
        });
        const updated = await setAccountPositions(accountId, positions);
        results.push({
          accountRef: acc.accountRef,
          label,
          imported: updated ? positions.length : 0,
          positionsCount: positions.length,
        });
        continue;
      }

      const activities = Array.isArray(acc.activities) ? acc.activities : [];
      const result = await importActivitiesForAccount(accountId, activities as ActivityImportItem[], recomputePositions);
      if (result === null) {
        results.push({ accountRef: acc.accountRef, label, imported: 0, error: "Account not found" });
        continue;
      }
      results.push({
        accountRef: acc.accountRef,
        label,
        imported: result.imported,
        positionsCount: result.positionsCount,
      });
    }

    return NextResponse.json({
      results,
      linkAccountId: firstAccountId ?? undefined,
    });
  } catch (error) {
    console.error("[import/broker]", error);
    return NextResponse.json(
      { error: "Failed to import" },
      { status: 500 }
    );
  }
}
