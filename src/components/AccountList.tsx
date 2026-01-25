"use client";

import type { Account } from "@/types/portfolio";

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
  }).format(value);
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

export function AccountList({ accounts, onEdit, onDelete, isDeleting }: AccountListProps) {
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
    <div className="space-y-4">
      {accounts.map((account) => {
        const strategyStyle = getStrategyBadge(account.strategy);
        const accountValue = account.positions.reduce((total, pos) => {
          if (pos.type === "cash") return total + (pos.amount || 0);
          if (pos.type === "stock") return total + (pos.shares || 0) * (pos.currentPrice || 0);
          if (pos.type === "option") return total + (pos.contracts || 0) * (pos.currentPrice || 0) * 100;
          return total;
        }, 0);

        return (
          <div
            key={account._id}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-3 h-3 rounded-full ${getRiskColor(account.riskLevel)}`}
                    title={`${account.riskLevel} risk`}
                  />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{account.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${strategyStyle.bg} ${strategyStyle.text} capitalize`}
                      >
                        {account.strategy}
                      </span>
                      <span className="text-sm text-gray-500">
                        {account.riskLevel} risk
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(accountValue || account.balance)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {account.positions.length} position{account.positions.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-6 pt-4 border-t border-gray-100">
                <button
                  onClick={() => onEdit(account)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(account._id)}
                  disabled={isDeleting === account._id}
                  className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  {isDeleting === account._id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
