"use client";

import { useState, useMemo } from "react";
import { Position } from "@/types/portfolio";
import { formatOptionPremium } from "@/lib/format-currency";

type PositionSortKey =
  | "symbol"
  | "qty"
  | "last"
  | "unitCost"
  | "costBasis"
  | "marketValue"
  | "dayChange"
  | "unrealizedPL";

type PositionListProps = {
  positions: Position[];
  onEdit: (position: Position) => void;
  onDelete: (positionId: string) => void;
  onAddToWatchlist?: (position: Position) => void;
  onBuyToClose?: (position: Position) => void;
  addToWatchlistLoadingId?: string | null;
  accountId?: string;
};

export function PositionList({ positions, onEdit, onDelete, onAddToWatchlist, onBuyToClose, addToWatchlistLoadingId, accountId }: PositionListProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);

  /** Format cost basis without rounding up: truncate to 2 decimals then display. */
  const formatCostBasis = (value: number) => {
    const truncated =
      value >= 0 ? Math.floor(value * 100) / 100 : Math.ceil(value * 100) / 100;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(truncated);
  };

  const formatNumber = (value: number, decimals: number = 2) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };

  /** Format share/contract quantity: no decimals for whole numbers (500 not 500.000). */
  const formatQuantity = (value: number) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    }).format(value);

  // Parse YYYY-MM-DD as local calendar date (avoids UTC midnight showing as previous day)
  const parseLocalDate = (isoDate: string): Date => {
    const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
    return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
  };

  // Format option name: TSLA260130C00475000
  // Format: SYMBOL + YYMMDD + C/P + STRIKE*1000 (8 digits)
  const formatOptionName = (position: Position): string => {
    if (position.type !== "option" || !position.ticker || !position.expiration || position.strike == null) {
      return position.ticker || "";
    }

    const underlying = position.ticker.toUpperCase();

    // Parse expiration date (YYYY-MM-DD) to YYMMDD (local calendar date)
    const expDate = parseLocalDate(position.expiration);
    const year = expDate.getFullYear().toString().slice(-2); // Last 2 digits
    const month = String(expDate.getMonth() + 1).padStart(2, "0");
    const day = String(expDate.getDate()).padStart(2, "0");
    const dateStr = `${year}${month}${day}`;

    // Option type: C for call, P for put
    const optionType = position.optionType === "put" ? "P" : "C";

    // Strike price * 1000, padded to 8 digits
    const strikeStr = String(Math.round((position.strike || 0) * 1000)).padStart(8, "0");

    return `${underlying}${dateStr}${optionType}${strikeStr}`;
  };

  // Calculate Days To Expiration for options (calendar-day based)
  const calculateDTE = (expiration: string | undefined): number | null => {
    if (!expiration) return null;
    const expDate = parseLocalDate(expiration);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffMs = expDate.getTime() - todayStart.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return diffDays >= 0 ? diffDays : null;
  };

  // Format expiration date for display (compact: omit year when current year)
  const formatExpiration = (expiration: string | undefined): string => {
    if (!expiration) return "";
    const date = parseLocalDate(expiration);
    const now = new Date();
    const omitYear = date.getFullYear() === now.getFullYear();
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(omitYear ? {} : { year: "2-digit" }),
    });
  };

  // Description column: stock = ticker; option = "CALL/PUT SYMBOL strike EXP MM-DD-YY"; cash = "Cash"
  const getDescription = (position: Position): string => {
    if (position.type === "cash") return "Cash";
    if (position.type === "stock") return position.ticker ?? "—";
    if (position.type === "option") {
      const underlying = (position.ticker ?? "").toUpperCase();
      const type = position.optionType === "put" ? "PUT" : "CALL";
      const strike = position.strike != null ? position.strike.toFixed(2) : "—";
      let exp = "—";
      if (position.expiration) {
        const d = parseLocalDate(position.expiration);
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const yy = String(d.getFullYear()).slice(-2);
        exp = `${mm}-${dd}-${yy}`;
      }
      return `${type} ${underlying} ${strike} EXP ${exp}`;
    }
    return "—";
  };

  // Calculate position values (use API-enriched values when available)
  const calculatePositionValues = (position: Position) => {
    if (position.type === "cash") {
      const amount = position.amount || 0;
      return {
        type: "Cash" as const,
        symbol: position.ticker || "CASH",
        quantity: null as number | null,
        quantityLabel: "—",
        lastPrice: amount,
        avgCost: amount,
        totalCost: amount,
        marketValue: position.marketValue ?? amount,
        unrealizedPL: 0,
        unrealizedPLPercent: 0,
      };
    }

    if (position.type === "stock") {
      const shares = position.shares || 0;
      const purchasePrice = position.purchasePrice || 0;
      const currentPrice = position.currentPrice || purchasePrice;
      const totalCost = shares * purchasePrice;
      const marketValue = position.marketValue ?? shares * currentPrice;
      const unrealizedPL = position.unrealizedPL ?? marketValue - totalCost;
      const unrealizedPLPercent =
        position.unrealizedPLPercent ?? (totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0);

      return {
        type: "Stock" as const,
        symbol: position.ticker || "",
        quantity: shares,
        quantityLabel: formatQuantity(shares),
        lastPrice: currentPrice,
        avgCost: purchasePrice,
        totalCost,
        marketValue,
        unrealizedPL,
        unrealizedPLPercent,
      };
    }

    // Option position (short: display negative qty e.g. -1; closed: 0)
    const contracts = position.contracts || 0;
    const premium = position.premium || 0;
    const currentPremium = position.currentPrice || premium;
    const totalCost = contracts * premium * 100;
    const marketValue = position.marketValue ?? contracts * currentPremium * 100;
    const unrealizedPL = position.unrealizedPL ?? marketValue - totalCost;
    const unrealizedPLPercent =
      position.unrealizedPLPercent ?? (totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0);
    const typeLabel = position.optionType === "put" ? "Put" : "Call";
    const displayQty = contracts === 0 ? 0 : -contracts;

    return {
      type: typeLabel as "Call" | "Put",
      symbol: formatOptionName(position),
      quantity: displayQty,
      quantityLabel: String(displayQty),
      lastPrice: currentPremium,
      avgCost: premium,
      totalCost,
      marketValue,
      unrealizedPL,
      unrealizedPLPercent,
      isExpired: position.isExpired,
    };
  };

  if (positions.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <p className="text-gray-500">No holdings yet</p>
        <p className="text-gray-400 text-sm mt-1">
          Add a stock, option, or cash holding to get started
        </p>
      </div>
    );
  }

  // Qty display: shares or contracts; options show negative when open (-1), 0 when closed
  const formatQty = (position: Position, values: ReturnType<typeof calculatePositionValues>): string => {
    if (position.type === "cash") return values.quantityLabel;
    if (position.type === "stock") return values.quantityLabel;
    return values.quantityLabel;
  };

  const [sortBy, setSortBy] = useState<PositionSortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: PositionSortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  const sortedPositions = useMemo(() => {
    if (!sortBy) return positions;
    const valueMap = new Map(positions.map((p) => [p._id, calculatePositionValues(p)]));
    return [...positions].sort((a, b) => {
      const va = valueMap.get(a._id)!;
      const vb = valueMap.get(b._id)!;
      const dayChangeA =
        a.dailyChange != null
          ? a.dailyChange
          : a.dailyChangePercent != null && va.marketValue
            ? (va.marketValue * a.dailyChangePercent) / 100
            : 0;
      const dayChangeB =
        b.dailyChange != null
          ? b.dailyChange
          : b.dailyChangePercent != null && vb.marketValue
            ? (vb.marketValue * b.dailyChangePercent) / 100
            : 0;
      let cmp = 0;
      switch (sortBy) {
        case "symbol":
          cmp = (va.symbol ?? "").localeCompare(vb.symbol ?? "");
          break;
        case "qty":
          cmp = (va.quantity ?? 0) - (vb.quantity ?? 0);
          break;
        case "last":
          cmp = va.lastPrice - vb.lastPrice;
          break;
        case "unitCost":
          cmp = va.avgCost - vb.avgCost;
          break;
        case "costBasis":
          cmp = va.totalCost - vb.totalCost;
          break;
        case "marketValue":
          cmp = va.marketValue - vb.marketValue;
          break;
        case "dayChange":
          cmp = dayChangeA - dayChangeB;
          break;
        case "unrealizedPL":
          cmp = va.unrealizedPL - vb.unrealizedPL;
          break;
        default:
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [positions, sortBy, sortDir]);

  const sortableTh = (
    label: string,
    key: PositionSortKey,
    className = "text-left"
  ) => (
    <th
      className={`px-3 py-2 text-xs font-semibold text-gray-500 uppercase cursor-pointer select-none hover:bg-gray-100 ${className}`}
      onClick={() => handleSort(key)}
      role="columnheader"
      aria-sort={sortBy === key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortBy === key && (
          <span className="text-blue-600" aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
        )}
      </span>
    </th>
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Desktop Table View - Symbol · Desc, Symbols (qty), Cost basis, Market value, Day change, Unrealized P/L */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {sortableTh("Symbol", "symbol")}
              {sortableTh("Qty", "qty", "text-right")}
              {sortableTh("Last", "last", "text-right")}
              {sortableTh("Unit cost", "unitCost", "text-right")}
              {sortableTh("Cost basis", "costBasis", "text-right")}
              {sortableTh("Market value", "marketValue", "text-right")}
              {sortableTh("Day change", "dayChange", "text-right")}
              {sortableTh("Unrealized P/L", "unrealizedPL", "text-right")}
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase w-24">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedPositions.map((position) => {
              const values = calculatePositionValues(position);
              const isStock = position.type === "stock";
              const isOption = position.type === "option";
              const isCall = isOption && position.optionType === "call";
              const isPut = isOption && position.optionType === "put";
              const dte = isOption ? calculateDTE(position.expiration) : null;
              const isPositive = (position.dailyChangePercent ?? 0) >= 0;
              const plPositive = (values.unrealizedPL ?? 0) >= 0;
              const typeBadgeClass = isStock
                ? "bg-blue-100 text-blue-800"
                : isCall
                ? "bg-purple-100 text-purple-800"
                : isPut
                ? "bg-amber-100 text-amber-800"
                : "bg-green-100 text-green-800";

              const dayChangeDollar =
                position.dailyChange != null
                  ? position.dailyChange
                  : position.dailyChangePercent != null && values.marketValue
                    ? (values.marketValue * position.dailyChangePercent) / 100
                    : 0;
              const hasDayChange = dayChangeDollar !== 0 || (position.dailyChangePercent != null && position.dailyChangePercent !== 0);

              return (
                <tr key={position._id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 min-w-0">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${typeBadgeClass}`}
                        >
                          {values.type}
                        </span>
                        {"isExpired" in values && values.isExpired && (
                          <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700 shrink-0">
                            Exp
                          </span>
                        )}
                        <span className="font-semibold text-gray-900 truncate">
                          {values.symbol}
                        </span>
                      </div>
                      <span className="text-gray-600 text-xs truncate max-w-[14rem]" title={getDescription(position)}>
                        {getDescription(position)}
                      </span>
                      {isOption && position.expiration && (
                        <span className="text-gray-500 text-xs">
                          {formatExpiration(position.expiration)}
                          {dte !== null && (
                            <span
                              className={`ml-1 ${
                                dte <= 7 ? "text-red-600 font-medium" : dte <= 30 ? "text-orange-600" : ""
                              }`}
                            >
                              ({dte}d)
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums">
                    {formatQty(position, values)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums">
                    {isOption ? (
                      <div className="flex flex-col items-end gap-0.5">
                        {position.underlyingPrice != null && (
                          <span className="text-xs text-gray-600" title="Underlying stock">
                            {formatCurrency(position.underlyingPrice)}
                          </span>
                        )}
                        <span className="font-medium text-gray-900" title="Option last">
                          {formatOptionPremium(values.lastPrice)}
                        </span>
                      </div>
                    ) : (
                      formatCurrency(values.lastPrice)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums">
                    {position.type === "cash" ? (
                      "—"
                    ) : position.type === "option" ? (
                      formatOptionPremium(values.avgCost)
                    ) : (
                      formatCurrency(values.avgCost)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums">
                    {formatCostBasis(values.totalCost)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900 whitespace-nowrap tabular-nums">
                    {formatCurrency(values.marketValue)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {hasDayChange ? (
                      <span className={isPositive ? "text-green-600" : "text-red-600"}>
                        {dayChangeDollar >= 0 ? "+" : ""}{formatCurrency(dayChangeDollar)}
                        {position.dailyChangePercent != null && (
                          <span className="ml-0.5 text-xs">
                            ({isPositive ? "+" : ""}{formatNumber(position.dailyChangePercent, 2)}%)
                          </span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span
                        className={`text-xs font-medium tabular-nums ${
                          plPositive ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {plPositive ? "+" : ""}{formatCurrency(values.unrealizedPL)}
                      </span>
                      <span
                        className={`text-xs tabular-nums ${
                          plPositive ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        ({plPositive ? "+" : ""}{formatNumber(values.unrealizedPLPercent, 2)}%)
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      {onAddToWatchlist && accountId && position.type !== "cash" && (
                        <button
                          onClick={() => onAddToWatchlist(position)}
                          disabled={addToWatchlistLoadingId === position._id}
                          className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Add to Watchlist"
                        >
                          {addToWatchlistLoadingId === position._id ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                            </svg>
                          )}
                        </button>
                      )}
                      {onBuyToClose && isOption && (
                        <button
                          onClick={() => onBuyToClose(position)}
                          className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Buy to Close"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => onEdit(position)}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => onDelete(position._id)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View - Symbol, Description, Qty, Price, Exp, Value, Unit Cost, Cost Basis, Unrealized P/L */}
      <div className="md:hidden divide-y divide-gray-100">
        {sortedPositions.map((position) => {
          const values = calculatePositionValues(position);
          const isStock = position.type === "stock";
          const isOption = position.type === "option";
          const isCall = isOption && position.optionType === "call";
          const isPut = isOption && position.optionType === "put";
          const dte = isOption ? calculateDTE(position.expiration) : null;
          const hasChange = position.dailyChangePercent != null;
          const isPositive = (position.dailyChangePercent ?? 0) >= 0;
          const plPositive = (values.unrealizedPL ?? 0) >= 0;
          const typeBadgeClass = isStock
            ? "bg-blue-100 text-blue-800"
            : isCall
            ? "bg-purple-100 text-purple-800"
            : isPut
            ? "bg-amber-100 text-amber-800"
            : "bg-green-100 text-green-800";

          return (
            <div key={position._id} className="p-3">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeBadgeClass}`}
                    >
                      {values.type}
                    </span>
                    {"isExpired" in values && values.isExpired && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700">
                        Expired
                      </span>
                    )}
                    <span className="font-semibold text-gray-900 truncate">
                      {values.symbol}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 truncate">{getDescription(position)}</p>
                  {hasChange && (
                    <span
                      className={`text-xs font-medium ${isPositive ? "text-green-600" : "text-red-600"}`}
                    >
                      {isPositive ? "+" : ""}{formatNumber(position.dailyChangePercent ?? 0, 2)}% today
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {onAddToWatchlist && accountId && position.type !== "cash" && (
                    <button
                      onClick={() => onAddToWatchlist(position)}
                      disabled={addToWatchlistLoadingId === position._id}
                      className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Add to Watchlist"
                    >
                      {addToWatchlistLoadingId === position._id ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                      )}
                    </button>
                  )}
                  {onBuyToClose && isOption && (
                    <button
                      onClick={() => onBuyToClose(position)}
                      className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                      title="Buy to Close"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => onEdit(position)}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDelete(position._id)}
                    className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">Qty</div>
                  <div className="text-gray-900 font-medium tabular-nums">{formatQty(position, values)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">{isOption ? "Last" : "Price"}</div>
                  <div className="text-gray-900 font-medium tabular-nums">
                    {isOption && position.underlyingPrice != null && (
                      <span className="text-gray-600 text-xs block">Stock {formatCurrency(position.underlyingPrice)}</span>
                    )}
                    <span>
                      {isOption && position.underlyingPrice != null ? "Option " : ""}
                      {isOption ? formatOptionPremium(values.lastPrice) : formatCurrency(values.lastPrice)}
                    </span>
                    {hasChange && (
                      <span className={isPositive ? "text-green-600 ml-1" : "text-red-600 ml-1"}>
                        ({isPositive ? "+" : ""}{formatNumber(position.dailyChangePercent ?? 0, 2)}%)
                      </span>
                    )}
                  </div>
                </div>
                {isOption && position.expiration && (
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Exp</div>
                    <div className="text-gray-900 font-medium">
                      {formatExpiration(position.expiration)}
                      {dte !== null && (
                        <span
                          className={`ml-1 ${
                            dte <= 7 ? "text-red-600 font-semibold" : dte <= 30 ? "text-orange-600" : "text-gray-500"
                          }`}
                        >
                          ({dte}d)
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">Value</div>
                  <div className="text-gray-900 font-semibold tabular-nums">{formatCurrency(values.marketValue)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">Unit Cost</div>
                  <div className="text-gray-900 font-medium tabular-nums">
                    {isOption ? formatOptionPremium(values.avgCost) : formatCurrency(values.avgCost)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">Cost Basis</div>
                  <div className="text-gray-900 font-medium tabular-nums">{formatCostBasis(values.totalCost)}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-gray-500 mb-0.5">Unrealized P/L</div>
                  <div
                    className={`font-medium tabular-nums ${plPositive ? "text-green-600" : "text-red-600"}`}
                  >
                    {plPositive ? "+" : ""}{formatCurrency(values.unrealizedPL)} ({plPositive ? "+" : ""}
                    {formatNumber(values.unrealizedPLPercent, 2)}%)
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
