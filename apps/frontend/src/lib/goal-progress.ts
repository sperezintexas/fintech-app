/**
 * Goal progress: probability of reaching configured goal (e.g. $10M by 2030).
 * Computed when risk scanner runs; stored for dashboard display.
 * Target value/year come from Setup > Goals config (see getEffectiveGoalConfig).
 */

import type { Db } from "mongodb";
import { getEffectiveGoalConfig } from "./goals-config";

const GOAL_ID = "1M_by_2030";

export type GoalProgressDoc = {
  _id: string;
  probabilityPercent: number;
  totalValue: number;
  updatedAt: Date;
};

/**
 * Compute a fallback probability (0–100) of reaching target by targetYear
 * from current portfolio value. Simple heuristic: required annual return
 * vs assumed 8% expected with 20% band.
 */
export function computeGoalProbabilityFallback(
  totalValue: number,
  targetValue: number,
  targetYear: number
): number {
  if (totalValue <= 0) return 0;
  if (totalValue >= targetValue) return 100;
  const now = new Date();
  const yearsLeft = Math.max(0.25, targetYear - now.getFullYear() + (12 - now.getMonth()) / 12);
  const requiredReturn = Math.pow(targetValue / totalValue, 1 / yearsLeft) - 1;
  const expectedReturn = 0.08;
  const band = 0.2;
  const prob = 100 * Math.max(0, Math.min(1, 1 - (requiredReturn - expectedReturn) / band));
  return Math.round(prob);
}

/**
 * Compute and upsert goal progress. Call from risk scanner / daily-analysis
 * when portfolio risk is analyzed. Uses Grok's goalProbabilityPercent if
 * provided; otherwise fallback from totalValue using Setup > Goals config.
 */
export async function computeAndStoreGoalProgress(
  db: Db,
  totalValue: number,
  goalProbabilityPercentFromGrok?: number
): Promise<void> {
  const config = await getEffectiveGoalConfig(db);
  const probabilityPercent =
    typeof goalProbabilityPercentFromGrok === "number" &&
    goalProbabilityPercentFromGrok >= 0 &&
    goalProbabilityPercentFromGrok <= 100
      ? Math.round(goalProbabilityPercentFromGrok)
      : computeGoalProbabilityFallback(totalValue, config.targetValue, config.targetYear);

  await db.collection<GoalProgressDoc>("goalProgress").updateOne(
    { _id: GOAL_ID },
    {
      $set: {
        probabilityPercent,
        totalValue,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}
