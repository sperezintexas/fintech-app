/**
 * Goal configuration for the tracker (dashboard, portfolio summary, goal probability).
 * Stored in MongoDB; configurable from Setup > Goals.
 */

import type { Db } from "mongodb";

const CONFIG_ID = "primary";

const DEFAULT_TARGET_VALUE = 10_000_000;
const DEFAULT_TARGET_YEAR = 2030;
const DEFAULT_LABEL = "$10M by 2030";

export type GoalConfig = {
  _id: string;
  targetValue: number;
  targetYear: number;
  label: string;
  updatedAt: Date;
};

export type GoalConfigInput = {
  targetValue?: number;
  targetYear?: number;
  label?: string;
};

export function getDefaultGoalConfig(): Omit<GoalConfig, "_id" | "updatedAt"> {
  return {
    targetValue: DEFAULT_TARGET_VALUE,
    targetYear: DEFAULT_TARGET_YEAR,
    label: DEFAULT_LABEL,
  };
}

export async function getGoalConfig(db: Db): Promise<GoalConfig | null> {
  const doc = await db.collection<GoalConfig>("goalConfig").findOne({ _id: CONFIG_ID });
  return doc;
}

/** Returns effective config (saved or defaults). */
export async function getEffectiveGoalConfig(db: Db): Promise<{
  targetValue: number;
  targetYear: number;
  label: string;
}> {
  const doc = await getGoalConfig(db);
  if (doc) {
    return {
      targetValue: doc.targetValue ?? DEFAULT_TARGET_VALUE,
      targetYear: doc.targetYear ?? DEFAULT_TARGET_YEAR,
      label: doc.label ?? DEFAULT_LABEL,
    };
  }
  return getDefaultGoalConfig();
}

export async function upsertGoalConfig(
  db: Db,
  input: GoalConfigInput
): Promise<GoalConfig> {
  const existing = await getGoalConfig(db);
  const defaults = getDefaultGoalConfig();
  const now = new Date();
  const doc: GoalConfig = {
    _id: CONFIG_ID,
    targetValue: input.targetValue ?? existing?.targetValue ?? defaults.targetValue,
    targetYear: input.targetYear ?? existing?.targetYear ?? defaults.targetYear,
    label: (input.label ?? existing?.label ?? defaults.label).trim() || defaults.label,
    updatedAt: now,
  };
  await db.collection<GoalConfig>("goalConfig").updateOne(
    { _id: CONFIG_ID },
    { $set: doc },
    { upsert: true }
  );
  return doc;
}
