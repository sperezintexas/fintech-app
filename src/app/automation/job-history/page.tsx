"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";

type JobRun = {
  id: string;
  name: string;
  lastRunAt: string | null;
  lastFinishedAt: string | null;
  failCount: number;
  status: "success" | "failed";
  error: string | null;
  notes: string | null;
};

function formatDateLocal(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function todayISO(): string {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export default function JobHistoryPage() {
  const [date, setDate] = useState<string>(todayISO());
  const [showAll, setShowAll] = useState(false);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = showAll ? "/api/jobs/history" : `/api/jobs/history?date=${date}`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load job history");
        return res.json();
      })
      .then((data: JobRun[]) => setRuns(Array.isArray(data) ? data : []))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [date, showAll]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link
            href="/automation"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to Setup
          </Link>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Job run history</h2>
            <p className="text-gray-600 mt-1">
              View jobs that ran (Run now or scheduled) and their status or error. Date filter uses UTC.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">All dates</span>
            </label>
            {!showAll && (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm mb-6">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-gray-600">Loading...</span>
            </div>
          ) : runs.length === 0 ? (
            <div className="py-16 px-6 text-center text-gray-600 max-w-md mx-auto">
              <p className="font-medium text-gray-700">No job runs found for the selected {showAll ? "history" : "date"}.</p>
              <p className="mt-2 text-sm">
                Job run history shows jobs that have already run (via &quot;Run now&quot; on the Scheduler or from a schedule).
              </p>
              {!showAll && (
                <p className="mt-2 text-sm">Try another date or check &quot;All dates&quot;.</p>
              )}
              <Link
                href="/automation/scheduler"
                className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Go to Scheduler →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Run time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Job name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Error
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {runs.map((run) => (
                    <tr key={run.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                        {formatDateLocal(run.lastRunAt)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {run.name}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            run.status === "success"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {run.status === "success" ? "Success" : "Failed"}
                          {run.failCount > 1 && ` (${run.failCount}x)`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-md truncate" title={run.error ?? undefined}>
                        {run.error ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-sm" title={run.notes ?? undefined}>
                        {run.notes ? (
                          <pre className="whitespace-pre-wrap font-sans text-xs max-h-24 overflow-y-auto">{run.notes}</pre>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
