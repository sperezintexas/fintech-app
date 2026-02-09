/**
 * Agenda client for the web app: enqueue and schedule jobs only.
 * Does NOT start the Agenda worker (no processEvery, no job execution).
 * The smart-scheduler service is the only process that runs agenda.start() and defines handlers.
 *
 * Use this in API routes, server actions, and cron endpoints. For schedule/cancel/status,
 * use the functions in `scheduler.ts` (they call getAgendaClient internally).
 */

import Agenda from "agenda";
import { getMongoUri, getMongoDbName } from "./mongodb";

const COLLECTION = "scheduledJobs";

let agendaClient: Agenda | null = null;

/**
 * Returns a singleton Agenda instance connected to the same MongoDB collection as the
 * scheduler. Never calls start() — used only for enqueueing and querying jobs.
 */
export async function getAgendaClient(): Promise<Agenda> {
  if (agendaClient) return agendaClient;
  const uri = getMongoUri();
  const dbName = getMongoDbName();
  agendaClient = new Agenda({
    db: { address: `${uri}/${dbName}`, collection: COLLECTION },
  });
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
