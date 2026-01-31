"use client";

import { useState } from "react";
import { REPORT_HANDLER_KEYS } from "@/lib/report-type-constants";
import type { AlertDeliveryChannel } from "@/types/portfolio";

export type JobTypeFormData = {
  id: string;
  handlerKey: string;
  name: string;
  description: string;
  supportsPortfolio: boolean;
  supportsAccount: boolean;
  order: number;
  enabled: boolean;
  defaultConfig?: Record<string, unknown>;
  defaultDeliveryChannels?: AlertDeliveryChannel[];
};

type JobType = {
  _id: string;
  id: string;
  handlerKey: string;
  name: string;
  description: string;
  supportsPortfolio: boolean;
  supportsAccount: boolean;
  order: number;
  enabled: boolean;
  defaultConfig?: Record<string, unknown>;
  defaultDeliveryChannels?: AlertDeliveryChannel[];
};

type JobTypeFormProps = {
  jobType?: JobType;
  onSubmit: (data: JobTypeFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
};

/** Default delivery channels: Slack or X only. */
const CHANNEL_OPTIONS: { value: AlertDeliveryChannel; label: string }[] = [
  { value: "slack", label: "Slack" },
  { value: "twitter", label: "X" },
];

export function JobTypeForm({ jobType, onSubmit, onCancel, isLoading }: JobTypeFormProps) {
  const [formData, setFormData] = useState<JobTypeFormData>({
    id: jobType?.id ?? "",
    handlerKey: jobType?.handlerKey ?? REPORT_HANDLER_KEYS[0],
    name: jobType?.name ?? "",
    description: jobType?.description ?? "",
    supportsPortfolio: jobType?.supportsPortfolio ?? false,
    supportsAccount: jobType?.supportsAccount ?? true,
    order: jobType?.order ?? 100,
    enabled: jobType?.enabled ?? true,
    defaultConfig: jobType?.defaultConfig ?? undefined,
    defaultDeliveryChannels: jobType?.defaultDeliveryChannels ?? ["slack"],
  });

  const setConfig = (updates: Record<string, unknown>) => {
    setFormData((prev) => ({
      ...prev,
      defaultConfig: { ...prev.defaultConfig, ...updates },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: JobTypeFormData = { ...formData };
    if (payload.defaultConfig && Object.keys(payload.defaultConfig).length === 0) {
      payload.defaultConfig = undefined;
    }
    if (!payload.defaultDeliveryChannels?.length) {
      payload.defaultDeliveryChannels = undefined;
    }
    await onSubmit(payload);
  };

  const idEditable = !jobType;
  const config = formData.defaultConfig ?? {};
  const channels = formData.defaultDeliveryChannels ?? [];

  const toggleChannel = (ch: AlertDeliveryChannel) => {
    const next = channels.includes(ch) ? channels.filter((c) => c !== ch) : [...channels, ch];
    setFormData((prev) => ({ ...prev, defaultDeliveryChannels: next.length ? next : undefined }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="id" className="block text-sm font-medium text-gray-700 mb-2">
          ID (unique, lowercase, used in job definitions)
        </label>
        <input
          type="text"
          id="id"
          value={formData.id}
          onChange={(e) =>
            setFormData({ ...formData, id: e.target.value.trim().toLowerCase().replace(/\s+/g, "-") })
          }
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono"
          placeholder="e.g. smartxai-weekly"
          required
          disabled={!idEditable}
          title={!idEditable ? "ID cannot be changed after creation" : undefined}
        />
      </div>

      <div>
        <label htmlFor="handlerKey" className="block text-sm font-medium text-gray-700 mb-2">
          Handler Key
        </label>
        <select
          id="handlerKey"
          value={formData.handlerKey}
          onChange={(e) => setFormData({ ...formData, handlerKey: e.target.value })}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
          required
        >
          {REPORT_HANDLER_KEYS.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
          Name
        </label>
        <input
          type="text"
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          placeholder="e.g. SmartXAI Report"
          required
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
          Description
        </label>
        <textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          placeholder="Brief description of this job type"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.supportsPortfolio}
            onChange={(e) => setFormData({ ...formData, supportsPortfolio: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Supports Portfolio</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.supportsAccount}
            onChange={(e) => setFormData({ ...formData, supportsAccount: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Supports Account</span>
        </label>
      </div>

      <div>
        <label htmlFor="order" className="block text-sm font-medium text-gray-700 mb-2">
          Order (display sort)
        </label>
        <input
          type="number"
          id="order"
          value={formData.order}
          onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value, 10) || 0 })}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          min={0}
        />
      </div>

      {/* Default delivery channels (Slack or X only) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Default delivery channel(s)
        </label>
        <p className="text-xs text-gray-500 mb-2">
          Used when creating new jobs and when running this type on demand (e.g. Option Scanner from xStrategyBuilder).
          Select one or both.
        </p>
        <div className="flex flex-wrap gap-2">
          {CHANNEL_OPTIONS.map(({ value, label }) => (
            <label
              key={value}
              className={`px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                channels.includes(value) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700"
              }`}
            >
              <input
                type="checkbox"
                className="mr-2"
                checked={channels.includes(value)}
                onChange={() => toggleChannel(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Type-specific default config */}
      {formData.handlerKey === "coveredCallScanner" && (
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <h5 className="text-sm font-medium text-gray-700 mb-3">Covered Call Scanner defaults</h5>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Min premium ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={(config.minPremium as number) ?? ""}
                onChange={(e) => setConfig({ minPremium: parseFloat(e.target.value) || undefined })}
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                placeholder="0.50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Max delta (0–1)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={(config.maxDelta as number) ?? ""}
                onChange={(e) => setConfig({ maxDelta: parseFloat(e.target.value) || undefined })}
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                placeholder="0.35"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Min stock shares</label>
              <input
                type="number"
                min="1"
                value={(config.minStockShares as number) ?? ""}
                onChange={(e) => setConfig({ minStockShares: parseInt(e.target.value, 10) || undefined })}
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                placeholder="100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Symbols (comma-separated)</label>
              <input
                type="text"
                value={Array.isArray(config.symbols) ? (config.symbols as string[]).join(", ") : (config.symbols as string) ?? ""}
                onChange={(e) =>
                  setConfig({
                    symbols: e.target.value ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
                  })
                }
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                placeholder="TSLA, AAPL"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Expiration min days</label>
              <input
                type="number"
                min="0"
                value={(config.expirationRange as { minDays?: number })?.minDays ?? ""}
                onChange={(e) =>
                  setConfig({
                    expirationRange: {
                      ...((config.expirationRange as object) ?? {}),
                      minDays: parseInt(e.target.value, 10) || undefined,
                    },
                  })
                }
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                placeholder="7"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Expiration max days</label>
              <input
                type="number"
                min="0"
                value={(config.expirationRange as { maxDays?: number })?.maxDays ?? ""}
                onChange={(e) =>
                  setConfig({
                    expirationRange: {
                      ...((config.expirationRange as object) ?? {}),
                      maxDays: parseInt(e.target.value, 10) || undefined,
                    },
                  })
                }
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                placeholder="45"
              />
            </div>
          </div>
        </div>
      )}

      {formData.handlerKey === "protectivePutScanner" && (
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <h5 className="text-sm font-medium text-gray-700 mb-3">Protective Put / CSP defaults</h5>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Min yield (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={(config.minYield as number) ?? ""}
                onChange={(e) => setConfig({ minYield: parseFloat(e.target.value) || undefined })}
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                placeholder="20"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Risk tolerance</label>
              <select
                value={(config.riskTolerance as string) ?? ""}
                onChange={(e) =>
                  setConfig({ riskTolerance: (e.target.value as "low" | "medium" | "high") || undefined })
                }
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white"
              >
                <option value="">Default</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Watchlist ID</label>
              <input
                type="text"
                value={(config.watchlistId as string) ?? ""}
                onChange={(e) => setConfig({ watchlistId: e.target.value.trim() || undefined })}
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Min stock shares</label>
              <input
                type="number"
                min="1"
                value={(config.minStockShares as number) ?? ""}
                onChange={(e) => setConfig({ minStockShares: parseInt(e.target.value, 10) || undefined })}
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                placeholder="100"
              />
            </div>
          </div>
        </div>
      )}

      {formData.handlerKey === "OptionScanner" && (
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <h5 className="text-sm font-medium text-gray-700 mb-3">Option Scanner defaults</h5>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">HOLD DTE min</label>
              <input
                type="number"
                value={(config.holdDteMin as number) ?? 14}
                onChange={(e) => setConfig({ holdDteMin: parseInt(e.target.value, 10) || undefined })}
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">BTC DTE max</label>
              <input
                type="number"
                value={(config.btcDteMax as number) ?? 7}
                onChange={(e) => setConfig({ btcDteMax: parseInt(e.target.value, 10) || undefined })}
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">BTC stop loss %</label>
              <input
                type="number"
                value={(config.btcStopLossPercent as number) ?? -50}
                onChange={(e) => setConfig({ btcStopLossPercent: parseInt(e.target.value, 10) || undefined })}
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">HOLD time value % min</label>
              <input
                type="number"
                value={(config.holdTimeValuePercentMin as number) ?? 20}
                onChange={(e) =>
                  setConfig({ holdTimeValuePercentMin: parseInt(e.target.value, 10) || undefined })
                }
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">High IV % (puts)</label>
              <input
                type="number"
                value={(config.highVolatilityPercent as number) ?? 30}
                onChange={(e) =>
                  setConfig({ highVolatilityPercent: parseInt(e.target.value, 10) || undefined })
                }
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {jobType && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.enabled}
            onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Enabled</span>
        </label>
      )}

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
          disabled={isLoading || !formData.id || !formData.name}
          className="flex-1 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? "Saving..." : jobType ? "Update Job Type" : "Create Job Type"}
        </button>
      </div>
    </form>
  );
}
