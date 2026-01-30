"use client";

import { useState, useEffect, useCallback } from "react";
import { AppHeader } from "@/components/AppHeader";
import type {
  Watchlist,
  WatchlistItem,
  WatchlistStrategy,
  WatchlistItemType,
} from "@/types/portfolio";

const STRATEGIES: { value: WatchlistStrategy; label: string }[] = [
  { value: "covered-call", label: "Covered Call" },
  { value: "cash-secured-put", label: "Cash-Secured Put" },
  { value: "wheel", label: "Wheel" },
  { value: "long-stock", label: "Long Stock" },
  { value: "leap-call", label: "LEAP Call" },
  { value: "collar", label: "Collar" },
];

const ITEM_TYPES: { value: WatchlistItemType; label: string }[] = [
  { value: "stock", label: "Stock" },
  { value: "call", label: "Call Option" },
  { value: "put", label: "Put Option" },
  { value: "csp", label: "CSP" },
  { value: "covered-call", label: "Covered Call" },
];

function formatCurrency(value: number | undefined) {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number | undefined) {
  if (value === undefined) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export default function WatchlistPage() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string | null>(null);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | undefined>();
  const [showWatchlistForm, setShowWatchlistForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingWatchlist, setEditingWatchlist] = useState<Watchlist | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  const [watchlistForm, setWatchlistForm] = useState({ name: "", purpose: "" });
  const [itemForm, setItemForm] = useState({
    symbol: "",
    underlyingSymbol: "",
    type: "stock" as WatchlistItemType,
    strategy: "long-stock" as WatchlistStrategy,
    quantity: 100,
    entryPrice: 0,
    strikePrice: undefined as number | undefined,
    expirationDate: "",
    entryPremium: undefined as number | undefined,
    notes: "",
  });

  const fetchWatchlists = useCallback(async () => {
    try {
      const res = await fetch("/api/watchlists");
      if (!res.ok) throw new Error("Failed to fetch watchlists");
      const data = await res.json();
      setWatchlists(data);
      if (data.length > 0 && !selectedWatchlistId) {
        setSelectedWatchlistId(data[0]._id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load watchlists");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchItems = useCallback(async () => {
    if (!selectedWatchlistId) {
      setItems([]);
      return;
    }
    setItemsLoading(true);
    try {
      const res = await fetch(`/api/watchlist?watchlistId=${selectedWatchlistId}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items");
    } finally {
      setItemsLoading(false);
    }
  }, [selectedWatchlistId]);

  useEffect(() => {
    fetchWatchlists();
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleWatchlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    const name = watchlistForm.name.trim();
    if (!name) {
      setFormError("Name is required");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const url = editingWatchlist
        ? `/api/watchlists/${editingWatchlist._id}`
        : "/api/watchlists";
      const method = editingWatchlist ? "PUT" : "POST";
      const body = editingWatchlist
        ? { name, purpose: watchlistForm.purpose.trim() }
        : { name, purpose: watchlistForm.purpose.trim() };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      await fetchWatchlists();
      setShowWatchlistForm(false);
      setEditingWatchlist(undefined);
      setWatchlistForm({ name: "", purpose: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleWatchlistDelete = async (id: string) => {
    if (!confirm("Delete this watchlist? Items will move to Default.")) return;
    setIsDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/watchlists/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }
      if (selectedWatchlistId === id) {
        const remaining = watchlists.filter((w) => w._id !== id);
        setSelectedWatchlistId(remaining[0]?._id ?? null);
      }
      await fetchWatchlists();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setIsDeleting(undefined);
    }
  };

  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!selectedWatchlistId) return;
    if (!itemForm.symbol || !itemForm.quantity || !itemForm.entryPrice) {
      setFormError("Symbol, quantity, and entry price are required");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          watchlistId: selectedWatchlistId,
          symbol: itemForm.symbol,
          underlyingSymbol: itemForm.underlyingSymbol || itemForm.symbol,
          type: itemForm.type,
          strategy: itemForm.strategy,
          quantity: itemForm.quantity,
          entryPrice: itemForm.entryPrice,
          strikePrice: itemForm.strikePrice,
          expirationDate: itemForm.expirationDate || undefined,
          entryPremium: itemForm.entryPremium,
          notes: itemForm.notes,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add item");
      }
      setShowItemForm(false);
      setItemForm({
        symbol: "",
        underlyingSymbol: "",
        type: "stock",
        strategy: "long-stock",
        quantity: 100,
        entryPrice: 0,
        strikePrice: undefined,
        expirationDate: "",
        entryPremium: undefined,
        notes: "",
      });
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setIsSaving(false);
    }
  };

  const handleItemDelete = async (id: string) => {
    if (!confirm("Remove this item from the watchlist?")) return;
    try {
      const res = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    }
  };

  const selectedWatchlist = watchlists.find((w) => w._id === selectedWatchlistId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <AppHeader />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Watchlists</h2>
            <p className="text-gray-600 mt-1">
              Manage portfolio-level watchlists and track positions.
            </p>
          </div>
          {!showWatchlistForm && (
            <button
              onClick={() => {
                setEditingWatchlist(undefined);
                setWatchlistForm({ name: "", purpose: "" });
                setShowWatchlistForm(true);
              }}
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Watchlist
            </button>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {error}
          </div>
        )}

        {/* Watchlist CRUD Form */}
        {showWatchlistForm && (
          <div className="mb-8 bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">
              {editingWatchlist ? "Edit Watchlist" : "New Watchlist"}
            </h3>
            <form onSubmit={handleWatchlistSubmit} className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={watchlistForm.name}
                  onChange={(e) => setWatchlistForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. TSLA Options"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                <textarea
                  value={watchlistForm.purpose}
                  onChange={(e) => setWatchlistForm((f) => ({ ...f, purpose: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="e.g. Covered calls for income"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowWatchlistForm(false);
                    setEditingWatchlist(undefined);
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : editingWatchlist ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="mt-4 text-gray-500">Loading watchlists...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Watchlist sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900">Your Watchlists</h3>
                </div>
                <ul className="divide-y divide-gray-100">
                  {watchlists.map((w) => (
                    <li key={w._id}>
                      <div
                        className={`flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 ${
                          selectedWatchlistId === w._id ? "bg-blue-50 border-l-4 border-blue-600" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedWatchlistId(w._id)}
                          className="flex-1 text-left"
                        >
                          <div className="font-medium text-gray-900">{w.name}</div>
                          {w.purpose && (
                            <div className="text-sm text-gray-500 mt-0.5 truncate">{w.purpose}</div>
                          )}
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingWatchlist(w);
                              setWatchlistForm({ name: w.name, purpose: w.purpose });
                              setShowWatchlistForm(true);
                            }}
                            className="p-1.5 text-gray-400 hover:text-blue-600"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleWatchlistDelete(w._id);
                            }}
                            disabled={isDeleting === w._id || watchlists.length <= 1}
                            className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-50"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Items panel */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                {!selectedWatchlist ? (
                  <div className="text-center py-12 text-gray-500">
                    Select a watchlist or create one to get started.
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{selectedWatchlist.name}</h3>
                        {selectedWatchlist.purpose && (
                          <p className="text-sm text-gray-500 mt-0.5">{selectedWatchlist.purpose}</p>
                        )}
                      </div>
                      <button
                        onClick={() => setShowItemForm(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add Position
                      </button>
                    </div>

                    {/* Add Item Modal */}
                    {showItemForm && (
                      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-lg font-semibold">Add Position</h4>
                            <button onClick={() => setShowItemForm(false)} className="text-gray-400 hover:text-gray-600">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          <form onSubmit={handleItemSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Symbol *</label>
                                <input
                                  type="text"
                                  required
                                  value={itemForm.symbol}
                                  onChange={(e) => setItemForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                  placeholder="TSLA"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Underlying</label>
                                <input
                                  type="text"
                                  value={itemForm.underlyingSymbol}
                                  onChange={(e) => setItemForm((f) => ({ ...f, underlyingSymbol: e.target.value.toUpperCase() }))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                  placeholder="Same as symbol"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                                <select
                                  value={itemForm.type}
                                  onChange={(e) => setItemForm((f) => ({ ...f, type: e.target.value as WatchlistItemType }))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                  {ITEM_TYPES.map((t) => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Strategy *</label>
                                <select
                                  value={itemForm.strategy}
                                  onChange={(e) => setItemForm((f) => ({ ...f, strategy: e.target.value as WatchlistStrategy }))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                  {STRATEGIES.map((s) => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                                <input
                                  type="number"
                                  required
                                  min={1}
                                  value={itemForm.quantity}
                                  onChange={(e) => setItemForm((f) => ({ ...f, quantity: parseInt(e.target.value) || 0 }))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Entry Price *</label>
                                <input
                                  type="number"
                                  required
                                  step={0.01}
                                  min={0}
                                  value={itemForm.entryPrice || ""}
                                  onChange={(e) => setItemForm((f) => ({ ...f, entryPrice: parseFloat(e.target.value) || 0 }))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>
                            {itemForm.type !== "stock" && (
                              <>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Strike Price</label>
                                    <input
                                      type="number"
                                      step={0.5}
                                      value={itemForm.strikePrice ?? ""}
                                      onChange={(e) => setItemForm((f) => ({ ...f, strikePrice: parseFloat(e.target.value) || undefined }))}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Expiration</label>
                                    <input
                                      type="date"
                                      value={itemForm.expirationDate}
                                      onChange={(e) => setItemForm((f) => ({ ...f, expirationDate: e.target.value }))}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Entry Premium</label>
                                  <input
                                    type="number"
                                    step={0.01}
                                    value={itemForm.entryPremium ?? ""}
                                    onChange={(e) => setItemForm((f) => ({ ...f, entryPremium: parseFloat(e.target.value) || undefined }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                              </>
                            )}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                              <textarea
                                value={itemForm.notes}
                                onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                rows={2}
                              />
                            </div>
                            {formError && <p className="text-red-600 text-sm">{formError}</p>}
                            <div className="flex justify-end gap-3">
                              <button type="button" onClick={() => setShowItemForm(false)} className="px-4 py-2 text-gray-600">
                                Cancel
                              </button>
                              <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                Add
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}

                    {itemsLoading ? (
                      <div className="flex justify-center py-12">
                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : items.length === 0 ? (
                      <div className="text-center py-12">
                        <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <h4 className="text-lg font-medium text-gray-600 mb-1">No positions yet</h4>
                        <p className="text-gray-500 text-sm">Add positions to track and receive alerts</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="text-left py-3 px-2 font-medium text-gray-600">Symbol</th>
                              <th className="text-left py-3 px-2 font-medium text-gray-600">Type</th>
                              <th className="text-left py-3 px-2 font-medium text-gray-600">Strategy</th>
                              <th className="text-right py-3 px-2 font-medium text-gray-600">Qty</th>
                              <th className="text-right py-3 px-2 font-medium text-gray-600">Entry</th>
                              <th className="text-right py-3 px-2 font-medium text-gray-600">Current</th>
                              <th className="text-right py-3 px-2 font-medium text-gray-600">P/L</th>
                              <th className="text-center py-3 px-2 font-medium text-gray-600">Exp</th>
                              <th className="text-center py-3 px-2 font-medium text-gray-600">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item) => (
                              <tr key={item._id} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="py-3 px-2 font-medium">{item.symbol}</td>
                                <td className="py-3 px-2">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    item.type === "stock" ? "bg-blue-100 text-blue-700" :
                                    item.type === "call" || item.type === "covered-call" ? "bg-green-100 text-green-700" :
                                    "bg-red-100 text-red-700"
                                  }`}>
                                    {item.type.toUpperCase()}
                                  </span>
                                </td>
                                <td className="py-3 px-2 text-gray-600">{item.strategy}</td>
                                <td className="py-3 px-2 text-right">{item.quantity}</td>
                                <td className="py-3 px-2 text-right">{formatCurrency(item.entryPrice)}</td>
                                <td className="py-3 px-2 text-right">{formatCurrency(item.currentPrice)}</td>
                                <td className={`py-3 px-2 text-right font-medium ${
                                  (item.profitLossPercent ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                                }`}>
                                  {formatPercent(item.profitLossPercent)}
                                </td>
                                <td className="py-3 px-2 text-center text-gray-600">
                                  {item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : "—"}
                                </td>
                                <td className="py-3 px-2 text-center">
                                  <button
                                    onClick={() => handleItemDelete(item._id)}
                                    className="text-red-500 hover:text-red-700"
                                    title="Remove"
                                  >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
