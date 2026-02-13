"use client";

import { useState, useEffect } from "react";
import { useDisplayTimezone } from "@/hooks/useDisplayTimezone";

type LoginAttemptItem = {
  success: boolean;
  ip: string;
  userAgent?: string;
  createdAt: string;
  country?: string;
};

function displayIp(ip: string): string {
  if (ip === "::1" || ip === "127.0.0.1") return "localhost";
  return ip;
}

type LoginHistoryData = {
  successCount: number;
  failedCount: number;
  attempts: LoginAttemptItem[];
};

export default function LoginHistoryPage() {
  const { formatDate } = useDisplayTimezone();
  const [data, setData] = useState<LoginHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/login-history?days=${windowDays}&limit=50`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load login history");
        return res.json();
      })
      .then((d: LoginHistoryData) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [windowDays]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Login history</h2>
          <p className="text-gray-600 mt-1">
            Success and failed login attempts. Failed attempts are recorded when sign-in is denied (e.g. X not allowed).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="login-history-days" className="text-sm text-gray-700">
            Window:
          </label>
          <select
            id="login-history-days"
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="text-sm font-medium text-gray-500">Successful logins</div>
              <div className="text-2xl font-bold text-green-600 mt-1">{data.successCount}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="text-sm font-medium text-gray-500">Failed attempts</div>
              <div className="text-2xl font-bold text-red-600 mt-1">{data.failedCount}</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <h3 className="px-4 py-3 text-sm font-semibold text-gray-700 border-b border-gray-100">
              Recent attempts (last 50)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Result</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Time (your timezone)</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">IP</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Country</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">User-Agent</th>
                  </tr>
                </thead>
                <tbody>
                  {data.attempts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-gray-500">
                        No attempts in the selected window.
                      </td>
                    </tr>
                  ) : (
                    data.attempts.map((a, i) => (
                      <tr key={`${a.createdAt}-${a.ip}-${i}`} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                              a.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                            }`}
                          >
                            {a.success ? "Success" : "Failed"}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-gray-700">{formatDate(a.createdAt)}</td>
                        <td className="py-2 px-3 font-mono text-gray-600">{displayIp(a.ip)}</td>
                        <td className="py-2 px-3 text-gray-600">{a.country ?? "—"}</td>
                        <td className="py-2 px-3 text-gray-500 max-w-[200px] truncate" title={a.userAgent ?? ""}>
                          {a.userAgent ?? "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
