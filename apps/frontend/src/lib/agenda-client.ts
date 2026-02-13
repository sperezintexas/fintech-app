/**
 * Agenda client for the slave node (Next.js / local): enqueue and schedule jobs only.
 * Does NOT start the Agenda worker (no processEvery, no job execution).
 * The master node (smart-scheduler with AGENDA_MASTER=true) is the only process that runs jobs.
 *
 * Use this in API routes, server actions, and cron endpoints. For schedule/cancel/status,
 * use the functions in `scheduler.ts` (they call getAgendaClient internally).
 */

import Agenda from "agenda";
import { connectToDatabase } from "./mongodb";

const COLLECTION = "scheduledJobs";

let agendaClient: Agenda | null = null;

/**
 * Returns a singleton Agenda instance connected to the same MongoDB collection as the
 * scheduler. Uses the app's existing Mongo Db so _collection is set immediately (no async
 * connect), avoiding "Cannot read properties of undefined (reading 'deleteMany')" when
 * calling cancel() / every() before a connection would have been established.
 */
export async function getAgendaClient(): Promise<Agenda> {
  if (agendaClient) return agendaClient;
  const { db } = await connectToDatabase();
  // Agenda's typings use an older mongodb Db; our db is compatible at runtime.
  agendaClient = new Agenda({
    mongo: db as unknown as import("agenda").Agenda["_mdb"],
    db: { address: "", collection: COLLECTION },
  } as ConstructorParameters<typeof Agenda>[0]);
  return agendaClient;
}

/**
 * Enqueue a one-off job to run as soon as the smart-scheduler picks it up.
 * @param name - Job name (must be defined in scheduler.ts defineJobs).
 * @param data - Optional payload for the job handler.
 */
export async function enqueueJob<T = Record<string, unknown>>(
  name: string,
  data?: T
): Promise<unknown> {
  const agenda = await getAgendaClient();
  return agenda.now(name, data ?? {});
}
