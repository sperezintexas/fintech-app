"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { AccountList } from "@/components/AccountList";
import { AccountForm } from "@/components/AccountForm";
import { MyHoldingsTable } from "@/components/MyHoldingsTable";
import type { Account, Activity, RiskLevel, Strategy } from "@/types/portfolio";

type AccountsTab = "portfolios" | "holdings" | "activity";

type FormData = {
  name: string;
  accountRef: string;
  brokerType: "" | "Merrill" | "Fidelity";
  balance: number;
  riskLevel: RiskLevel;
  strategy: Strategy;
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | undefined>();
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | undefined>();
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as AccountsTab) || "portfolios";
  const [activeTab, setActiveTab] = useState<AccountsTab>(initialTab);
  const [activityAccountId, setActivityAccountId] = useState<string>("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  // Fetch accounts
  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/accounts");
      if (!res.ok) throw new Error("Failed to fetch accounts");
      const data = await res.json();
      setAccounts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchActivities = useCallback(async (accountId: string) => {
    if (!accountId) return;
    setActivitiesLoading(true);
    try {
      const res = await fetch(`/api/activities?accountId=${accountId}`, { cache: "no-store" });
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

  // Create or update account
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

  // Delete account
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this account?")) return;

    setIsDeleting(id);
    setError(null);

    try {
      const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete account");
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
    } finally {
      setIsDeleting(undefined);
    }
  };

  // Edit account
  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setShowForm(true);
  };

  // Cancel form
  const handleCancel = () => {
    setShowForm(false);
    setEditingAccount(undefined);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <AppHeader />

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Accounts</h2>
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

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {error}
          </div>
        )}

        {/* Form Modal */}
        {showForm && (
          <div className="mb-8 bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">
              {editingAccount ? "Edit Account" : "Create New Account"}
            </h3>
            <AccountForm
              account={editingAccount}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              isLoading={isSaving}
            />
          </div>
        )}

        {/* Tabs */}
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

        {/* Loading State */}
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
              )}
            </div>
          </div>
        ) : (
          <AccountList
            accounts={accounts}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isDeleting={isDeleting}
          />
        )}
      </main>
    </div>
  );
}
