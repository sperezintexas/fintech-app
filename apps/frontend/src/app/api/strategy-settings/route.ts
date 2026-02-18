import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { StrategySettings } from "@/types/portfolio";
import {
  optionScannerConfigSchema,
  coveredCallScannerConfigSchema,
  cspAnalysisConfigSchema,
  straddleStrangleScannerConfigSchema,
  DEFAULT_OPTION_SCANNER_CONFIG,
  DEFAULT_COVERED_CALL_CONFIG,
  DEFAULT_PROTECTIVE_PUT_CONFIG,
  DEFAULT_STRADDLE_STRANGLE_CONFIG,
} from "@/lib/job-config-schemas";

export const dynamic = "force-dynamic";

type StrategySettingsDoc = Omit<StrategySettings, "_id"> & { _id: ObjectId };

function defaultThresholds(): StrategySettings["thresholds"] {
  return {
    "covered-call": { minOpenInterest: 500, minVolume: 0, maxAssignmentProbability: 100 },
    "cash-secured-put": { minOpenInterest: 500, minVolume: 0, maxAssignmentProbability: 100 },
  };
}

function mergeScannerConfigs(
  saved: StrategySettings["scannerConfigs"]
): NonNullable<StrategySettings["scannerConfigs"]> {
  return {
    optionScanner: { ...DEFAULT_OPTION_SCANNER_CONFIG, ...saved?.optionScanner },
    coveredCall: {
      ...DEFAULT_COVERED_CALL_CONFIG,
      ...saved?.coveredCall,
      expirationRange:
        saved?.coveredCall?.expirationRange != null
          ? { ...(DEFAULT_COVERED_CALL_CONFIG?.expirationRange ?? {}), ...saved.coveredCall.expirationRange }
          : (DEFAULT_COVERED_CALL_CONFIG?.expirationRange ?? { minDays: 3, maxDays: 14 }),
    },
    protectivePut: { ...DEFAULT_PROTECTIVE_PUT_CONFIG, ...saved?.protectivePut },
    straddleStrangle: { ...DEFAULT_STRADDLE_STRANGLE_CONFIG, ...saved?.straddleStrangle },
  };
}

function parseAndValidateScannerConfigs(body: unknown): StrategySettings["scannerConfigs"] | undefined {
  if (body == null || (typeof body === "object" && Object.keys(body as object).length === 0)) return undefined;
  const raw = body as Record<string, unknown>;
  const result: NonNullable<StrategySettings["scannerConfigs"]> = {};
  if (raw.optionScanner != null && typeof raw.optionScanner === "object") {
    result.optionScanner = optionScannerConfigSchema.parse(raw.optionScanner);
  }
  if (raw.coveredCall != null && typeof raw.coveredCall === "object") {
    result.coveredCall = coveredCallScannerConfigSchema.parse(raw.coveredCall);
  }
  if (raw.protectivePut != null && typeof raw.protectivePut === "object") {
    result.protectivePut = cspAnalysisConfigSchema.parse(raw.protectivePut);
  }
  if (raw.straddleStrangle != null && typeof raw.straddleStrangle === "object") {
    result.straddleStrangle = straddleStrangleScannerConfigSchema.parse(raw.straddleStrangle);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

// GET /api/strategy-settings?accountId=...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId")?.trim();
    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    const db = await getDb();
    const existing = await db
      .collection<StrategySettingsDoc>("strategySettings")
      .findOne({ accountId });

    if (existing) {
      const defaults = defaultThresholds();
      const thresholds = {
        "covered-call": {
          minOpenInterest: existing.thresholds?.["covered-call"]?.minOpenInterest ?? defaults["covered-call"].minOpenInterest,
          minVolume: existing.thresholds?.["covered-call"]?.minVolume ?? defaults["covered-call"].minVolume,
          maxAssignmentProbability: existing.thresholds?.["covered-call"]?.maxAssignmentProbability ?? defaults["covered-call"].maxAssignmentProbability,
        },
        "cash-secured-put": {
          minOpenInterest: existing.thresholds?.["cash-secured-put"]?.minOpenInterest ?? defaults["cash-secured-put"].minOpenInterest,
          minVolume: existing.thresholds?.["cash-secured-put"]?.minVolume ?? defaults["cash-secured-put"].minVolume,
          maxAssignmentProbability: existing.thresholds?.["cash-secured-put"]?.maxAssignmentProbability ?? defaults["cash-secured-put"].maxAssignmentProbability,
        },
      };
      const excludeWatchlist = existing.excludeWatchlist !== false;
      const scannerConfigs = mergeScannerConfigs((existing as StrategySettingsDoc & { scannerConfigs?: StrategySettings["scannerConfigs"] }).scannerConfigs);
      return NextResponse.json({
        ...existing,
        excludeWatchlist,
        thresholds,
        scannerConfigs,
        _id: existing._id.toString(),
      });
    }

    const now = new Date().toISOString();
    return NextResponse.json({
      _id: "default",
      accountId,
      excludeWatchlist: true,
      thresholds: defaultThresholds(),
      scannerConfigs: mergeScannerConfigs(undefined),
      createdAt: now,
      updatedAt: now,
    } satisfies StrategySettings);
  } catch (error) {
    console.error("Failed to fetch strategy settings:", error);
    return NextResponse.json({ error: "Failed to fetch strategy settings" }, { status: 500 });
  }
}

