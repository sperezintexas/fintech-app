"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type GoalConfig = {
  targetValue: number;
  targetYear: number;
  label: string;
  updatedAt?: string;
};

export default function GoalsPage() {
  const [config, setConfig] = useState<GoalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({ targetValue: 1_000_000, targetYear: 2030, label: "$1M by 2030" });

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/goals/config", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as GoalConfig;
        setConfig(data);
        setForm({
          targetValue: data.targetValue ?? 1_000_000,
          targetYear: data.targetYear ?? 2030,
          label: data.label ?? "$1M by 2030",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to load goal config" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/goals/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetValue: Number(form.targetValue),
          targetYear: Number(form.targetYear),
          label: form.label.trim(),
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to save");
      }
      const data = (await res.json()) as GoalConfig;
      setConfig(data);
      setForm({ targetValue: data.targetValue, targetYear: data.targetYear, label: data.label });
      setMessage({ type: "success", text: "Goals saved. The dashboard will use this for the goal probability." });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Goals</h2>
        <p className="text-gray-600 mt-1">
          Configure the primary goal used by the tracker on the dashboard: market snapshot, portfolio summary, and goal probability.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Primary goal</h3>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          <div>
            <label htmlFor="goal-label" className="block text-sm font-medium text-gray-700 mb-1">
              Label
            </label>
            <input
              id="goal-label"
              type="text"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g. $1M by 2030"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="goal-value" className="block text-sm font-medium text-gray-700 mb-1">
                Target value ($)
              </label>
              <input
                id="goal-value"
                type="number"
                min={1}
                step={1000}
                value={form.targetValue}
                onChange={(e) => setForm((f) => ({ ...f, targetValue: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="goal-year" className="block text-sm font-medium text-gray-700 mb-1">
                Target year
              </label>
              <input
                id="goal-year"
                type="number"
                min={new Date().getFullYear()}
                max={2100}
                value={form.targetYear}
                onChange={(e) => setForm((f) => ({ ...f, targetYear: Number(e.target.value) || new Date().getFullYear() }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          {message && (
            <p className={`text-sm ${message.type === "success" ? "text-green-700" : "text-red-700"}`}>
              {message.text}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
        {config?.updatedAt && (
          <p className="mt-3 text-xs text-gray-500">
            Last updated {new Date(config.updatedAt).toLocaleString()}
          </p>
        )}
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 text-sm text-gray-700">
        <h4 className="font-semibold text-gray-900 mb-2">Where the tracker uses this</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Dashboard</strong> — Market snapshot (with market open/closed status pill on the home page), portfolio summary, and the goal probability card (e.g. &quot;X% probability of reaching [your label]&quot;).
          </li>
          <li>
            Goal probability is recalculated when the risk scanner runs (e.g. daily-analysis cron). The target value and year you set here are used for the fallback calculation and for the label shown on the dashboard.
          </li>
        </ul>
        <p className="mt-3 text-gray-600">
          Market hours and holidays (used for the market status pill):{" "}
          <Link href="/docs" className="text-blue-600 hover:underline">
            docs
          </Link>
          {" "}
          — see <code className="bg-gray-200 px-1 rounded">market-calendar.md</code> and <code className="bg-gray-200 px-1 rounded">goal-progress.md</code>.
        </p>
      </div>
    </div>
  );
}
