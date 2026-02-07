"use client";

import { useState, useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";

type CheckStatus = "ok" | "degraded" | "error";

type HealthCheck = {
  status: CheckStatus;
  message?: string;
  latencyMs?: number;
  jobsCount?: number;
  nextRunAt?: string;
  dataSizeMB?: number;
  percentOfLimit?: number;
  connectionDisplay?: string;
  database?: string;
};

type HealthResponse = {
  status: CheckStatus;
  version?: string;
  timestamp: string;
  checks: Record<string, HealthCheck>;
};

function StatusBadge({ status }: { status: CheckStatus }) {
  const styles = {
    ok: "bg-green-100 text-green-800",
    degraded: "bg-amber-100 text-amber-800",
    error: "bg-red-100 text-red-800",
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {status.toUpperCase()}
    </span>
  );
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    try {
      setError(null);
      const res = await fetch("/api/health", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Health check failed");
      setHealth(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch health");
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Health Status</h1>

        {loading && !health ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
            <div className="space-y-3">
              <div className="h-4 bg-gray-100 rounded" />
              <div className="h-4 bg-gray-100 rounded" />
              <div className="h-4 bg-gray-100 rounded" />
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-800">
            <p className="font-medium">Unable to reach health endpoint</p>
            <p className="text-sm mt-1">{error}</p>
            <button
              onClick={fetchHealth}
              className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 rounded-lg text-sm font-medium"
            >
              Retry
            </button>
          </div>
        ) : health ? (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Overall</h2>
                <StatusBadge status={health.status} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                {health.version && (
                  <span>Version: {health.version}</span>
                )}
                <span>Last checked: {new Date(health.timestamp).toLocaleString()}</span>
              </div>
            </div>

            {Object.entries(health.checks).map(([name, check]) => (
              <div
                key={name}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-900 capitalize">{name}</h3>
                  <StatusBadge status={check.status} />
                </div>
                {check.message && (
                  <p className="text-sm text-gray-600 mb-2">{check.message}</p>
                )}
                <div className="text-sm text-gray-500 space-y-1">
                  {check.connectionDisplay != null && (
                    <p className="font-mono text-xs break-all" title="Connection string (password masked)">
                      {check.connectionDisplay}
                    </p>
                  )}
                  {check.database != null && (
                    <p>Database: {check.database}</p>
                  )}
                  {check.latencyMs != null && (
                    <p>Latency: {check.latencyMs}ms</p>
                  )}
                  {check.dataSizeMB != null && (
                    <p>Data size: {check.dataSizeMB} MB{check.percentOfLimit != null ? ` (${check.percentOfLimit}% of limit)` : ""}</p>
                  )}
                  {check.jobsCount != null && (
                    <p>Scheduled jobs: {check.jobsCount}</p>
                  )}
                  {check.nextRunAt && (
                    <p>Next run: {new Date(check.nextRunAt).toLocaleString()}</p>
                  )}
                </div>
              </div>
            ))}

            <button
              onClick={fetchHealth}
              className="w-full py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Refresh (auto-refreshes every 30s)
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
