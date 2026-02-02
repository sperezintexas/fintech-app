/**
 * POST /api/scan-test
 * Run option scanner(s) with config for testing. Does not persist by default.
 */

import { NextRequest, NextResponse } from "next/server";
import { runUnifiedOptionsScanner } from "@/lib/unified-options-scanner";
import { scanOptions, storeOptionRecommendations } from "@/lib/option-scanner";
import {
  analyzeCoveredCalls,
  storeCoveredCallRecommendations,
} from "@/lib/covered-call-analyzer";
import {
  analyzeProtectivePuts,
  storeProtectivePutRecommendations,
} from "@/lib/protective-put-analyzer";
import {
  analyzeStraddlesAndStrangles,
  storeStraddleStrangleRecommendations,
} from "@/lib/straddle-strangle-analyzer";
import type { UnifiedOptionsScannerConfig } from "@/lib/unified-options-scanner";

export const dynamic = "force-dynamic";

type ScannerType =
  | "unified"
  | "optionScanner"
  | "coveredCall"
  | "protectivePut"
  | "straddleStrangle";

type ScanTestRequestBody = {
  scannerType: ScannerType;
  accountId?: string | null;
  config?: UnifiedOptionsScannerConfig & Record<string, unknown>;
  persist?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ScanTestRequestBody;
    const scannerType = body.scannerType ?? "unified";
    const accountId =
      body.accountId === undefined || body.accountId === ""
        ? undefined
        : String(body.accountId);
    const config = body.config as UnifiedOptionsScannerConfig | undefined;
    const persist = body.persist === true;

    if (
      !["unified", "optionScanner", "coveredCall", "protectivePut", "straddleStrangle"].includes(
        scannerType
      )
    ) {
      return NextResponse.json(
        { error: `Invalid scannerType: ${scannerType}` },
        { status: 400 }
      );
    }

    if (scannerType === "unified") {
      if (persist) {
        const result = await runUnifiedOptionsScanner(accountId, config);
        return NextResponse.json({
          success: true,
          scannerType: "unified",
          summary: result,
          recommendations: null,
          message: `Scanned ${result.totalScanned}, stored ${result.totalStored}, alerts ${result.totalAlertsCreated}`,
        });
      }
      const [optionRecs, coveredCallRecs, protectivePutRecs, straddleRecs] =
        await Promise.all([
          scanOptions(accountId, config?.optionScanner),
          analyzeCoveredCalls(accountId, config?.coveredCall),
          analyzeProtectivePuts(accountId, config?.protectivePut),
          analyzeStraddlesAndStrangles(accountId),
        ]);
      const totalScanned =
        optionRecs.length +
        coveredCallRecs.length +
        protectivePutRecs.length +
        straddleRecs.length;
      return NextResponse.json({
        success: true,
        scannerType: "unified",
        summary: {
          optionScanner: { scanned: optionRecs.length, stored: 0, alertsCreated: 0 },
          coveredCallScanner: {
            analyzed: coveredCallRecs.length,
            stored: 0,
            alertsCreated: 0,
          },
          protectivePutScanner: {
            analyzed: protectivePutRecs.length,
            stored: 0,
            alertsCreated: 0,
          },
          straddleStrangleScanner: {
            analyzed: straddleRecs.length,
            stored: 0,
            alertsCreated: 0,
          },
          totalScanned,
          totalStored: 0,
          totalAlertsCreated: 0,
        },
        recommendations: {
          optionScanner: optionRecs,
          coveredCall: coveredCallRecs,
          protectivePut: protectivePutRecs,
          straddleStrangle: straddleRecs,
        },
        message: `Scanned ${totalScanned} positions (dry run, not stored)`,
      });
    }

    if (scannerType === "optionScanner") {
      const scannerConfig = (config?.optionScanner ?? config) as import("@/types/portfolio").OptionScannerConfig | undefined;
      const recs = await scanOptions(accountId, scannerConfig);
      let stored = 0;
      let alertsCreated = 0;
      if (persist) {
        const r = await storeOptionRecommendations(recs, {
          createAlerts: true,
        });
        stored = r.stored;
        alertsCreated = r.alertsCreated;
      }
      return NextResponse.json({
        success: true,
        scannerType: "optionScanner",
        summary: {
          scanned: recs.length,
          stored,
          alertsCreated,
        },
        recommendations: recs,
      });
    }

    if (scannerType === "coveredCall") {
      const scannerConfig = config?.coveredCall ?? config;
      const recs = await analyzeCoveredCalls(accountId, scannerConfig);
      let stored = 0;
      let alertsCreated = 0;
      if (persist) {
        const r = await storeCoveredCallRecommendations(recs, {
          createAlerts: true,
        });
        stored = r.stored;
        alertsCreated = r.alertsCreated;
      }
      return NextResponse.json({
        success: true,
        scannerType: "coveredCall",
        summary: {
          analyzed: recs.length,
          stored,
          alertsCreated,
        },
        recommendations: recs,
      });
    }

    if (scannerType === "protectivePut") {
      const scannerConfig = config?.protectivePut ?? config;
      const recs = await analyzeProtectivePuts(accountId, scannerConfig);
      let stored = 0;
      let alertsCreated = 0;
      if (persist) {
        const r = await storeProtectivePutRecommendations(recs, {
          createAlerts: true,
        });
        stored = r.stored;
        alertsCreated = r.alertsCreated;
      }
      return NextResponse.json({
        success: true,
        scannerType: "protectivePut",
        summary: {
          analyzed: recs.length,
          stored,
          alertsCreated,
        },
        recommendations: recs,
      });
    }

    if (scannerType === "straddleStrangle") {
      const recs = await analyzeStraddlesAndStrangles(accountId);
      let stored = 0;
      let alertsCreated = 0;
      if (persist) {
        const r = await storeStraddleStrangleRecommendations(recs, {
          createAlerts: true,
        });
        stored = r.stored;
        alertsCreated = r.alertsCreated;
      }
      return NextResponse.json({
        success: true,
        scannerType: "straddleStrangle",
        summary: {
          analyzed: recs.length,
          stored,
          alertsCreated,
        },
        recommendations: recs,
      });
    }

    return NextResponse.json(
      { error: "Unknown scanner type" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Scan test failed:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
