"use client";

import type { Account, Position } from "@/types/portfolio";

type HoldingRow = {
  position: Position;
  accountId: string;
  accountName: string;
  symbol: string;
  exposurePercent: number;
  costBasis: number;
  marketValue: number;
  dayChange: number;
  dayChangePercent: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
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

function getPositionSymbol(pos: Position): string {
  if (pos.ticker) return pos.ticker;
  if (pos.type === "cash") return "Cash";
  return "—";
}

function buildHoldingsRows(accounts: Account[]): { rows: HoldingRow[]; totalMarketValue: number } {
  const rows: HoldingRow[] = [];
  let totalMarketValue = 0;

  for (const account of accounts) {
    const positions = account.positions ?? [];
    for (const position of positions) {
      const costBasis = getPositionCostBasis(position);
      const marketValue = getPositionMarketValue(position);
      const dayChange = getPositionDayChange(position);
      const dayChangePercent = marketValue > 0 ? (dayChange / marketValue) * 100 : 0;
      const unrealizedPL = marketValue - costBasis;
      const unrealizedPLPercent = costBasis > 0 ? (unrealizedPL / costBasis) * 100 : 0;

      rows.push({
        position,
        accountId: account._id,
        accountName: account.name,
        symbol: getPositionSymbol(position),
        exposurePercent: 0,
        costBasis,
        marketValue,
        dayChange,
        dayChangePercent,
        unrealizedPL,
        unrealizedPLPercent,
      });
      totalMarketValue += marketValue;
    }
  }

  if (totalMarketValue > 0) {
    for (const row of rows) {
      row.exposurePercent = (row.marketValue / totalMarketValue) * 100;
    }
  }

  return { rows, totalMarketValue };
}

type MyHoldingsTableProps = {
  accounts: Account[];
};

export function MyHoldingsTable({ accounts }: MyHoldingsTableProps) {
  const { rows, totalMarketValue } = buildHoldingsRows(accounts);

  if (rows.length === 0) {
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
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900">No holdings</h3>
        <p className="mt-2 text-gray-500">Add positions in Holdings to see them here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm" aria-label="My Holdings">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80">
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Symbol · Account
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Exposure
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
                Unrealized G/L
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={`${row.accountId}-${row.position._id}`} className="hover:bg-gray-50">
                <td className="px-3 py-2.5 min-w-0">
                  <div>
                    <span className="font-medium text-gray-900">{row.symbol}</span>
                    <span className="text-gray-500 text-xs ml-1">· {row.accountName}</span>
                  </div>
                  {row.position.type === "option" && row.position.strike != null && (
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {row.position.optionType === "call" ? "Call" : "Put"} {row.position.strike}
                      {row.position.expiration ? ` · ${row.position.expiration}` : ""}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums">
                  {totalMarketValue > 0 ? `${row.exposurePercent.toFixed(2)}%` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums whitespace-nowrap">
                  {formatCurrency(row.costBasis)}
                </td>
                <td className="px-3 py-2.5 text-right font-medium text-gray-900 tabular-nums whitespace-nowrap">
                  {formatCurrency(row.marketValue)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                  {row.dayChange !== 0 ? (
                    <span
                      className={
                        row.dayChange >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"
                      }
                    >
                      {row.dayChange >= 0 ? "+" : ""}
                      {formatCurrency(row.dayChange)}
                      {row.dayChangePercent !== 0 && (
                        <span className="ml-0.5 text-xs">({formatPercent(row.dayChangePercent)})</span>
                      )}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                  <span
                    className={
                      row.unrealizedPL >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"
                    }
                  >
                    {row.unrealizedPL >= 0 ? "+" : ""}
                    {formatCurrency(row.unrealizedPL)}
                    {row.costBasis > 0 && (
                      <span className="ml-0.5 text-xs">({formatPercent(row.unrealizedPLPercent)})</span>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
