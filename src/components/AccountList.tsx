"use client";

import type { Account, BrokerType, Position } from "@/types/portfolio";
import { useRouter } from "next/navigation";

type AccountListProps = {
  accounts: Account[];
  onEdit: (account: Account) => void;
  onDelete: (id: string) => void;
  isDeleting?: string;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

type AccountMetrics = {
  costBasis: number;
  marketValue: number;
  dayChange: number;
  dayChangePercent: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
};

function getPositionCostBasis(pos: Position): number {
  if (pos.type === "cash") return pos.amount ?? 0;
  if (pos.type === "stock") return (pos.shares ?? 0) * (pos.purchasePrice ?? 0);
  if (pos.type === "option") return (pos.contracts ?? 0) * Math.abs(pos.premium ?? 0) * 100;
  return 0;
}

function getPositionMarketValue(pos: Position): number {
  if (pos.type === "cash") return pos.amount ?? 0;
  if (pos.type === "stock") return (pos.shares ?? 0) * (pos.currentPrice ?? pos.purchasePrice ?? 0);
  if (pos.type === "option") return (pos.contracts ?? 0) * (pos.currentPrice ?? 0) * 100;
  return 0;
}

function getPositionDayChange(pos: Position): number {
  if (pos.type === "cash") return 0;
  const mv = pos.marketValue ?? getPositionMarketValue(pos);
  if (pos.dailyChange != null) return pos.dailyChange;
  if (pos.dailyChangePercent != null && mv) return (mv * pos.dailyChangePercent) / 100;
  return 0;
}

function computeAccountMetrics(account: Account): AccountMetrics {
  const positions = account.positions ?? [];
  let costBasis = 0;
  let marketValue = 0;
  let dayChange = 0;

  for (const pos of positions) {
    costBasis += getPositionCostBasis(pos);
    marketValue += getPositionMarketValue(pos);
    dayChange += getPositionDayChange(pos);
  }

  if (marketValue === 0 && costBasis === 0) {
    marketValue = account.balance ?? 0;
    costBasis = account.balance ?? 0;
  }

  const unrealizedPL = marketValue - costBasis;
  const unrealizedPLPercent = costBasis > 0 ? (unrealizedPL / costBasis) * 100 : 0;
  const dayChangePercent = marketValue > 0 ? (dayChange / marketValue) * 100 : 0;

  return {
    costBasis,
    marketValue,
    dayChange,
    dayChangePercent,
    unrealizedPL,
    unrealizedPLPercent,
  };
}

function getRiskColor(risk: Account["riskLevel"]): string {
  switch (risk) {
    case "low":
      return "bg-emerald-500";
    case "medium":
      return "bg-yellow-500";
    case "high":
      return "bg-red-500";
    default:
      return "bg-gray-500";
  }
}

function getStrategyBadge(strategy: Account["strategy"]): { bg: string; text: string } {
  switch (strategy) {
    case "growth":
      return { bg: "bg-purple-100", text: "text-purple-700" };
    case "income":
      return { bg: "bg-green-100", text: "text-green-700" };
    case "balanced":
      return { bg: "bg-blue-100", text: "text-blue-700" };
    case "aggressive":
      return { bg: "bg-red-100", text: "text-red-700" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-700" };
  }
}

function getBrokerStyle(broker: BrokerType | undefined): { dot: string; label: string } | null {
  if (!broker) return null;
  switch (broker) {
    case "Merrill":
      return { dot: "bg-blue-600", label: "Merrill" };
    case "Fidelity":
      return { dot: "bg-emerald-600", label: "Fidelity" };
    default:
      return null;
  }
}

export function AccountList({ accounts, onEdit, onDelete, isDeleting }: AccountListProps) {
  const router = useRouter();

  if (accounts.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-2xl">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900">No accounts yet</h3>
        <p className="mt-2 text-gray-500">Get started by creating your first account.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm" aria-label="Accounts">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80">
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Account
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">
                Broker / Ref
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">
                Positions
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Cost basis
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Market value
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Day change
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                P&L
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {accounts.map((account) => {
              const strategyStyle = getStrategyBadge(account.strategy);
              const brokerStyle = getBrokerStyle(account.brokerType);
              const metrics = computeAccountMetrics(account);

              return (
                <tr
                  key={account._id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/holdings?accountId=${account._id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/holdings?accountId=${account._id}`);
                    }
                  }}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <div
                        className={`shrink-0 w-2.5 h-2.5 rounded-full ${getRiskColor(account.riskLevel)}`}
                        title={`${account.riskLevel} risk`}
                        aria-hidden
                      />
                      <span className="font-medium text-gray-900 truncate">{account.name}</span>
                      <span className="text-xs text-gray-500 capitalize">{account.riskLevel}</span>
                      <span
                        className={`text-xs font-medium px-1.5 py-0.5 rounded capitalize ${strategyStyle.bg} ${strategyStyle.text}`}
                      >
                        {account.strategy}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-left text-gray-600 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      {brokerStyle ? (
                        <span
                          className={`shrink-0 w-2.5 h-2.5 rounded-full ${brokerStyle.dot}`}
                          title={brokerStyle.label}
                          aria-label={brokerStyle.label}
                        />
                      ) : (
                        <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-gray-300" title="No broker" aria-hidden />
                      )}
                      {account.accountRef ? (
                        <span className="font-mono truncate" title={account.accountRef}>
                          {account.accountRef}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums">
                    {account.positions?.length ?? 0}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums whitespace-nowrap">
                    {formatCurrency(metrics.costBasis)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-gray-900 tabular-nums whitespace-nowrap">
                    {formatCurrency(metrics.marketValue)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                    <span
                      className={
                        metrics.dayChange >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"
                      }
                    >
                      {metrics.dayChange >= 0 ? "+" : ""}
                      {formatCurrency(metrics.dayChange)}
                      {metrics.dayChangePercent !== 0 && (
                        <span className="ml-0.5 text-xs">
                          ({formatPercent(metrics.dayChangePercent)})
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                    <span
                      className={
                        metrics.unrealizedPL >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"
                      }
                    >
                      {metrics.unrealizedPL >= 0 ? "+" : ""}
                      {formatCurrency(metrics.unrealizedPL)}
                      {metrics.costBasis > 0 && (
                        <span className="ml-0.5 text-xs">
                          ({formatPercent(metrics.unrealizedPLPercent)})
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(account)}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit"
                        aria-label="Edit account"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(account._id)}
                        disabled={isDeleting === account._id}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Delete"
                        aria-label="Delete account"
                      >
                        {isDeleting === account._id ? (
                          <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" aria-hidden />
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
