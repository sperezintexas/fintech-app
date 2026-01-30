"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Account, Position } from "@/types/portfolio";
import { AppHeader } from "@/components/AppHeader";
import { PositionForm } from "@/components/PositionForm";
import { PositionList } from "@/components/PositionList";

const POLL_INTERVAL_MS = 30_000;

function HoldingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlAccountId = searchParams.get("accountId");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [holdings, setHoldings] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | undefined>();

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
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    } finally {
      setLoading(false);
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

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  // Real-time polling for live prices
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
    } catch (error) {
      console.error("Failed to add holding:", error);
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
    } catch (error) {
      console.error("Failed to update holding:", error);
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
    } catch (error) {
      console.error("Failed to delete holding:", error);
    }
  };

  const selectedAccount = accounts.find((a) => a._id === selectedAccountId);

  const totalPortfolioValue = holdings.reduce(
    (sum, p) => sum + (p.marketValue ?? 0),
    0
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchHoldings();
  }, [fetchHoldings]);

  const handleAddToWatchlist = useCallback(
    (position: Position) => {
      const params = new URLSearchParams();
      params.set("addFromHolding", "1");
      params.set("accountId", selectedAccountId);
      params.set("symbol", (position.ticker ?? "").toUpperCase());
      if (position.type === "stock") {
        params.set("type", "stock");
        params.set("strategy", "long-stock");
        params.set("quantity", String(position.shares ?? 0));
        params.set("entryPrice", String(position.purchasePrice ?? position.currentPrice ?? 0));
      } else if (position.type === "option") {
        params.set("type", position.optionType === "put" ? "put" : "call");
        params.set("strategy", "leap-call");
        params.set("quantity", String(position.contracts ?? 0));
        params.set("entryPrice", String(position.strike ?? 0));
        if (position.premium != null) params.set("entryPremium", String(position.premium));
        if (position.strike != null) params.set("strikePrice", String(position.strike));
        if (position.expiration) params.set("expirationDate", position.expiration);
      }
      router.push(`/watchlist?${params.toString()}`);
    },
    [selectedAccountId, router]
  );

  if (loading) {
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
              Symbol, shares, last price, market value, and unrealized P/L — live data every 30s
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

            {showForm ? (
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
              <PositionList
                positions={holdings}
                onEdit={(position) => {
                  setEditingPosition(position);
                  setShowForm(true);
                }}
                onDelete={handleDeletePosition}
                onAddToWatchlist={handleAddToWatchlist}
                accountId={selectedAccountId}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function HoldingsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <HoldingsContent />
    </Suspense>
  );
}
