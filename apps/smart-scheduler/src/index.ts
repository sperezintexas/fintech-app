/**
 * Smart Scheduler entry point — master job runner only.
 * Local/Next.js node is a slave (enqueue/schedule via agenda-client); this process is the
 * single master that runs job handlers. Set AGENDA_MASTER=true when running this process
 * (e.g. in production). Set JOB_RUNNER=false or omit AGENDA_MASTER locally to avoid
 * running jobs on the same machine as the web app.
 */

import { Agenda } from "agenda";
import { getMongoUri, getMongoDbName, getMongoClientOptions } from "@/lib/mongodb";
import { defineJobs, scheduleJob } from "@/lib/scheduler";

console.log("[smart-scheduler] module loaded");
const COLLECTION = "scheduledJobs";

async function main() {
  console.log("[smart-scheduler] main() entered");
  if (process.env.JOB_RUNNER === "false") {
    console.log("[smart-scheduler] JOB_RUNNER=false, exiting without starting (slave)");
    process.exit(0);
  }
  if (process.env.AGENDA_MASTER !== "true") {
    console.log("[smart-scheduler] AGENDA_MASTER not set; this node is a slave. Set AGENDA_MASTER=true on the remote master to run jobs.");
    process.exit(0);
  }
  const mongoUri = getMongoUri();
  const dbName = getMongoDbName();
  if (!mongoUri) throw new Error("MONGODB_URI required");
  console.log("[smart-scheduler] MONGODB_URI and DB name resolved");

  // Agenda uses mongodb@4 types; app uses mongodb@7. Use explicit shape so ts-node never compares the two.
  const opts = getMongoClientOptions();
  const mongoOptions: { family?: number; serverSelectionTimeoutMS?: number } = {
    family: opts.family,
    serverSelectionTimeoutMS: opts.serverSelectionTimeoutMS,
  };
  console.log("[smart-scheduler] mongo options built, creating Agenda");
  const agenda = new Agenda({
    db: {
      address: `${mongoUri}/${dbName}`,
      collection: COLLECTION,
      options: mongoOptions,
    },
    processEvery: "1 minute",
    maxConcurrency: 1,
  });
  console.log("[smart-scheduler] Agenda instance created, defining jobs");

  defineJobs(agenda);

  agenda.on("ready", () => console.log("[smart-scheduler] Agenda ready"));
  agenda.on("error", (err: Error) => console.error("[smart-scheduler] Agenda error:", err));

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

main().catch((err: unknown) => {
  console.error("[smart-scheduler] Fatal:", err);
  process.exit(1);
});
