"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Account, Position } from "@/types/portfolio";
import { PositionForm } from "@/components/PositionForm";
import { PositionList } from "@/components/PositionList";

export default function PositionsPage() {
  const searchParams = useSearchParams();
  const urlAccountId = searchParams.get("accountId");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | undefined>();

  // Fetch accounts
  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch("/api/accounts", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setAccounts(data);
          // Use URL param if provided, otherwise default to first account
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
    }
    fetchAccounts();
  }, [selectedAccountId, urlAccountId]);

  // Fetch positions when account changes
  const fetchPositions = useCallback(async () => {
    if (!selectedAccountId) return;

    try {
      const res = await fetch(`/api/positions?accountId=${selectedAccountId}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setPositions(data);
      }
    } catch (error) {
      console.error("Failed to fetch positions:", error);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

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
        await fetchPositions();
        setShowForm(false);
      }
    } catch (error) {
      console.error("Failed to add position:", error);
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
        await fetchPositions();
        setEditingPosition(undefined);
        setShowForm(false);
      }
    } catch (error) {
      console.error("Failed to update position:", error);
    }
  };

  const handleDeletePosition = async (positionId: string) => {
    if (!confirm("Are you sure you want to delete this position?")) return;

    try {
      const res = await fetch(
        `/api/positions/${positionId}?accountId=${selectedAccountId}`,
        { method: "DELETE" }
      );

      if (res.ok) {
        await fetchPositions();
      }
    } catch (error) {
      console.error("Failed to delete position:", error);
    }
  };

  const handleEdit = (position: Position) => {
    setEditingPosition(position);
    setShowForm(true);
  };

  const handleCancel = () => {
    setEditingPosition(undefined);
    setShowForm(false);
  };

  const selectedAccount = accounts.find((a) => a._id === selectedAccountId);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                    />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-700 bg-clip-text text-transparent">
                  myInvestments
                </h1>
              </Link>
            </div>

            <nav className="hidden md:flex items-center gap-6">
              <Link href="/" className="text-gray-500 hover:text-blue-600">
                Dashboard
              </Link>
              <Link href="/accounts" className="text-gray-500 hover:text-blue-600">
                Accounts
              </Link>
              <Link
                href="/positions"
                className="text-gray-800 font-medium hover:text-blue-600"
              >
                Positions
              </Link>
              <Link href="/find-profits" className="text-gray-500 hover:text-blue-600">
                Find Profits
              </Link>
              <Link href="/watchlist" className="text-gray-500 hover:text-blue-600">
                Watchlist
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Positions</h2>
            <p className="text-gray-600 mt-1">
              Manage your stock and option positions
            </p>
          </div>

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
              Add Position
            </button>
          )}
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
              You need to create an account before adding positions.
            </p>
            <Link
              href="/accounts"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Go to Accounts
            </Link>
          </div>
        ) : (
          <>
            {/* Account Selector */}
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
                      {account.name} - {account.strategy} ({account.riskLevel} risk)
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

            {/* Form or List */}
            {showForm ? (
              <PositionForm
                position={editingPosition}
                accountId={selectedAccountId}
                onSubmit={editingPosition ? handleUpdatePosition : handleAddPosition}
                onCancel={handleCancel}
              />
            ) : (
              <PositionList
                positions={positions}
                onEdit={handleEdit}
                onDelete={handleDeletePosition}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
