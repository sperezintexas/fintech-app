"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

type ActivitySortKey = "date" | "symbol" | "type" | "quantity" | "unitPrice" | "fee" | "comment";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Account, Activity, Broker, Position, WatchlistAlert } from "@/types/portfolio";
import { AppHeader } from "@/components/AppHeader";
import { getBrokerLogoUrl } from "@/lib/broker-logo-url";

import { BuyToCloseModal } from "@/components/BuyToCloseModal";
import { PositionForm } from "@/components/PositionForm";
import { PositionList } from "@/components/PositionList";

function alertSeverityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-red-100 text-red-800 border-red-200";
    case "urgent":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "warning":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    default:
      return "bg-blue-100 text-blue-800 border-blue-200";
  }
}

function alertRecommendationBadge(rec: string): string {
  switch (rec) {
    case "HOLD":
      return "bg-green-100 text-green-800";
    case "CLOSE":
    case "STC":
      return "bg-red-100 text-red-800";
    case "BTC":
      return "bg-yellow-100 text-yellow-800";
    case "ROLL":
      return "bg-blue-100 text-blue-800";
    case "WATCH":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function ActiveAlertCard({ alert }: { alert: WatchlistAlert }) {
  const severity = alert.severity ?? "info";
  const details = alert.details && typeof alert.details === "object" ? alert.details : null;
  const created = alert.createdAt
    ? new Date(alert.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";
  return (
    <div className={`p-3 rounded-xl border ${alertSeverityColor(severity)}`}>
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span className="font-semibold text-gray-900">{alert.symbol}</span>
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${alertRecommendationBadge(alert.recommendation)}`}>
          {alert.recommendation}
        </span>
        <span className="text-xs text-gray-500">{created}</span>
        {alert.acknowledged && (
          <span className="text-xs text-gray-500 italic">Acknowledged</span>
        )}
      </div>
      <p className="text-sm text-gray-700 whitespace-pre-line">{alert.reason}</p>
      {details && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {details.currentPrice != null && (
            <span>Current: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(details.currentPrice)}</span>
          )}
          {details.entryPrice != null && (
            <span>Entry: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(details.entryPrice)}</span>
          )}
          {details.priceChangePercent != null && (
            <span className={details.priceChangePercent >= 0 ? "text-green-700" : "text-red-700"}>
              {details.priceChangePercent >= 0 ? "+" : ""}{details.priceChangePercent.toFixed(2)}%
            </span>
          )}
          {details.daysToExpiration != null && (
            <span>DTE: {details.daysToExpiration}d</span>
          )}
        </div>
      )}
      {alert.suggestedActions?.length > 0 && (
        <ul className="mt-1.5 text-xs text-gray-600 space-y-0.5">
          {alert.suggestedActions.map((action, i) => (
            <li key={i}>• {action}</li>
          ))}
        </ul>
      )}
      {alert.riskWarning && (
        <p className="mt-1.5 text-xs text-red-700 italic">Risk: {alert.riskWarning}</p>
      )}
    </div>
  );
}

const POLL_INTERVAL_MS = 30_000;

export type HoldingsClientProps = {
  initialAccounts: Account[];
  urlAccountId: string | null;
};

export function HoldingsClient({ initialAccounts, urlAccountId: urlAccountIdProp }: HoldingsClientProps) {
  const searchParams = useSearchParams();
  const urlAccountId = searchParams.get("accountId") ?? urlAccountIdProp;

  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    if (urlAccountId && initialAccounts.some((a) => a._id === urlAccountId)) return urlAccountId;
    return initialAccounts.length > 0 ? initialAccounts[0]._id : "";
  });
  const [holdings, setHoldings] = useState<Position[]>([]);
  const [hasActivities, setHasActivities] = useState(false);
  const [accountsLoading, setAccountsLoading] = useState(initialAccounts.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | undefined>();
  const [addToWatchlistLoading, setAddToWatchlistLoading] = useState<string | null>(null);
  const [addToWatchlistMessage, setAddToWatchlistMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [btcPosition, setBtcPosition] = useState<Position | null>(null);
  type HoldingsTab = "positions" | "activity-history" | "active-alerts";
  const [holdingsTab, setHoldingsTab] = useState<HoldingsTab>("positions");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [alerts, setAlerts] = useState<WatchlistAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [activitySortBy, setActivitySortBy] = useState<ActivitySortKey | null>(null);
  const [activitySortDir, setActivitySortDir] = useState<"asc" | "desc">("asc");
  const [brokers, setBrokers] = useState<Broker[]>([]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
        if (data.length > 0 && !selectedAccountId) {
          if (urlAccountId && data.some((a: Account) => a._id === urlAccountId)) {
            setSelectedAccountId(urlAccountId);
          } else {
            setSelectedAccountId(data[0]._id);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch accounts:", err);
    } finally {
      setAccountsLoading(false);
    }
  }, [selectedAccountId, urlAccountId]);

  const fetchBrokers = useCallback(async () => {
    try {
      const res = await fetch("/api/brokers");
      if (res.ok) {
        const data = await res.json();
        setBrokers(Array.isArray(data) ? data : []);
      }
    } catch {
      setBrokers([]);
    }
  }, []);

  const fetchHoldings = useCallback(async () => {
    if (!selectedAccountId) return;
    setError(null);
    try {
      const res = await fetch(`/api/positions?accountId=${selectedAccountId}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data?.positions ?? [];
        setHoldings(list);
        setHasActivities(data?.hasActivities === true);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Failed to fetch holdings");
      }
    } catch (err) {
      console.error("Failed to fetch holdings:", err);
      setError("Failed to fetch holdings");
    } finally {
      setRefreshing(false);
    }
  }, [selectedAccountId]);

  const fetchActivities = useCallback(async () => {
    if (!selectedAccountId) return;
    setActivitiesLoading(true);
    try {
      const res = await fetch(`/api/activities?accountId=${selectedAccountId}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setActivities(data);
      } else {
        setActivities([]);
      }
    } catch (err) {
      console.error("Failed to fetch activities:", err);
      setActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    if (initialAccounts.length === 0) fetchAccounts();
  }, [initialAccounts.length, fetchAccounts]);

  useEffect(() => {
    fetchBrokers();
  }, [fetchBrokers]);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  useEffect(() => {
    if (holdingsTab === "activity-history") fetchActivities();
  }, [holdingsTab, selectedAccountId, fetchActivities]);

  const fetchAlerts = useCallback(async () => {
    if (!selectedAccountId) return;
    setAlertsLoading(true);
    try {
      const res = await fetch(`/api/alerts?accountId=${selectedAccountId}&limit=100`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAlerts(Array.isArray(data) ? data : []);
      } else {
        setAlerts([]);
      }
    } catch {
      setAlerts([]);
    } finally {
      setAlertsLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    if (holdingsTab === "active-alerts" && selectedAccountId) fetchAlerts();
  }, [holdingsTab, selectedAccountId, fetchAlerts]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const interval = setInterval(fetchHoldings, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [selectedAccountId, fetchHoldings]);

  const handleAddPosition = async (
    positionData: Partial<Position> & { accountId: string }
  ) => {
    try {
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(positionData),
      });
      if (res.ok) {
        await fetchHoldings();
        setShowForm(false);
      }
    } catch (err) {
      console.error("Failed to add holding:", err);
    }
  };

  const handleUpdatePosition = async (
    positionData: Partial<Position> & { accountId: string }
  ) => {
    if (!editingPosition) return;
    try {
      const res = await fetch(`/api/positions/${editingPosition._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(positionData),
      });
      if (res.ok) {
        await fetchHoldings();
        setEditingPosition(undefined);
        setShowForm(false);
      }
    } catch (err) {
      console.error("Failed to update holding:", err);
    }
  };

  const handleDeletePosition = async (positionId: string) => {
    if (!confirm("Are you sure you want to delete this holding?")) return;
    try {
      const res = await fetch(
        `/api/positions/${positionId}?accountId=${selectedAccountId}`,
        { method: "DELETE" }
      );
      if (res.ok) await fetchHoldings();
    } catch (err) {
      console.error("Failed to delete holding:", err);
    }
  };

  const selectedAccount = useMemo(
    () => accounts.find((a) => a._id === selectedAccountId),
    [accounts, selectedAccountId]
  );

  const totalPortfolioValue = holdings.reduce(
    (sum, p) => sum + (p.marketValue ?? 0),
    0
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchHoldings();
  }, [fetchHoldings]);

  const handleAddToWatchlist = useCallback(
    async (position: Position) => {
      if (!selectedAccountId || position.type === "cash") return;
      const rawTicker = (position.ticker ?? "").toUpperCase();
      if (!rawTicker) return;

      const underlying =
        position.type === "option" && /^\w+\d/.test(rawTicker)
          ? rawTicker.replace(/\d.*$/, "")
          : rawTicker;
      const symbol = position.type === "option" ? underlying : rawTicker;

      setAddToWatchlistLoading(position._id);
      setAddToWatchlistMessage(null);
      try {
        const watchlistsRes = await fetch("/api/watchlists", { cache: "no-store" });
        if (!watchlistsRes.ok) throw new Error("Failed to fetch watchlists");
        const watchlists = await watchlistsRes.json();
        const defaultWatchlist = watchlists.find((w: { name: string }) => w.name === "Default") ?? watchlists[0];
        if (!defaultWatchlist) throw new Error("No watchlist found");

        const body: Record<string, unknown> = {
          watchlistId: defaultWatchlist._id,
          accountId: selectedAccountId,
          symbol,
          underlyingSymbol: symbol,
          quantity: position.type === "stock" ? (position.shares ?? 0) : (position.contracts ?? 0),
          entryPrice: position.type === "stock"
            ? (position.purchasePrice ?? position.currentPrice ?? 0)
            : (position.premium ?? position.strike ?? 0),
        };

        if (position.type === "stock") {
          body.type = "stock";
          body.strategy = "long-stock";
        } else if (position.type === "option") {
          body.type = position.optionType === "put" ? "put" : "call";
          body.strategy = position.optionType === "call" ? "covered-call" : "cash-secured-put";
          if (position.strike != null) body.strikePrice = position.strike;
          if (position.expiration) body.expirationDate = position.expiration;
          if (position.premium != null) body.entryPremium = position.premium;
        }

        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to add to watchlist");

        setAddToWatchlistMessage({ type: "success", text: `Added ${position.type === "option" ? rawTicker : symbol} to watchlist` });
        setTimeout(() => setAddToWatchlistMessage(null), 3000);
      } catch (err) {
        setAddToWatchlistMessage({
          type: "error",
          text: err instanceof Error ? err.message : "Failed to add to watchlist",
        });
      } finally {
        setAddToWatchlistLoading(null);
      }
    },
    [selectedAccountId]
  );

  const handleActivitySort = (key: ActivitySortKey) => {
    if (activitySortBy === key) setActivitySortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setActivitySortBy(key);
      setActivitySortDir("asc");
    }
  };

  const sortedActivities = useMemo(() => {
    if (!activitySortBy) return activities;
    return [...activities].sort((a, b) => {
      let cmp = 0;
      switch (activitySortBy) {
        case "date":
          cmp = (a.date ?? "").localeCompare(b.date ?? "");
          break;
        case "symbol":
          cmp = (a.symbol ?? "").localeCompare(b.symbol ?? "");
          break;
        case "type":
          cmp = (a.type ?? "").localeCompare(b.type ?? "");
          break;
        case "quantity":
          cmp = a.quantity - b.quantity;
          break;
        case "unitPrice":
          cmp = a.unitPrice - b.unitPrice;
          break;
        case "fee":
          cmp = (a.fee ?? 0) - (b.fee ?? 0);
          break;
        case "comment":
          cmp = (a.comment ?? "").localeCompare(b.comment ?? "");
          break;
        default:
          break;
      }
      return activitySortDir === "asc" ? cmp : -cmp;
    });
  }, [activities, activitySortBy, activitySortDir]);

  const activityTh = (label: string, key: ActivitySortKey, className = "text-left") => (
    <th
      className={`px-3 py-2 text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:bg-gray-100 ${className}`}
      onClick={() => handleActivitySort(key)}
      role="columnheader"
      aria-sort={activitySortBy === key ? (activitySortDir === "asc" ? "ascending" : "descending") : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {activitySortBy === key && (
          <span className="text-blue-600" aria-hidden>{activitySortDir === "asc" ? "↑" : "↓"}</span>
        )}
      </span>
    </th>
  );

  const showLoadingSpinner = initialAccounts.length === 0 && accountsLoading;
  if (showLoadingSpinner) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900">myHoldings</h2>
            <span className="text-sm text-gray-500">Live data every 30s</span>
            {selectedAccountId && (
              <span className="text-sm text-gray-600">
                Portfolio:{" "}
                <span className="font-semibold text-gray-900">
                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalPortfolioValue)}
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing || !selectedAccountId}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh prices"
            >
              <svg className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            {!showForm && accounts.length > 0 && (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Holding
              </button>
            )}
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-yellow-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No Accounts Found
            </h3>
            <p className="text-gray-500 mb-4">
              Create an account before adding holdings.
            </p>
            <Link
              href="/accounts"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Go to Accounts
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-4">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                {(() => {
                  const broker = selectedAccount?.brokerId
                    ? brokers.find((b) => b._id === selectedAccount.brokerId)
                    : undefined;
                  const logoSrc =
                    getBrokerLogoUrl(broker ?? null, selectedAccount?.brokerType ?? null) ??
                    (broker ? `/api/brokers/${broker._id}/logo` : null);
                  if (!logoSrc) return null;
                  return (
                    <img
                      src={logoSrc}
                      alt=""
                      className="w-8 h-8 rounded object-contain bg-gray-50 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  );
                })()}
                <label htmlFor="account-select" className="text-sm font-medium text-gray-700 shrink-0">
                  Account:
                </label>
                <select
                  id="account-select"
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="flex-1 min-w-0 max-w-md px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  {accounts.map((account) => {
                    const last4 = account.accountRef?.slice(-4);
                    const refSuffix = last4 ? ` ···${last4}` : "";
                    return (
                      <option key={account._id} value={account._id}>
                        {account.name}{refSuffix} — {account.strategy} ({account.riskLevel} risk)
                      </option>
                    );
                  })}
                </select>
                {selectedAccount && (
                  <span className="text-xs text-gray-500">
                    Balance:{" "}
                    <span className="font-semibold text-gray-900">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(selectedAccount.balance)}
                    </span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-2 border-b border-gray-200 mb-4">
              <button
                type="button"
                onClick={() => setHoldingsTab("positions")}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  holdingsTab === "positions"
                    ? "bg-white border border-b-0 border-gray-200 text-blue-600 -mb-px"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Positions
              </button>
              <button
                type="button"
                onClick={() => setHoldingsTab("activity-history")}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  holdingsTab === "activity-history"
                    ? "bg-white border border-b-0 border-gray-200 text-blue-600 -mb-px"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Activity history
              </button>
              <button
                type="button"
                onClick={() => setHoldingsTab("active-alerts")}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  holdingsTab === "active-alerts"
                    ? "bg-white border border-b-0 border-gray-200 text-blue-600 -mb-px"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Active Alerts
              </button>
            </div>

            {addToWatchlistMessage && (
              <div
                className={`mb-4 p-3 rounded-lg flex items-center justify-between gap-4 ${
                  addToWatchlistMessage.type === "success"
                    ? "bg-green-50 border border-green-200 text-green-800"
                    : "bg-red-50 border border-red-200 text-red-800"
                }`}
              >
                <p className="font-medium">
                  {addToWatchlistMessage.text}
                  {addToWatchlistMessage.type === "success" && (
                    <Link href="/watchlist" className="ml-2 text-indigo-600 hover:underline font-semibold">
                      View Watchlist →
                    </Link>
                  )}
                </p>
                <button
                  onClick={() => setAddToWatchlistMessage(null)}
                  className="p-1 hover:opacity-70"
                  aria-label="Dismiss"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-4">
                <p className="text-red-800 font-medium">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="text-red-600 hover:text-red-800 p-1"
                  aria-label="Dismiss"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {holdingsTab === "activity-history" ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {activitiesLoading ? (
                  <div className="p-8 flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600" />
                  </div>
                ) : activities.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No activities yet. Import trades via API or CSV to see history.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {activityTh("Date", "date")}
                          {activityTh("Symbol", "symbol")}
                          {activityTh("Type", "type")}
                          {activityTh("Qty", "quantity", "text-right")}
                          {activityTh("Unit price", "unitPrice", "text-right")}
                          {activityTh("Fee", "fee", "text-right")}
                          {activityTh("Comment", "comment")}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {sortedActivities.map((a) => (
                          <tr key={a._id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">{a.date}</td>
                            <td className="px-3 py-2 text-sm font-medium text-gray-900">{a.symbol}</td>
                            <td className="px-3 py-2 text-sm text-gray-600">{a.type}</td>
                            <td className={`px-3 py-2 text-sm text-right ${a.quantity < 0 ? "text-red-600 font-medium" : "text-gray-900"}`}>
                              {a.quantity < 0 ? `${a.quantity}` : a.quantity}
                            </td>
                            <td className="px-3 py-2 text-sm text-right text-gray-900">
                              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(a.unitPrice)}
                            </td>
                            <td className="px-3 py-2 text-sm text-right text-gray-600">
                              {a.fee != null ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(a.fee) : "—"}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-500 max-w-xs truncate">{a.comment ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : holdingsTab === "active-alerts" ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {!selectedAccountId ? (
                  <div className="p-8 text-center text-gray-500">Select an account to view alerts.</div>
                ) : alertsLoading ? (
                  <div className="p-8 flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600" />
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No alerts for this account. Alerts are created by daily analysis and option scanner jobs.
                  </div>
                ) : (
                  <div className="p-4 space-y-3">
                    {alerts.map((alert) => (
                      <ActiveAlertCard key={alert._id} alert={alert} />
                    ))}
                    <Link
                      href="/alerts"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 mt-2"
                    >
                      View all alerts
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                )}
              </div>
            ) : showForm ? (
              <PositionForm
                position={editingPosition}
                accountId={selectedAccountId}
                onSubmit={editingPosition ? handleUpdatePosition : handleAddPosition}
                onCancel={() => {
                  setEditingPosition(undefined);
                  setShowForm(false);
                }}
              />
            ) : holdings.length === 0 ? (
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
                {hasActivities ? (
                  <>
                    <p className="text-gray-700 font-medium">No open positions</p>
                    <p className="text-gray-500 text-sm mt-1">
                      Positions are derived from your activity history. Zero open positions means all trades are closed or net flat.
                    </p>
                    <button
                      type="button"
                      onClick={() => setHoldingsTab("activity-history")}
                      className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 underline"
                    >
                      View Activity history →
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-gray-500">No holdings yet</p>
                    <p className="text-gray-400 text-sm mt-1">
                      Add a stock, option, or cash holding to get started — or import activities from CSV/JSON.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <>
                <PositionList
                  positions={holdings}
                  onEdit={(position) => {
                    setEditingPosition(position);
                    setShowForm(true);
                  }}
                  onDelete={handleDeletePosition}
                  onAddToWatchlist={handleAddToWatchlist}
                  onBuyToClose={setBtcPosition}
                  addToWatchlistLoadingId={addToWatchlistLoading}
                  accountId={selectedAccountId}
                />
                {btcPosition && selectedAccountId && (
                  <BuyToCloseModal
                    position={btcPosition}
                    accountId={selectedAccountId}
                    onClose={() => setBtcPosition(null)}
                    onSuccess={fetchHoldings}
                  />
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
