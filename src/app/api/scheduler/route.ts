import { NextRequest, NextResponse } from "next/server";
import {
  getAgenda,
  scheduleJob,
  runJobNow,
  getJobStatus,
  cancelJob,
} from "@/lib/scheduler";

export const dynamic = "force-dynamic";

// GET - Get job status and schedules
export async function GET() {
  try {
    // Initialize agenda if not already running
    await getAgenda();

    const status = await getJobStatus();

    return NextResponse.json({
      status: "running",
      ...status,
    });
  } catch (error) {
    console.error("Failed to get scheduler status:", error);
    return NextResponse.json(
      { error: "Failed to get scheduler status" },
      { status: 500 }
    );
  }
}

// POST - Manage jobs (schedule, run, cancel)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, jobName, schedule, data } = body;

    // Initialize agenda
    await getAgenda();

    switch (action) {
      case "schedule": {
        if (!jobName || !schedule) {
          return NextResponse.json(
            { error: "jobName and schedule are required" },
            { status: 400 }
          );
        }

        await scheduleJob(jobName, schedule, data);

        return NextResponse.json({
          success: true,
          message: `Job "${jobName}" scheduled with "${schedule}"`,
        });
      }

      case "run": {
        if (!jobName) {
          return NextResponse.json(
            { error: "jobName is required" },
            { status: 400 }
          );
        }

        await runJobNow(jobName, data);

        return NextResponse.json({
          success: true,
          message: `Job "${jobName}" triggered to run now`,
        });
      }

      case "cancel": {
        if (!jobName) {
          return NextResponse.json(
            { error: "jobName is required" },
            { status: 400 }
          );
        }

        const cancelled = await cancelJob(jobName);

        return NextResponse.json({
          success: true,
          message: `Cancelled ${cancelled} job(s)`,
        });
      }

      case "runPortfolio": {
        await runJobNow("daily-analysis", {});
        await runJobNow("OptionScanner", {});
        await runJobNow("coveredCallScanner", {});
        await runJobNow("protectivePutScanner", {});
        await runJobNow("straddleStrangleScanner", {});
        await runJobNow("deliverAlerts", {});

        return NextResponse.json({
          success: true,
          message: "Portfolio scanners triggered (daily-analysis, OptionScanner, coveredCallScanner, protectivePutScanner, straddleStrangleScanner, deliverAlerts)",
        });
      }

      case "setup-defaults": {
        // Set up default scheduled jobs
        await scheduleJob("daily-analysis", "0 16 * * 1-5"); // 4 PM Mon-Fri
        await scheduleJob("cleanup-alerts", "0 2 * * 0"); // 2 AM Sunday
        await scheduleJob("OptionScanner", "0 16 * * 1-5", {}); // 4 PM Mon-Fri
        await scheduleJob("coveredCallScanner", "0 16 * * 1-5", {}); // 4 PM Mon-Fri
        await scheduleJob("protectivePutScanner", "0 16 * * 1-5", {}); // 4 PM Mon-Fri
        await scheduleJob("straddleStrangleScanner", "0 16 * * 1-5", {}); // 4 PM Mon-Fri
        await scheduleJob("deliverAlerts", "15 16 * * 1-5", {}); // 4:15 PM Mon-Fri (post-scanners)

        return NextResponse.json({
          success: true,
          message: "Default jobs scheduled",
          jobs: [
            { name: "daily-analysis", schedule: "0 16 * * 1-5 (4 PM Mon-Fri)" },
            { name: "cleanup-alerts", schedule: "0 2 * * 0 (2 AM Sunday)" },
            { name: "OptionScanner", schedule: "0 16 * * 1-5 (4 PM Mon-Fri)" },
            { name: "coveredCallScanner", schedule: "0 16 * * 1-5 (4 PM Mon-Fri)" },
            { name: "protectivePutScanner", schedule: "0 16 * * 1-5 (4 PM Mon-Fri)" },
            { name: "straddleStrangleScanner", schedule: "0 16 * * 1-5 (4 PM Mon-Fri)" },
            { name: "deliverAlerts", schedule: "15 16 * * 1-5 (4:15 PM Mon-Fri)" },
          ],
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Scheduler action failed:", error);
    return NextResponse.json(
      { error: "Scheduler action failed" },
      { status: 500 }
    );
  }
}
