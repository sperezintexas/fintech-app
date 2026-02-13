/**
 * Next.js instrumentation: runs once when the Node.js server process starts.
 * Agenda is NOT started here; the smart-scheduler service is the only process that runs jobs.
 * Web app enqueues/schedules via agenda-client only.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { ensureEnv } = await import("@/lib/env");
    ensureEnv();
  } catch (err) {
    console.error("[instrumentation] ensureEnv failed:", err);
    throw err;
  }
}