// PUT /api/strategy-settings
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      accountId?: string;
      excludeWatchlist?: boolean;
      thresholds?: Partial<StrategySettings["thresholds"]>;
      scannerConfigs?: unknown;
    };

    const accountId = body.accountId?.trim();
    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    const excludeWatchlist = typeof body.excludeWatchlist === "boolean" ? body.excludeWatchlist : true;
    let scannerConfigs: StrategySettings["scannerConfigs"] | undefined;
    if (body.scannerConfigs !== undefined) {
      try {
        scannerConfigs = parseAndValidateScannerConfigs(body.scannerConfigs);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: `Invalid scanner config: ${msg}` }, { status: 400 });
      }
    }
    const defaults = defaultThresholds();
    const thresholds = {
      "covered-call": {
        minOpenInterest: body.thresholds?.["covered-call"]?.minOpenInterest ?? defaults["covered-call"].minOpenInterest,
        minVolume: body.thresholds?.["covered-call"]?.minVolume ?? defaults["covered-call"].minVolume,
        maxAssignmentProbability: body.thresholds?.["covered-call"]?.maxAssignmentProbability ?? defaults["covered-call"].maxAssignmentProbability,
      },
      "cash-secured-put": {
        minOpenInterest: body.thresholds?.["cash-secured-put"]?.minOpenInterest ?? defaults["cash-secured-put"].minOpenInterest,
        minVolume: body.thresholds?.["cash-secured-put"]?.minVolume ?? defaults["cash-secured-put"].minVolume,
        maxAssignmentProbability: body.thresholds?.["cash-secured-put"]?.maxAssignmentProbability ?? defaults["cash-secured-put"].maxAssignmentProbability,
      },
    };

    // Validate
    for (const key of ["covered-call", "cash-secured-put"] as const) {
      const oi = thresholds[key]?.minOpenInterest;
      const vol = thresholds[key]?.minVolume;
      const maxAssign = thresholds[key]?.maxAssignmentProbability;
      if (typeof oi !== "number" || !Number.isFinite(oi) || oi < 0) {
        return NextResponse.json(
          { error: `Invalid minOpenInterest for ${key}` },
          { status: 400 }
        );
      }
      if (typeof vol !== "number" || !Number.isFinite(vol) || vol < 0) {
        return NextResponse.json(
          { error: `Invalid minVolume for ${key}` },
          { status: 400 }
        );
      }
      if (typeof maxAssign !== "number" || !Number.isFinite(maxAssign) || maxAssign < 0 || maxAssign > 100) {
        return NextResponse.json(
          { error: `Invalid maxAssignmentProbability for ${key} (0–100)` },
          { status: 400 }
        );
      }
    }

    const db = await getDb();
    const accountExists = await db.collection("accounts").findOne({ _id: new ObjectId(accountId) });
    if (!accountExists) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const update: Omit<StrategySettingsDoc, "_id"> = {
      accountId,
      excludeWatchlist,
      thresholds: thresholds as StrategySettings["thresholds"],
      ...(scannerConfigs !== undefined && { scannerConfigs }),
      createdAt: now, // will be overridden if exists
      updatedAt: now,
    };

    const existing = await db
      .collection<StrategySettingsDoc>("strategySettings")
      .findOne({ accountId });

    if (existing) {
      const setPayload: Record<string, unknown> = {
        excludeWatchlist: update.excludeWatchlist,
        thresholds: update.thresholds,
        updatedAt: now,
      };
      if (scannerConfigs !== undefined) setPayload.scannerConfigs = scannerConfigs;
      await db.collection<StrategySettingsDoc>("strategySettings").updateOne(
        { _id: existing._id },
        { $set: setPayload }
      );

      return NextResponse.json({
        ...existing,
        excludeWatchlist: update.excludeWatchlist,
        thresholds: update.thresholds,
        ...(scannerConfigs !== undefined && { scannerConfigs: mergeScannerConfigs(scannerConfigs) }),
        updatedAt: now,
        _id: existing._id.toString(),
      });
    }

    const insertDoc: Omit<StrategySettingsDoc, "_id"> = {
      accountId,
      excludeWatchlist: update.excludeWatchlist,
      thresholds: update.thresholds,
      ...(scannerConfigs !== undefined && { scannerConfigs }),
      createdAt: now,
      updatedAt: now,
    };

    const result = await db
      .collection<StrategySettingsDoc>("strategySettings")
      .insertOne(insertDoc as StrategySettingsDoc);

    return NextResponse.json(
      {
        ...insertDoc,
        _id: result.insertedId.toString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to save strategy settings:", error);
    return NextResponse.json({ error: "Failed to save strategy settings" }, { status: 500 });
  }
}
