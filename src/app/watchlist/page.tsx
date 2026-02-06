"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { AppHeader } from "@/components/AppHeader";
import type {
  Watchlist,
  WatchlistItem,
  WatchlistStrategy,
  WatchlistItemType,
} from "@/types/portfolio";
import { getThemeDescription } from "@/lib/watchlist-theme-descriptions";

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

function getTypeLabel(type: WatchlistItemType): string {
  return ITEM_TYPES.find((t) => t.value === type)?.label ?? type;
}

function getStrategyLabel(strategy: WatchlistStrategy): string {
  return STRATEGIES.find((s) => s.value === strategy)?.label ?? strategy;
}

export default function WatchlistPage() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string | null>(null);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | undefined>();
  const [removeHeldLoading, setRemoveHeldLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showWatchlistForm, setShowWatchlistForm] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
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

  const handleRemoveHeld = async () => {
    if (!confirm("Remove all watchlist items that are already in your account holdings?")) return;
    setRemoveHeldLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist/remove-held", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove items");
      await fetchItems();
      if (data.removed > 0) {
        setError(null);
        alert(data.message ?? `Removed ${data.removed} item(s) already in your holdings.`);
      } else {
        alert(data.message ?? "No watchlist items match your holdings.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove items");
    } finally {
      setRemoveHeldLoading(false);
    }
  };

  const handleItemDelete = async (id: string) => {
    if (!confirm("Remove this item from the watchlist?")) return;
    setIsDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setIsDeleting(undefined);
    }
  };

  const selectedWatchlist = watchlists.find((w) => w._id === selectedWatchlistId);

  const handleExportWatchlist = useCallback(() => {
    if (!selectedWatchlist || items.length === 0) return;
    const headers = [
      "Symbol",
      "Underlying",
      "Type",
      "Strategy",
      "Quantity",
      "Entry Price",
      "Current Price",
      "P/L %",
      "Strike",
      "Expiration",
      "Entry Premium",
      "Notes",
    ];
    const rows = items.map((item) => [
      item.symbol,
      item.underlyingSymbol,
      getTypeLabel(item.type),
      getStrategyLabel(item.strategy),
      item.quantity,
      item.entryPrice,
      item.currentPrice ?? "",
      item.profitLossPercent != null ? `${item.profitLossPercent.toFixed(2)}%` : "",
      item.strikePrice ?? "",
      item.expirationDate ?? "",
      item.entryPremium ?? "",
      (item.notes ?? "").replace(/"/g, '""'),
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.map((c) => `"${String(c)}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedWatchlist.name.replace(/[^a-zA-Z0-9-_]/g, "_")}_watchlist.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selectedWatchlist, items]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <AppHeader />

      <main className="flex min-h-[calc(100vh-4rem)]">
        {/* Collapsible nav sidebar */}
        <nav
          className={`flex flex-col bg-white border-r border-gray-200 shadow-sm transition-all duration-200 ${
            sidebarCollapsed ? "w-14" : "w-64"
          }`}
        >
          <div className="flex items-center justify-between p-3 border-b border-gray-100 min-h-[52px]">
            {!sidebarCollapsed && <span className="font-semibold text-gray-900 text-sm">Watchlists</span>}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              title={sidebarCollapsed ? "Expand" : "Collapse"}
            >
              <svg
                className={`w-5 h-5 transition-transform ${sidebarCollapsed ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
          {!sidebarCollapsed && (
            <>
              <div className="p-2 border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setEditingWatchlist(undefined);
                    setWatchlistForm({ name: "", purpose: "" });
                    setShowWatchlistForm(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New
                </button>
              </div>
              {showWatchlistForm && (
                <div className="p-3 border-b border-gray-100 bg-gray-50">
                  <form onSubmit={handleWatchlistSubmit} className="space-y-2">
                    <input
                      type="text"
                      required
                      value={watchlistForm.name}
                      onChange={(e) => setWatchlistForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      placeholder="Name"
                    />
                    <input
                      type="text"
                      value={watchlistForm.purpose}
                      onChange={(e) => setWatchlistForm((f) => ({ ...f, purpose: e.target.value }))}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      placeholder="Purpose (optional)"
                    />
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowWatchlistForm(false);
                          setEditingWatchlist(undefined);
                        }}
                        className="flex-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isSaving ? "..." : editingWatchlist ? "Update" : "Add"}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ul className="flex-1 overflow-y-auto py-2">
              {watchlists.map((w) => (
                <li key={w._id}>
                  <div
                    className={`group flex items-center gap-2 px-3 py-2 mx-2 rounded-lg cursor-pointer hover:bg-gray-50 ${
                      selectedWatchlistId === w._id ? "bg-blue-50 text-blue-700" : ""
                    } ${sidebarCollapsed ? "justify-center" : ""}`}
                  >
                    <button
                      type="button"
                      data-testid="watchlist-item"
                      onClick={() => setSelectedWatchlistId(w._id)}
                      className={`flex-1 text-left min-w-0 ${sidebarCollapsed ? "flex-none" : ""}`}
                    >
                      {sidebarCollapsed ? (
                        <span className="text-lg font-bold text-gray-700" title={w.name}>
                          {w.name.charAt(0)}
                        </span>
                      ) : (
                        <>
                          <div className="font-medium text-sm truncate">{w.name}</div>
                          {w.purpose && (
                            <div className="text-xs text-gray-500 truncate">{w.purpose}</div>
                          )}
                        </>
                      )}
                    </button>
                    {!sidebarCollapsed && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingWatchlist(w);
                            setWatchlistForm({ name: w.name, purpose: w.purpose });
                            setShowWatchlistForm(true);
                          }}
                          className="p-1 text-gray-400 hover:text-blue-600 rounded"
                          title="Edit"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                          className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50 rounded"
                          title="Delete"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </nav>

        {/* Content area */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5">
            {!selectedWatchlist ? (
                  <div className="text-center py-12 text-gray-500">
                    Select a watchlist or create one to get started.
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">{selectedWatchlist.name}</h3>
                        {selectedWatchlist.purpose && (
                          <p className="text-xs text-gray-500 mt-0.5">{selectedWatchlist.purpose}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          data-testid="watchlist-remove-held-btn"
                          onClick={handleRemoveHeld}
                          disabled={removeHeldLoading}
                          className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                          title="Remove watchlist items that are already in your account holdings"
                        >
                          {removeHeldLoading ? "…" : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Remove in holdings
                            </>
                          )}
                        </button>
                        <button
                          data-testid="watchlist-export-btn"
                          onClick={handleExportWatchlist}
                          disabled={items.length === 0}
                          className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                          title="Export to CSV"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Export
                        </button>
                        <button
                          data-testid="watchlist-delete-btn"
                          onClick={() => handleWatchlistDelete(selectedWatchlist._id)}
                          disabled={watchlists.length <= 1 || isDeleting === selectedWatchlist._id}
                          className="px-3 py-1.5 text-sm text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                          title="Delete watchlist"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </button>
                        <button
                          onClick={() => setShowItemForm(true)}
                          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                          Add
                        </button>
                      </div>
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
                      <div className="flex justify-center py-8">
                        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : items.length === 0 ? (
                      <div className="text-center py-8">
                        <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <h4 className="text-sm font-medium text-gray-600 mb-0.5">No positions yet</h4>
                        <p className="text-gray-500 text-xs">Add positions to track and receive alerts</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="text-left py-2 px-1.5 font-medium text-gray-600 w-[1%]">Symbol</th>
                              <th className="text-left py-2 px-1.5 font-medium text-gray-600">Type · Strategy</th>
                              <th className="text-right py-2 px-1.5 font-medium text-gray-600">Entry target</th>
                              <th className="text-right py-2 px-1.5 font-medium text-gray-600">Current</th>
                              <th className="text-right py-2 px-1.5 font-medium text-gray-600">P/L</th>
                              <th className="text-center py-2 px-1.5 font-medium text-gray-600">Exp</th>
                              <th className="text-center py-2 px-1.5 font-medium text-gray-600 w-10"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item) => {
                              const themeSymbol = item.type !== "stock" ? item.underlyingSymbol : item.symbol;
                              const theme = getThemeDescription(themeSymbol);
                              return (
                              <Fragment key={item._id}>
                                <tr
                                  key={item._id}
                                  onClick={() => setSelectedItemId((id) => (id === item._id ? null : item._id))}
                                  className={`border-b border-gray-100 cursor-pointer transition-colors ${
                                    selectedItemId === item._id ? "bg-indigo-50" : "hover:bg-gray-50"
                                  }`}
                                >
                                  <td className="py-2 px-1.5 align-top w-[1%]">
                                    <div className="flex flex-col gap-0.5 min-w-0 max-w-[100px] sm:max-w-[160px]">
                                      <span className="font-medium truncate" title={item.symbol}>{item.symbol}</span>
                                      {item.companyDescription && (
                                        <span className="text-xs text-gray-500 leading-tight truncate" title={item.companyDescription}>
                                          {item.companyDescription}
                                        </span>
                                      )}
                                      {theme && (
                                        <span className="text-xs text-blue-600 leading-tight truncate" title={theme}>
                                          {theme}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 px-1.5 text-gray-600">
                                    {getTypeLabel(item.type)} · {getStrategyLabel(item.strategy)}
                                  </td>
                                  <td className="py-2 px-1.5 text-right">
                                    {formatCurrency(item.type === "stock" ? item.quantity * item.entryPrice : item.quantity * 100 * item.entryPrice)}
                                  </td>
                                  <td className="py-2 px-1.5 text-right">{formatCurrency(item.currentPrice)}</td>
                                  <td className={`py-2 px-1.5 text-right font-medium ${
                                    (item.profitLossPercent ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                                  }`}>
                                    {formatPercent(item.profitLossPercent)}
                                  </td>
                                  <td className="py-2 px-1.5 text-center text-gray-600">
                                    {item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : "—"}
                                  </td>
                                  <td className="py-2 px-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      onClick={() => handleItemDelete(item._id)}
                                      disabled={isDeleting === item._id}
                                      className="text-red-500 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                      title="Remove"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </td>
                                </tr>
                                {selectedItemId === item._id && (
                                  <tr className="border-b border-gray-100 bg-indigo-50/50">
                                    <td colSpan={8} className="py-1.5 px-1.5">
                                      <p className="text-xs text-gray-600 whitespace-pre-wrap pl-1">
                                        {item.notes || "—"}
                                      </p>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
        </div>
      </main>
    </div>
  );
}
