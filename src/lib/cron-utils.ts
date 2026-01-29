import cronstrue from "cronstrue";

/**
 * Converts a cron expression to a human-readable schedule description.
 * Returns the raw cron on parse failure.
 */
export function cronToHuman(cron: string): string {
  try {
    return cronstrue.toString(cron.trim(), { throwExceptionOnParseError: true });
  } catch {
    return cron;
  }
}
