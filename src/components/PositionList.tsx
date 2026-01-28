"use client";

import { Position } from "@/types/portfolio";

type PositionListProps = {
  positions: Position[];
  onEdit: (position: Position) => void;
  onDelete: (positionId: string) => void;
  onAddToWatchlist?: (position: Position) => void;
  accountId?: string;
};

export function PositionList({ positions, onEdit, onDelete, onAddToWatchlist, accountId }: PositionListProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);

  const formatNumber = (value: number, decimals: number = 2) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };

  // Calculate position values
  const calculatePositionValues = (position: Position) => {
    if (position.type === "cash") {
      const amount = position.amount || 0;
      return {
        type: "Cash",
        symbol: position.ticker || "CASH",
        shares: null,
        lastPrice: amount,
        costBasisPerShare: amount,
        totalCost: amount,
        marketValue: amount,
      };
    }

    if (position.type === "stock") {
      const shares = position.shares || 0;
      const purchasePrice = position.purchasePrice || 0;
      const currentPrice = position.currentPrice || purchasePrice;
      const totalCost = shares * purchasePrice;
      const marketValue = shares * currentPrice;

      return {
        type: "Stock",
        symbol: position.ticker || "",
        shares,
        lastPrice: currentPrice,
        costBasisPerShare: purchasePrice,
        totalCost,
        marketValue,
      };
    }

    // Option position
    const contracts = position.contracts || 0;
    const premium = position.premium || 0;
    const currentPremium = position.currentPrice || premium;
    // Options: 1 contract = 100 shares
    const shares = contracts * 100;
    const totalCost = contracts * premium * 100;
    const marketValue = contracts * currentPremium * 100;

    return {
      type: "Option",
      symbol: position.ticker || "",
      shares,
      lastPrice: currentPremium,
      costBasisPerShare: premium,
      totalCost,
      marketValue,
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

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Symbol
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Shares
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Last Price
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Total Cost
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Market Value
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {positions.map((position) => {
              const values = calculatePositionValues(position);
              const isStock = position.type === "stock";
              const isCash = position.type === "cash";
              const isOption = position.type === "option";

              return (
                <tr key={position._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        isStock
                          ? "bg-blue-100 text-blue-800"
                          : isOption
                          ? "bg-purple-100 text-purple-800"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {values.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-semibold text-gray-900">
                      {values.symbol}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {values.shares !== null ? (
                      <span className="text-gray-900">
                        {formatNumber(values.shares, 3)}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-gray-900">
                      {formatCurrency(values.lastPrice)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-gray-900">
                      {formatCurrency(values.totalCost)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(values.marketValue)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {onAddToWatchlist && accountId && position.type !== "cash" && (
                        <button
                          onClick={() => onAddToWatchlist(position)}
                          className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Add to Configure Automation / Alert"
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
                              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                            />
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
    </div>
  );
}
