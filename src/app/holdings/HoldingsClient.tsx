"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Account, Activity, Position } from "@/types/portfolio";
import { AppHeader } from "@/components/AppHeader";
import { BuyToCloseModal } from "@/components/BuyToCloseModal";
import { PositionForm } from "@/components/PositionForm";
import { PositionList } from "@/components/PositionList";

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
  const [accountsLoading, setAccountsLoading] = useState(initialAccounts.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | undefined>();
  const [addToWatchlistLoading, setAddToWatchlistLoading] = useState<string | null>(null);
  const [addToWatchlistMessage, setAddToWatchlistMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [btcPosition, setBtcPosition] = useState<Position | null>(null);
  type HoldingsTab = "positions" | "activity-history";
  const [holdingsTab, setHoldingsTab] = useState<HoldingsTab>("positions");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

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

  const fetchHoldings = useCallback(async () => {
    if (!selectedAccountId) return;
    setError(null);
    try {
      const res = await fetch(`/api/positions?accountId=${selectedAccountId}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setHoldings(data);
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
    fetchHoldings();
  }, [fetchHoldings]);

  useEffect(() => {
    if (holdingsTab === "activity-history") fetchActivities();
  }, [holdingsTab, selectedAccountId, fetchActivities]);

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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Holdings</h2>
            <p className="text-gray-600 mt-1">
              Symbol, description, qty, price, value, unit cost, cost basis — live data every 30s
            </p>
          </div>
          <div className="flex items-center gap-3">
            {selectedAccountId && (
              <div className="text-right">
                <div className="text-xs text-gray-500 uppercase tracking-wider">
                  Portfolio Value
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                  }).format(totalPortfolioValue)}
                </div>
              </div>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing || !selectedAccountId}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh prices"
            >
              <svg
                className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`}
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
              Refresh
            </button>
            {!showForm && accounts.length > 0 && (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
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
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <label
                  htmlFor="account-select"
                  className="text-sm font-medium text-gray-700"
                >
                  Select Account:
                </label>
                <select
                  id="account-select"
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="flex-1 max-w-md px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  {accounts.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.name} — {account.strategy} ({account.riskLevel} risk)
                    </option>
                  ))}
                </select>
                {selectedAccount && (
                  <div className="text-sm text-gray-500">
                    Balance:{" "}
                    <span className="font-semibold text-gray-900">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(selectedAccount.balance)}
                    </span>
                  </div>
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
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit price</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Fee</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comment</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {activities.map((a) => (
                          <tr key={a._id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{a.date}</td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{a.symbol}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{a.type}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">{a.quantity}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">
                              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(a.unitPrice)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">
                              {a.fee != null ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(a.fee) : "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{a.comment ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
