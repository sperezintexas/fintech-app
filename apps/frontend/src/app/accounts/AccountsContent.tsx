"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { AccountList } from "@/components/AccountList";
import { AccountForm } from "@/components/AccountForm";
import { MyHoldingsTable } from "@/components/MyHoldingsTable";
import { downloadCsv } from "@/lib/csv-export";
import type { Account, Activity, Broker, RiskLevel, Strategy } from "@/types/portfolio";

type ActivitySortKey = "date" | "symbol" | "type" | "quantity" | "unitPrice" | "fee" | "comment";

type AccountsTab = "portfolios" | "holdings" | "activity";

type FormData = {
  name: string;
  accountRef: string;
  brokerType: "" | "Merrill" | "Fidelity";
  brokerId: string;
  balance: number;
  riskLevel: RiskLevel;
  strategy: Strategy;
};

export function AccountsContent() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | undefined>();
  const [showForm, setShowForm] = useState(false);
  const [addFromQueryApplied, setAddFromQueryApplied] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | undefined>();
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as AccountsTab) || "portfolios";
  const [activeTab, setActiveTab] = useState<AccountsTab>(initialTab);
  const openAddFromQuery = searchParams.get("add") === "1" || searchParams.get("add") === "true";
  const [activityAccountId, setActivityAccountId] = useState<string>("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitySortBy, setActivitySortBy] = useState<ActivitySortKey | null>(null);
  const [activitySortDir, setActivitySortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (openAddFromQuery && !addFromQueryApplied && !isLoading) {
      setShowForm(true);
      setEditingAccount(undefined);
      setAddFromQueryApplied(true);
    }
  }, [openAddFromQuery, addFromQueryApplied, isLoading]);

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/accounts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch accounts");
      const data = await res.json();
      setAccounts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBrokers = async () => {
    try {
      const res = await fetch("/api/brokers");
      if (res.ok) {
        const data = await res.json();
        setBrokers(Array.isArray(data) ? data : []);
      }
    } catch {
      setBrokers([]);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchBrokers();
  }, []);

  const fetchActivities = useCallback(async (accountId: string) => {
    if (!accountId) return;
    setActivitiesLoading(true);
    try {
      const res = await fetch(`/api/activities?accountId=${accountId}`, { cache: "no-store", credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setActivities(data);
      } else {
        setActivities([]);
      }
    } catch {
      setActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "activity" && activityAccountId) fetchActivities(activityAccountId);
  }, [activeTab, activityAccountId, fetchActivities]);

  useEffect(() => {
    if (accounts.length > 0 && !activityAccountId) setActivityAccountId(accounts[0]._id);
  }, [accounts, activityAccountId]);

  const handleSubmit = async (data: FormData) => {
    setIsSaving(true);
    setError(null);

    try {
      const url = editingAccount
        ? `/api/accounts/${editingAccount._id}`
        : "/api/accounts";
      const method = editingAccount ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to save account");

      await fetchAccounts();
      setShowForm(false);
      setEditingAccount(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save account");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this account?")) return;

    setIsDeleting(id);
    setError(null);

    try {
      const res = await fetch(`/api/accounts/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete account");
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
    } finally {
      setIsDeleting(undefined);
    }
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingAccount(undefined);
  };

  const handleActivitySort = (key: ActivitySortKey) => {
    if (activitySortBy === key) {
      setActivitySortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
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

  const handleActivityExportCsv = () => {
    const headers = ["Date", "Symbol", "Type", "Qty", "Unit price", "Fee", "Comment"];
    const rows = sortedActivities.map((a) => [
      a.date ?? "",
      a.symbol ?? "",
      a.type ?? "",
      String(a.quantity),
      a.unitPrice.toFixed(2),
      a.fee != null ? a.fee.toFixed(2) : "",
      a.comment ?? "",
    ]);
    downloadCsv(`my-activity-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  const activitySortableTh = (label: string, sortKey: ActivitySortKey, className = "text-left") => {
    const isActive = activitySortBy === sortKey;
    return (
      <th
        className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:bg-gray-100 ${className}`}
        onClick={() => handleActivitySort(sortKey)}
        role="columnheader"
        aria-sort={isActive ? (activitySortDir === "asc" ? "ascending" : "descending") : undefined}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {isActive && (
            <span className="text-blue-600" aria-hidden>
              {activitySortDir === "asc" ? "↑" : "↓"}
            </span>
          )}
        </span>
      </th>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <AppHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">myAccounts</h2>
            <p className="text-gray-600 mt-1">
              Manage your investment accounts and strategies.
            </p>
          </div>
          {!showForm && (activeTab === "portfolios" || activeTab === "activity") && (
            <button
              onClick={() => setShowForm(true)}
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Account
            </button>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {error}
          </div>
        )}

        {showForm && (
          <div className="mb-8 bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">
              {editingAccount ? "Edit Account" : "Create New Account"}
            </h3>
            <AccountForm
              account={editingAccount}
              brokers={brokers}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              isLoading={isSaving}
            />
          </div>
        )}

        {!isLoading && accounts.length > 0 && (
          <div className="flex border-b border-gray-200 mb-6">
            <button
              type="button"
              onClick={() => setActiveTab("portfolios")}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === "portfolios"
                  ? "bg-white border border-b-0 border-gray-200 text-gray-900 -mb-px"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              My Portfolios
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("holdings")}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === "holdings"
                  ? "bg-white border border-b-0 border-gray-200 text-gray-900 -mb-px"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              My Holdings
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("activity")}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === "activity"
                  ? "bg-white border border-b-0 border-gray-200 text-gray-900 -mb-px"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              My Activity
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="mt-4 text-gray-500">Loading accounts...</p>
          </div>
        ) : activeTab === "holdings" ? (
          <MyHoldingsTable accounts={accounts} />
        ) : activeTab === "activity" ? (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <label htmlFor="activity-account" className="block text-sm font-medium text-gray-700 mb-2">
                View activity for account
              </label>
              <select
                id="activity-account"
                value={activityAccountId}
                onChange={(e) => setActivityAccountId(e.target.value)}
                className="w-full max-w-md px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                    {a.accountRef ? ` (${a.accountRef})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {activitiesLoading ? (
                <div className="p-8 flex justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600" />
                </div>
              ) : activities.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No activities yet. Import trades (Merrill CSV or API) to see history.
                </div>
              ) : (
                <>
                  <div className="flex justify-end px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                    <button
                      type="button"
                      onClick={handleActivityExportCsv}
                      className="text-sm font-medium text-gray-600 hover:text-gray-900 flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Export CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {activitySortableTh("Date", "date")}
                          {activitySortableTh("Symbol", "symbol")}
                          {activitySortableTh("Type", "type")}
                          {activitySortableTh("Qty", "quantity", "text-right")}
                          {activitySortableTh("Unit price", "unitPrice", "text-right")}
                          {activitySortableTh("Fee", "fee", "text-right")}
                          {activitySortableTh("Comment", "comment")}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {sortedActivities.map((a) => (
                        <tr key={a._id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{a.date}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{a.symbol}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{a.type}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">{a.quantity}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">
                            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(a.unitPrice)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-600">
                            {a.fee != null
                              ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(a.fee)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{a.comment ?? "—"}</td>
                        </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <AccountList
            accounts={accounts}
            brokers={brokers}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isDeleting={isDeleting}
          />
        )}
      </main>
    </div>
  );
}
