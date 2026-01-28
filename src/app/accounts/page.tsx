"use client";

import { useState, useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AccountList } from "@/components/AccountList";
import { AccountForm } from "@/components/AccountForm";
import type { Account, RiskLevel, Strategy } from "@/types/portfolio";

type FormData = {
  name: string;
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
          {!showForm && (
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

        {/* Loading State */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="mt-4 text-gray-500">Loading accounts...</p>
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
