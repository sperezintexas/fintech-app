/**
 * Next.js instrumentation: runs once when the Node.js server process starts.
 * Used to start the Agenda scheduler so jobs run in long-lived deployments (AWS App Runner, EC2).
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { getAgenda } = await import("@/lib/scheduler");
    await getAgenda();
    console.log("[instrumentation] Agenda scheduler started at process startup");
  } catch (err) {
    console.warn(
      "[instrumentation] Agenda scheduler failed to start at startup (will retry on first use):",
      err instanceof Error ? err.message : err
    );
  }
}
