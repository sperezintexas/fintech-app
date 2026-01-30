import { NextRequest, NextResponse } from "next/server";
import { getCleanupConfig, setCleanupConfig } from "@/lib/app-util";
import { getDbStats } from "@/lib/cleanup-storage";

export const dynamic = "force-dynamic";

/** GET - Return app config (cleanup settings) and current storage stats */
export async function GET() {
  try {
    const [config, stats] = await Promise.all([
      getCleanupConfig(),
      getDbStats(),
    ]);
    return NextResponse.json({
      cleanup: config,
      storage: {
        dataSizeMB: Math.round(stats.dataSizeMB * 100) / 100,
        percentOfLimit: Math.round(stats.percentOfLimit * 10) / 10,
      },
    });
  } catch (error) {
    console.error("Failed to fetch app config:", error);
    return NextResponse.json(
      { error: "Failed to fetch app config" },
      { status: 500 }
    );
  }
}

/** PUT - Update app config (cleanup settings) */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const cleanup = body.cleanup as {
      storageLimitMB?: number;
      purgeThreshold?: number;
      purgeIntervalDays?: number;
    };

    if (!cleanup || typeof cleanup !== "object") {
      return NextResponse.json(
        { error: "cleanup object required" },
        { status: 400 }
      );
    }

    const config: Partial<{ storageLimitMB: number; purgeThreshold: number; purgeIntervalDays: number }> = {};
    if (typeof cleanup.storageLimitMB === "number" && cleanup.storageLimitMB > 0) {
      config.storageLimitMB = cleanup.storageLimitMB;
    }
    if (typeof cleanup.purgeThreshold === "number" && cleanup.purgeThreshold >= 0.01 && cleanup.purgeThreshold <= 1) {
      config.purgeThreshold = cleanup.purgeThreshold;
    }
    if (typeof cleanup.purgeIntervalDays === "number" && cleanup.purgeIntervalDays >= 1 && cleanup.purgeIntervalDays <= 365) {
      config.purgeIntervalDays = cleanup.purgeIntervalDays;
    }

    const updated = await setCleanupConfig(config);
    return NextResponse.json({ cleanup: updated });
  } catch (error) {
    console.error("Failed to save app config:", error);
    return NextResponse.json(
      { error: "Failed to save app config" },
      { status: 500 }
    );
  }
}
