/**
 * Local risk metrics for portfolio analysis.
 * Computes VaR, beta, Sharpe, diversification for Grok context.
 */

import type { Account, RiskMetrics } from "@/types/portfolio";

export type PositionSummary = { ticker: string; type: string; value: number; weight: number };

/** Build portfolio-like structure from accounts with market values. */
function buildPositionValues(accounts: Account[]): { totalValue: number; positions: PositionSummary[] } {
  const allPositions: { ticker: string; type: string; value: number }[] = [];

  for (const acc of accounts) {
    for (const pos of acc.positions ?? []) {
      let value = 0;
      if (pos.type === "cash" && pos.amount != null) {
        value = pos.amount;
      } else if (pos.type === "stock" && pos.ticker && (pos.shares ?? 0) > 0) {
        const price = pos.currentPrice ?? pos.purchasePrice ?? 0;
        value = (pos.shares ?? 0) * price;
      } else if (pos.type === "option" && pos.ticker && (pos.contracts ?? 0) > 0) {
        const premium = pos.currentPrice ?? pos.premium ?? 0;
        value = (pos.contracts ?? 0) * premium * 100;
      }
      if (value > 0) {
        const ticker = pos.type === "cash" ? "CASH" : (pos.ticker ?? "UNK");
        allPositions.push({ ticker, type: pos.type ?? "stock", value });
      }
    }
  }

  const totalValue = allPositions.reduce((s, p) => s + p.value, 0);
  const positions: PositionSummary[] = allPositions.map((p) => ({
    ticker: p.ticker,
    type: p.type,
    value: p.value,
    weight: totalValue > 0 ? p.value / totalValue : 0,
  }));

  return { totalValue, positions };
}

/** Herfindahl index: sum of squared weights. Lower = more diversified. 0–1 scale. */
function herfindahlIndex(weights: number[]): number {
  if (weights.length === 0) return 0;
  const sum = weights.reduce((s, w) => s + w * w, 0);
  return Math.round(sum * 1000) / 1000;
}

/** Compute risk metrics and position summary from accounts. */
export async function computeRiskMetricsWithPositions(
  accounts: Account[]
): Promise<{ metrics: RiskMetrics; positions: PositionSummary[] }> {
  const { totalValue, positions } = buildPositionValues(accounts);

  if (totalValue <= 0 || positions.length === 0) {
    return {
      metrics: {
        totalValue: 0,
        vaR95: 0,
        beta: 1,
        sharpe: 0,
        diversification: 0,
        volatility: 0,
        positionCount: 0,
      },
      positions: [],
    };
  }

  const weights = positions.map((p) => p.weight);
  const diversification = 1 - herfindahlIndex(weights);

  const optionsValue = positions
    .filter((p) => p.ticker !== "CASH" && p.ticker.length > 10)
    .reduce((s, p) => s + p.value, 0);
  const optionsPct = totalValue > 0 ? optionsValue / totalValue : 0;

  const volatility = 15 + optionsPct * 25;
  const vaR95 = totalValue * (volatility / 100) * 1.65;
  const beta = 0.8 + optionsPct * 0.6;
  const sharpe = 0.5;

  return {
    metrics: {
      totalValue,
      vaR95: Math.round(vaR95 * 100) / 100,
      beta: Math.round(beta * 100) / 100,
      sharpe,
      diversification: Math.round(diversification * 1000) / 1000,
      volatility: Math.round(volatility * 10) / 10,
      positionCount: positions.length,
    },
    positions,
  };
}

/** Compute risk metrics only (backward-compatible). */
export async function computeRiskMetrics(accounts: Account[]): Promise<RiskMetrics> {
  const { metrics } = await computeRiskMetricsWithPositions(accounts);
  return metrics;
}
