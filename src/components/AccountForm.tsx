"use client";

import { useState } from "react";
import type { Account, RiskLevel, Strategy } from "@/types/portfolio";

type AccountFormData = {
  name: string;
  accountRef: string;
  balance: number;
  riskLevel: RiskLevel;
  strategy: Strategy;
};

type AccountFormProps = {
  account?: Account;
  onSubmit: (data: AccountFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
};

const RISK_LEVELS: { value: RiskLevel; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "bg-emerald-500" },
  { value: "medium", label: "Medium", color: "bg-yellow-500" },
  { value: "high", label: "High", color: "bg-red-500" },
];

const STRATEGIES: { value: Strategy; label: string; description: string }[] = [
  { value: "growth", label: "Growth", description: "Focus on capital appreciation" },
  { value: "income", label: "Income", description: "Focus on dividends and yield" },
  { value: "balanced", label: "Balanced", description: "Mix of growth and income" },
  { value: "aggressive", label: "Aggressive", description: "High risk, high reward" },
];

export function AccountForm({ account, onSubmit, onCancel, isLoading }: AccountFormProps) {
  const [formData, setFormData] = useState<AccountFormData>({
    name: account?.name || "",
    accountRef: account?.accountRef ?? "",
    balance: account?.balance || 0,
    riskLevel: account?.riskLevel || "medium",
    strategy: account?.strategy || "balanced",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Account Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
          Account Name
        </label>
        <input
          type="text"
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          placeholder="e.g., Growth Portfolio"
          required
        />
      </div>

      {/* Account ref (for import mapping) */}
      <div>
        <label htmlFor="accountRef" className="block text-sm font-medium text-gray-700 mb-2">
          Account ref
        </label>
        <input
          type="text"
          id="accountRef"
          value={formData.accountRef}
          onChange={(e) => setFormData({ ...formData, accountRef: e.target.value })}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          placeholder="e.g. 51X-98940 (for import mapping)"
        />
        <p className="mt-1 text-xs text-gray-500">Match broker account ID for CSV/API imports.</p>
      </div>

      {/* Initial Balance */}
      <div>
        <label htmlFor="balance" className="block text-sm font-medium text-gray-700 mb-2">
          Initial Balance
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
          <input
            type="number"
            id="balance"
            value={formData.balance}
            onChange={(e) => setFormData({ ...formData, balance: parseFloat(e.target.value) || 0 })}
            className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            placeholder="0.00"
            min="0"
            step="0.01"
          />
        </div>
      </div>

      {/* Risk Level */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Risk Level
        </label>
        <div className="grid grid-cols-3 gap-3">
          {RISK_LEVELS.map((risk) => (
            <button
              key={risk.value}
              type="button"
              onClick={() => setFormData({ ...formData, riskLevel: risk.value })}
              className={`p-4 rounded-xl border-2 transition-all ${
                formData.riskLevel === risk.value
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <span className={`w-3 h-3 rounded-full ${risk.color}`} />
                <span className="font-medium text-gray-800">{risk.label}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Strategy */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Investment Strategy
        </label>
        <div className="grid grid-cols-2 gap-3">
          {STRATEGIES.map((strat) => (
            <button
              key={strat.value}
              type="button"
              onClick={() => setFormData({ ...formData, strategy: strat.value })}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                formData.strategy === strat.value
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <p className="font-medium text-gray-800">{strat.label}</p>
              <p className="text-xs text-gray-500 mt-1">{strat.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading || !formData.name}
          className="flex-1 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? "Saving..." : account ? "Update Account" : "Create Account"}
        </button>
      </div>
    </form>
  );
}
