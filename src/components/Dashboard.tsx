"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { PortfolioCard } from "./PortfolioCard";
import { MarketConditions } from "./MarketConditions";
import type { Portfolio, MarketConditions as MarketConditionsType } from "@/types/portfolio";

type DashboardStats = {
  totalValue: number;
  dailyChange: number;
  dailyChangePercent: number;
  totalCostBasis?: number;
  unrealizedPnL?: number;
  roiPercent?: number;
  accountCount: number;
  positionCount: number;
  recommendationCount: number;
};

type DashboardData = {
  portfolio: Portfolio;
  stats: DashboardStats;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

export function Dashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [marketData, setMarketData] = useState<MarketConditionsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [schedulerMessage, setSchedulerMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const pathname = usePathname();


  // Fetch dashboard data (no cache to always get fresh data)
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      const data = await res.json();
      setDashboardData(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    }
  }, []);

  // Fetch market data (rate limited - calls Polygon API)
  const fetchMarket = useCallback(async () => {
    try {
      const res = await fetch("/api/market", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch market data");
      const data = await res.json();
      setMarketData(data);
    } catch (err) {
      console.error("Market fetch error:", err);
      // Don't set error for market - dashboard can work without it
    }
  }, []);

  // Manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchDashboard(), fetchMarket()]);
    setIsRefreshing(false);
  };

  // Run portfolio scanners (Option Scanner, Covered Call, etc.)
  const runPortfolioScanners = async () => {
    setSchedulerMessage("");
    setSchedulerLoading(true);
    try {
      const res = await fetch("/api/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "runPortfolio" }),
      });
      const data = (await res.json()) as { success?: boolean; message?: string; error?: string };
      if (res.ok && data.success) {
        setSchedulerMessage(data.message ?? "Portfolio scanners triggered.");
        setTimeout(() => setSchedulerMessage(""), 5000);
        await fetchDashboard();
      } else {
        setSchedulerMessage(`Error: ${data.error ?? "Failed to run portfolio scanners"}`);
      }
    } catch (err) {
      setSchedulerMessage("Error: Failed to run portfolio scanners");
    } finally {
      setSchedulerLoading(false);
    }
  };

  // Refresh when pathname changes (user navigates back to dashboard)
  useEffect(() => {
    if (pathname === "/") {
      fetchDashboard();
      fetchMarket();
    }
  }, [pathname, fetchDashboard, fetchMarket]);

  // Initial fetch and refresh on visibility change
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchDashboard(), fetchMarket()]);
      setIsLoading(false);
    };

    // Initial load
    loadData();

    // Refresh when page becomes visible (user navigates back)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchDashboard();
        fetchMarket();
      }
    };

    // Refresh when window gains focus
    const handleFocus = () => {
      fetchDashboard();
      fetchMarket();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // Auto-refresh every 60 seconds (only if enabled) - respects API rate limits
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchDashboard();
      fetchMarket();
    }, 60000); // 60 seconds to stay within rate limits

    return () => clearInterval(interval);
  }, [autoRefresh, fetchDashboard, fetchMarket]);


  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-700">
        {error}
      </div>
    );
  }

  const stats = dashboardData?.stats;
  const portfolio = dashboardData?.portfolio;

  return (
    <>
      {/* Refresh Controls */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">Auto-refresh (1m)</span>
          </label>
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          {schedulerMessage && (
            <span className={`text-xs ${schedulerMessage.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
              {schedulerMessage}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runPortfolioScanners}
            disabled={schedulerLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {schedulerLoading ? (
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {schedulerLoading ? "Running…" : "Run scanners"}
          </button>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
          <svg
            className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white">
          <p className="text-blue-100 text-sm">Total Portfolio Value</p>
          <p className="text-2xl font-bold mt-1">
            {formatCurrency(stats?.totalValue || 0)}
          </p>
          <p className={`text-sm mt-2 ${(stats?.dailyChange || 0) >= 0 ? "text-blue-200" : "text-red-200"}`}>
            {(stats?.dailyChange || 0) >= 0 ? "+" : ""}
            {formatCurrency(stats?.dailyChange || 0)} today
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-sm">Unrealized P&L</p>
          <p className={`text-2xl font-bold mt-1 ${(stats?.unrealizedPnL ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {(stats?.unrealizedPnL ?? 0) >= 0 ? "+" : ""}
            {formatCurrency(stats?.unrealizedPnL ?? 0)}
          </p>
          <p className="text-gray-400 text-sm mt-2">
            {stats?.totalCostBasis != null && stats.totalCostBasis > 0
              ? `ROI ${(stats?.roiPercent ?? 0) >= 0 ? "+" : ""}${(stats?.roiPercent ?? 0).toFixed(1)}%`
              : "—"}
          </p>
        </div>
        <Link
          href="/accounts"
          className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:border-blue-200 hover:bg-blue-50/30 transition-colors block"
        >
          <p className="text-gray-500 text-sm">Active Accounts</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {stats?.accountCount || 0}
          </p>
          <p className="text-blue-600 text-sm mt-2 font-medium">
            Manage accounts →
          </p>
        </Link>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-sm">Open Holdings</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {stats?.positionCount || 0}
          </p>
          <p className="text-emerald-600 text-sm mt-2">
            {stats?.positionCount === 0 ? "No holdings" : "Active"}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-sm">Recommendations</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {stats?.recommendationCount || 0}
          </p>
          <p className="text-blue-600 text-sm mt-2">
            {stats?.recommendationCount === 0 ? "None pending" : "Review pending"}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-sm">ROI</p>
          <p className={`text-2xl font-bold mt-1 ${(stats?.roiPercent ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {(stats?.roiPercent ?? 0) >= 0 ? "+" : ""}
            {(stats?.roiPercent ?? 0).toFixed(1)}%
          </p>
          <p className="text-gray-400 text-sm mt-2">
            {stats?.totalCostBasis != null && stats.totalCostBasis > 0 ? "Since cost basis" : "—"}
          </p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Portfolio - Takes 2 columns */}
        <div className="lg:col-span-2">
          {portfolio ? (
            <PortfolioCard portfolio={portfolio} />
          ) : (
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Portfolio Overview
              </h2>
              <p className="text-gray-500 mb-4">
                No accounts yet. Create an account to get started.
              </p>
              <Link
                href="/accounts"
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Manage accounts
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}
        </div>

        {/* Right column: Market + Allocation chart */}
        <div className="lg:col-span-1 space-y-8">
          {marketData ? (
            <MarketConditions market={marketData} />
          ) : (
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Market Conditions
              </h2>
              <p className="text-gray-500">Loading market data...</p>
            </div>
          )}

          {/* Allocation chart (Recharts) */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Allocation by Account
            </h2>
            {portfolio && portfolio.accounts.length > 0 && portfolio.accounts.some((a) => (a.balance ?? 0) > 0) ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={portfolio.accounts.map((a) => ({
                      name: a.name,
                      value: a.balance ?? 0,
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${String(name)} ${(((percent ?? 0) as number) * 100).toFixed(0)}%`
                    }
                  >
                    {portfolio.accounts.map((_, i) => (
                      <Cell
                        key={i}
                        fill={["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"][i % 5]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-sm py-8 text-center">
                Add accounts and positions to see allocation.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Recommendations Section */}
      {portfolio && portfolio.accounts.some((acc) => acc.recommendations.length > 0) && (
        <div className="mt-8">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-800">
                Active Recommendations
              </h2>
              <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                View All
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {portfolio.accounts
                .flatMap((acc) => acc.recommendations)
                .slice(0, 4)
                .map((rec) => (
                  <div
                    key={rec.id}
                    className={`p-4 border rounded-xl ${
                      rec.type === "buy"
                        ? "border-emerald-200 bg-emerald-50"
                        : rec.type === "sell"
                        ? "border-red-200 bg-red-50"
                        : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded-full uppercase ${
                          rec.type === "buy"
                            ? "bg-emerald-200 text-emerald-800"
                            : rec.type === "sell"
                            ? "bg-red-200 text-red-800"
                            : "bg-gray-200 text-gray-800"
                        }`}
                      >
                        {rec.type}
                      </span>
                      <span className="text-xs text-gray-500">
                        {Math.round(rec.confidence * 100)}% confidence
                      </span>
                    </div>
                    <p className="font-semibold text-gray-800">{rec.ticker}</p>
                    <p className="text-sm text-gray-600 mt-1">{rec.reason}</p>
                    <div className="flex gap-2 mt-3">
                      <button
                        className={`flex-1 px-3 py-2 text-white text-sm font-medium rounded-lg ${
                          rec.type === "buy"
                            ? "bg-emerald-600 hover:bg-emerald-700"
                            : rec.type === "sell"
                            ? "bg-red-600 hover:bg-red-700"
                            : "bg-gray-600 hover:bg-gray-700"
                        }`}
                      >
                        Execute
                      </button>
                      <button className="px-3 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
