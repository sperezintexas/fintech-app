import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { runUnifiedOptionsScanner } from "@/lib/unified-options-scanner";
import { processAlertDelivery } from "@/lib/alert-delivery";

const CRON_SECRET = process.env.CRON_SECRET;

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function verifyCronRequest(request: NextRequest): boolean {
  if (!CRON_SECRET) return true;
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;
  const { searchParams } = new URL(request.url);
  if (searchParams.get("secret") === CRON_SECRET) return true;
  return false;
}

/**
 * GET /api/cron/unified-options-scanner
 *
 * Triggered by external cron (e.g. GitHub Actions) or by the in-app Agenda scheduler to run the
 * Unified Options Scanner every weekday at :15 during market hours (e.g. 9:15–3:15 ET).
 * Runs portfolio-level scan (first account or null), then delivers alerts.
 *
 * Schedule in UTC. Example: 15 14-20 * * 1-5 (14:15–20:15 UTC ≈ 9:15–3:15 ET). Use GitHub Actions cron workflow or CRON_SECRET when calling from outside.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  console.log("[cron/unified-options-scanner] Starting...", new Date().toISOString());

  try {
    const db = await getDb();
    const firstAccount = await db.collection("accounts").findOne({});
    const accountId = firstAccount ? firstAccount._id.toString() : undefined;

    let config: import("@/lib/unified-options-scanner").UnifiedOptionsScannerConfig | undefined;
    if (accountId) {
      const strategySettings = await db
        .collection<{ accountId: string; excludeWatchlist?: boolean }>("strategySettings")
        .findOne({ accountId });
      const excludeWatchlist = strategySettings?.excludeWatchlist !== false;
      config = {
        coveredCall: { includeWatchlist: !excludeWatchlist },
      };
    } else {
      config = { coveredCall: { includeWatchlist: false } };
    }

    const result = await runUnifiedOptionsScanner(accountId, config);

    const delivery = await processAlertDelivery(accountId ?? undefined);

    const duration = Date.now() - startTime;
    console.log(
      `[cron/unified-options-scanner] Complete: ${result.totalScanned} scanned, ${result.totalStored} stored, ${result.totalAlertsCreated} alerts; delivery: ${delivery.delivered} sent, ${delivery.failed} failed (${duration}ms)`
    );

    return NextResponse.json({
      success: true,
      message: "Unified Options Scanner and alert delivery complete",
      scanner: {
        totalScanned: result.totalScanned,
        totalStored: result.totalStored,
        totalAlertsCreated: result.totalAlertsCreated,
        errors: result.errors.length,
      },
      delivery: {
        processed: delivery.processed,
        delivered: delivery.delivered,
        failed: delivery.failed,
        skipped: delivery.skipped,
      },
      duration,
    });
  } catch (error) {
    console.error("[cron/unified-options-scanner] Failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
