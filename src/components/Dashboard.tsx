"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { PortfolioCard } from "./PortfolioCard";
import { MarketConditions } from "./MarketConditions";
import { canMakeApiCall, recordApiCall, getRateLimitStatus } from "@/lib/rate-limiter";
import type { Portfolio, MarketConditions as MarketConditionsType } from "@/types/portfolio";

type DashboardStats = {
  totalValue: number;
  dailyChange: number;
  dailyChangePercent: number;
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
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState({ remaining: 5, total: 5, resetIn: 0 });
  const pathname = usePathname();

  // Update rate limit display
  const updateRateLimitDisplay = useCallback(() => {
    setRateLimitInfo(getRateLimitStatus());
  }, []);

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
    // Check rate limit before calling Polygon API
    if (!canMakeApiCall()) {
      console.log("Rate limit reached, skipping market data fetch");
      updateRateLimitDisplay();
      return;
    }

    try {
      recordApiCall("/api/market");
      const res = await fetch("/api/market", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch market data");
      const data = await res.json();
      setMarketData(data);
    } catch (err) {
      console.error("Market fetch error:", err);
      // Don't set error for market - dashboard can work without it
    } finally {
      updateRateLimitDisplay();
    }
  }, [updateRateLimitDisplay]);

  // Manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchDashboard(), fetchMarket()]);
    setIsRefreshing(false);
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

  // Update rate limit display periodically
  useEffect(() => {
    const interval = setInterval(updateRateLimitDisplay, 5000);
    return () => clearInterval(interval);
  }, [updateRateLimitDisplay]);

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
          {/* Rate Limit Indicator */}
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
            rateLimitInfo.remaining > 2 
              ? "bg-green-100 text-green-700" 
              : rateLimitInfo.remaining > 0 
              ? "bg-yellow-100 text-yellow-700"
              : "bg-red-100 text-red-700"
          }`}>
            <span>API: {rateLimitInfo.remaining}/{rateLimitInfo.total}</span>
            {rateLimitInfo.resetIn > 0 && (
              <span className="text-gray-500">({rateLimitInfo.resetIn}s)</span>
            )}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing || rateLimitInfo.remaining === 0}
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
          {isRefreshing ? "Refreshing..." : rateLimitInfo.remaining === 0 ? "Rate Limited" : "Refresh"}
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
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
          <p className="text-gray-500 text-sm">Active Accounts</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {stats?.accountCount || 0}
          </p>
          <p className="text-gray-400 text-sm mt-2">
            {stats?.accountCount === 0 ? "No accounts yet" : "All performing"}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-sm">Open Positions</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {stats?.positionCount || 0}
          </p>
          <p className="text-emerald-600 text-sm mt-2">
            {stats?.positionCount === 0 ? "No positions" : "Active"}
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
              <p className="text-gray-500">
                No accounts yet. Create an account to get started.
              </p>
            </div>
          )}
        </div>

        {/* Market Conditions - Takes 1 column */}
        <div className="lg:col-span-1">
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
