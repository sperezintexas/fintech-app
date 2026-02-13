/**
 * Internal API: run a report task by ID or a built-in job by name.
 * Called by the Kotlin backend scheduler (Spring). Secured with CRON_SECRET.
 *
 * POST body:
 *   - taskId: string — run executeTask(taskId) (report job from reportJobs)
 *   - jobName: "refreshHoldingsPrices" | "deliverAlerts" | "unifiedOptionsScanner" — run built-in job
 *   - accountId?: string (for deliverAlerts / unifiedOptionsScanner)
 *   - config?: object (for unifiedOptionsScanner)
 *   - lastRun?: string (ISO; for refreshHoldingsPrices throttle)
 *
 * Auth: Authorization: Bearer <CRON_SECRET> or X-Cron-Secret: <CRON_SECRET>
 */

import { NextRequest, NextResponse } from "next/server";
import { executeTask } from "@/lib/scheduler";
import {
  runBuiltInJob,
  BUILT_IN_JOB_NAMES,
  type BuiltInJobName,
  type RunBuiltInJobOptions,
} from "@/lib/scheduler";

const CRON_SECRET = process.env.CRON_SECRET;

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function verify(request: NextRequest): boolean {
  if (!CRON_SECRET) return true;
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${CRON_SECRET}`) return true;
  const secret = request.headers.get("x-cron-secret");
  if (secret === CRON_SECRET) return true;
  return false;
}

export async function POST(request: NextRequest) {
  if (!verify(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    taskId?: string;
    jobName?: string;
    accountId?: string | null;
    config?: Record<string, unknown>;
    lastRun?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body; expected { taskId?: string, jobName?: string, ... }" },
      { status: 400 }
    );
  }

  const { taskId, jobName, accountId, config, lastRun } = body;

  if (taskId && jobName) {
    return NextResponse.json(
      { error: "Provide either taskId or jobName, not both" },
      { status: 400 }
    );
  }

  if (taskId) {
    const result = await executeTask(taskId);
    return NextResponse.json(result);
  }

  if (jobName) {
    if (!BUILT_IN_JOB_NAMES.includes(jobName as BuiltInJobName)) {
      return NextResponse.json(
        { error: `Invalid jobName; allowed: ${BUILT_IN_JOB_NAMES.join(", ")}` },
        { status: 400 }
      );
    }
    const options: RunBuiltInJobOptions = {
      accountId: accountId ?? undefined,
      config,
      lastRun,
    };
    const result = await runBuiltInJob(jobName as BuiltInJobName, options);
    return NextResponse.json(result);
  }

  return NextResponse.json(
    { error: "Provide taskId or jobName in body" },
    { status: 400 }
  );
}
