/**
 * Smart Scheduler entry point.
 * Only process that starts Agenda and runs job handlers.
 * Web app must not start Agenda; it uses agenda-client to enqueue/schedule.
 * Set JOB_RUNNER=false to skip starting (e.g. local testing); default runs.
 * Run from repo root with env set (e.g. node --env-file=.env.local or export MONGODB_URI).
 */

import { Agenda } from "agenda";
import { getMongoUri, getMongoDbName } from "@/lib/mongodb";
import { defineJobs, scheduleJob } from "@/lib/scheduler";

const COLLECTION = "scheduledJobs";

async function main() {
  if (process.env.JOB_RUNNER === "false") {
    console.log("[smart-scheduler] JOB_RUNNER=false, exiting without starting");
    process.exit(0);
  }
  const mongoUri = getMongoUri();
  const dbName = getMongoDbName();
  if (!mongoUri) throw new Error("MONGODB_URI required");

  const agenda = new Agenda({
    db: { address: `${mongoUri}/${dbName}`, collection: COLLECTION },
    processEvery: "1 minute",
    maxConcurrency: 1,
  });

  defineJobs(agenda);

  agenda.on("ready", () => console.log("[smart-scheduler] Agenda ready"));
  agenda.on("error", (err) => console.error("[smart-scheduler] Agenda error:", err));

  await agenda.start();
  console.log("[smart-scheduler] Started");

  // Bootstrap default recurring job so it exists in DB (idempotent)
  try {
    await scheduleJob("refreshHoldingsPrices", "15 minutes");
    console.log("[smart-scheduler] refreshHoldingsPrices schedule ensured");
  } catch (e) {
    console.warn("[smart-scheduler] Bootstrap schedule (refreshHoldingsPrices) failed:", e instanceof Error ? e.message : e);
  }
}

main().catch((err) => {
  console.error("[smart-scheduler] Fatal:", err);
  process.exit(1);
});
