"use client";

import { useState, useMemo } from "react";
import type { Account, Position } from "@/types/portfolio";
import { downloadCsv } from "@/lib/csv-export";

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

type SortKey =
  | "symbol"
  | "accountName"
  | "exposurePercent"
  | "costBasis"
  | "marketValue"
  | "dayChange"
  | "unrealizedPL";

function SortableTh({
  label,
  sortKey,
  currentSort,
  sortDir,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey | null;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = currentSort === sortKey;
  return (
    <th
      className={`px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 ${className}`}
      onClick={() => onSort(sortKey)}
      role="columnheader"
      aria-sort={isActive ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <span className="text-blue-600" aria-hidden>
            {sortDir === "asc" ? "↑" : "↓"}
          </span>
        )}
      </span>
    </th>
  );
}

type MyHoldingsTableProps = {
  accounts: Account[];
};

export function MyHoldingsTable({ accounts }: MyHoldingsTableProps) {
  const { rows, totalMarketValue } = buildHoldingsRows(accounts);
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortBy) return rows;
    return [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "symbol":
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case "accountName":
          cmp = a.accountName.localeCompare(b.accountName);
          break;
        case "exposurePercent":
          cmp = a.exposurePercent - b.exposurePercent;
          break;
        case "costBasis":
          cmp = a.costBasis - b.costBasis;
          break;
        case "marketValue":
          cmp = a.marketValue - b.marketValue;
          break;
        case "dayChange":
          cmp = a.dayChange - b.dayChange;
          break;
        case "unrealizedPL":
          cmp = a.unrealizedPL - b.unrealizedPL;
          break;
        default:
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortBy, sortDir]);

  const handleExportCsv = () => {
    const headers = [
      "Symbol",
      "Account",
      "Exposure %",
      "Cost basis",
      "Market value",
      "Day change",
      "Unrealized G/L",
    ];
    const rowsForCsv = sortedRows.map((row) => [
      row.symbol,
      row.accountName,
      totalMarketValue > 0 ? row.exposurePercent.toFixed(2) : "",
      row.costBasis.toFixed(2),
      row.marketValue.toFixed(2),
      row.dayChange.toFixed(2),
      row.unrealizedPL.toFixed(2),
    ]);
    downloadCsv(`my-holdings-${new Date().toISOString().slice(0, 10)}.csv`, headers, rowsForCsv);
  };

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
      <div className="flex justify-end px-3 py-2 border-b border-gray-100 bg-gray-50/50">
        <button
          type="button"
          onClick={handleExportCsv}
          className="text-sm font-medium text-gray-600 hover:text-gray-900 flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm" aria-label="My Holdings">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80">
              <SortableTh
                label="Symbol · Account"
                sortKey="symbol"
                currentSort={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortableTh
                label="Exposure"
                sortKey="exposurePercent"
                currentSort={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                className="text-right"
              />
              <SortableTh
                label="Cost basis"
                sortKey="costBasis"
                currentSort={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                className="text-right"
              />
              <SortableTh
                label="Market value"
                sortKey="marketValue"
                currentSort={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                className="text-right"
              />
              <SortableTh
                label="Day change"
                sortKey="dayChange"
                currentSort={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                className="text-right"
              />
              <SortableTh
                label="Unrealized G/L"
                sortKey="unrealizedPL"
                currentSort={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                className="text-right"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedRows.map((row) => (
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
