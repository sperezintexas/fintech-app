/**
 * Risk Scanner: computes portfolio risk metrics, calls Grok for analysis,
 * creates alerts when risk is high.
 *
 * Scope: holdings only (account positions). Watchlist items are not included.
 */

import { ObjectId } from "mongodb";
import { getDb } from "./mongodb";
import { getMultipleTickerPrices } from "./yahoo";
import { computeRiskMetricsWithPositions } from "./risk-management";
import { analyzeRiskWithGrok } from "./xai-grok";
import type { Account } from "@/types/portfolio";

export type RiskScannerResult = {
  riskLevel: "low" | "medium" | "high";
  alertsCreated: number;
  explanation: string;
};

/** Run risk scanner for account(s). */
export async function runRiskScanner(accountId?: string): Promise<RiskScannerResult> {
  const db = await getDb();
  const query: Record<string, unknown> = accountId ? { _id: new ObjectId(accountId) } : {};
  const accountDocs = await db
    .collection("accounts")
    .find(query)
    .toArray() as (Account & { _id: ObjectId })[];

  const accounts = accountDocs.map((a) => ({
    ...a,
    _id: a._id.toString(),
    positions: a.positions ?? [],
  }));

  if (accounts.length === 0) {
    return {
      riskLevel: "medium",
      alertsCreated: 0,
      explanation: "No accounts to analyze.",
    };
  }

  const tickers = new Set<string>();
  for (const acc of accounts) {
    for (const pos of acc.positions ?? []) {
      if (pos.ticker) tickers.add(pos.ticker);
    }
  }
  const prices = await getMultipleTickerPrices(Array.from(tickers));
  const accountsWithPrices = accounts.map((acc) => ({
    ...acc,
    positions: (acc.positions ?? []).map((pos) => {
      if (pos.type === "stock" && pos.ticker) {
        const p = prices.get(pos.ticker);
        return { ...pos, currentPrice: p?.price ?? pos.currentPrice ?? pos.purchasePrice };
      }
      return pos;
    }),
  }));

  const { metrics, positions: posSummary } = await computeRiskMetricsWithPositions(accountsWithPrices);
  const profile = accounts[0]?.riskLevel ?? "medium";
  const analysis = await analyzeRiskWithGrok({
    profile,
    metrics,
    positions: posSummary,
  });

  let alertsCreated = 0;
  const explanation = analysis?.explanation ?? "";
  const riskLevel = analysis?.riskLevel ?? "medium";

  if (analysis && (analysis.riskLevel === "high" || analysis.recommendations.length > 0)) {
    const existingRisk = await db.collection("alerts").findOne({
      type: "risk-scanner",
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
    });
    if (!existingRisk) {
      const riskAlert = {
        type: "risk-scanner",
        symbol: "PORTFOLIO",
        recommendation: analysis.riskLevel === "high" ? "WATCH" : "HOLD",
        reason: analysis.explanation || `Risk level: ${analysis.riskLevel}. ${analysis.recommendations.join(" ")}`,
        severity: analysis.riskLevel === "high" ? "warning" : "info",
        metrics: { vaR95: metrics.vaR95, beta: metrics.beta, volatility: metrics.volatility },
        details: {
          currentPrice: metrics.totalValue,
          entryPrice: metrics.totalValue,
          priceChange: 0,
          priceChangePercent: 0,
        },
        createdAt: new Date().toISOString(),
        acknowledged: false,
      };
      await db.collection("alerts").insertOne(riskAlert);
      alertsCreated = 1;
    }
  }

  return {
    riskLevel,
    alertsCreated,
    explanation,
  };
}
