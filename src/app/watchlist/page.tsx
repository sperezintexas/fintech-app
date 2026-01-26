"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type {
  Account,
  WatchlistItem,
  WatchlistAlert,
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

export default function WatchlistPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [alerts, setAlerts] = useState<WatchlistAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  // Add item form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
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
  const [formError, setFormError] = useState("");

  // Fetch accounts
  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch("/api/accounts");
        if (res.ok) {
          const data = await res.json();
          setAccounts(data);
          if (data.length > 0) {
            setSelectedAccountId(data[0]._id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch accounts:", err);
      }
    }
    fetchAccounts();
  }, []);

  // Fetch watchlist items
  const fetchWatchlist = useCallback(async () => {
    if (!selectedAccountId) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/watchlist?accountId=${selectedAccountId}`);
      if (res.ok) {
        const data = await res.json();
        setWatchlistItems(data);
      }
    } catch (err) {
      console.error("Failed to fetch watchlist:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    if (!selectedAccountId) return;

    try {
      const res = await fetch(`/api/alerts?accountId=${selectedAccountId}&unacknowledged=true`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data);
      }
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    fetchWatchlist();
    fetchAlerts();
  }, [fetchWatchlist, fetchAlerts]);

  // Run analysis
  const handleRunAnalysis = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/watchlist/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: selectedAccountId }),
      });

      if (res.ok) {
        await fetchWatchlist();
        await fetchAlerts();
      }
    } catch (err) {
      console.error("Failed to run analysis:", err);
    } finally {
      setAnalyzing(false);
    }
  };

  // Add item to watchlist
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId,
          ...formData,
          underlyingSymbol: formData.underlyingSymbol || formData.symbol,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error || "Failed to add item");
        return;
      }

      setShowAddForm(false);
      setFormData({
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
      await fetchWatchlist();
    } catch (err) {
      setFormError("Failed to add item");
      console.error(err);
    }
  };

  // Remove item from watchlist
  const handleRemoveItem = async (id: string) => {
    if (!confirm("Remove this item from watchlist?")) return;

    try {
      await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
      await fetchWatchlist();
      await fetchAlerts();
    } catch (err) {
      console.error("Failed to remove item:", err);
    }
  };

  // Acknowledge alert
  const handleAcknowledgeAlert = async (id: string) => {
    try {
      await fetch(`/api/alerts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledged: true }),
      });
      await fetchAlerts();
    } catch (err) {
      console.error("Failed to acknowledge alert:", err);
    }
  };

  const formatCurrency = (value: number | undefined) => {
    if (value === undefined) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  const formatPercent = (value: number | undefined) => {
    if (value === undefined) return "—";
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-300";
      case "urgent":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "warning":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      default:
        return "bg-blue-100 text-blue-800 border-blue-300";
    }
  };

  const getRecommendationBadge = (rec: string) => {
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
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-700 bg-clip-text text-transparent">
                  myInvestments
                </h1>
              </Link>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/" className="text-gray-500 hover:text-blue-600">Dashboard</Link>
              <Link href="/accounts" className="text-gray-500 hover:text-blue-600">Accounts</Link>
              <Link href="/positions" className="text-gray-500 hover:text-blue-600">Positions</Link>
              <Link href="/find-profits" className="text-gray-500 hover:text-blue-600">Find Profits</Link>
              <Link href="/watchlist" className="text-gray-800 font-medium hover:text-blue-600">Watchlist</Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Watchlist & Alerts</h2>
            <p className="text-gray-600 mt-1">Monitor your positions and receive daily recommendations</p>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {accounts.map((account) => (
                <option key={account._id} value={account._id}>
                  {account.name} ({account.riskLevel})
                </option>
              ))}
            </select>
            <button
              onClick={handleRunAnalysis}
              disabled={analyzing}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {analyzing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Run Analysis
                </>
              )}
            </button>
          </div>
        </div>

        {/* Alerts Section */}
        {alerts.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              Active Alerts ({alerts.length})
            </h3>
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert._id}
                  className={`p-4 rounded-xl border ${getSeverityColor(alert.severity)}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-bold text-lg">{alert.symbol}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRecommendationBadge(alert.recommendation)}`}>
                          {alert.recommendation}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(alert.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm mb-2">{alert.reason}</p>
                      {alert.suggestedActions && alert.suggestedActions.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-gray-600 mb-1">Suggested Actions:</p>
                          <ul className="text-xs space-y-1">
                            {alert.suggestedActions.map((action, idx) => (
                              <li key={idx} className="flex items-start gap-1">
                                <span className="text-gray-400">•</span>
                                {action}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {alert.riskWarning && (
                        <p className="text-xs text-red-700 mt-2 italic">
                          Risk: {alert.riskWarning}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleAcknowledgeAlert(alert._id)}
                      className="ml-4 text-gray-400 hover:text-gray-600"
                      title="Dismiss"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  </div>
                  {/* Alert Details */}
                  <div className="mt-3 pt-3 border-t border-current/20 grid grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-gray-600">Current:</span>
                      <span className="ml-1 font-medium">{formatCurrency(alert.details.currentPrice)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Entry:</span>
                      <span className="ml-1 font-medium">{formatCurrency(alert.details.entryPrice)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Change:</span>
                      <span className={`ml-1 font-medium ${alert.details.priceChangePercent >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {formatPercent(alert.details.priceChangePercent)}
                      </span>
                    </div>
                    {alert.details.daysToExpiration !== undefined && (
                      <div>
                        <span className="text-gray-600">DTE:</span>
                        <span className={`ml-1 font-medium ${alert.details.daysToExpiration <= 7 ? "text-red-700" : ""}`}>
                          {alert.details.daysToExpiration} days
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Watchlist Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              Watchlist Items ({watchlistItems.length})
            </h3>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Position
            </button>
          </div>

          {/* Add Form Modal */}
          {showAddForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold">Add to Watchlist</h4>
                  <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleAddItem} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Symbol *</label>
                      <input
                        type="text"
                        required
                        value={formData.symbol}
                        onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="TSLA"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Underlying</label>
                      <input
                        type="text"
                        value={formData.underlyingSymbol}
                        onChange={(e) => setFormData({ ...formData, underlyingSymbol: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Same as symbol"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                      <select
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value as WatchlistItemType })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        {ITEM_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Strategy *</label>
                      <select
                        value={formData.strategy}
                        onChange={(e) => setFormData({ ...formData, strategy: e.target.value as WatchlistStrategy })}
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
                        min="1"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Entry Price *</label>
                      <input
                        type="number"
                        required
                        step="0.01"
                        min="0"
                        value={formData.entryPrice || ""}
                        onChange={(e) => setFormData({ ...formData, entryPrice: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Option-specific fields */}
                  {formData.type !== "stock" && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Strike Price</label>
                          <input
                            type="number"
                            step="0.5"
                            value={formData.strikePrice || ""}
                            onChange={(e) => setFormData({ ...formData, strikePrice: parseFloat(e.target.value) || undefined })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Expiration</label>
                          <input
                            type="date"
                            value={formData.expirationDate}
                            onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Entry Premium (per share)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.entryPremium || ""}
                          onChange={(e) => setFormData({ ...formData, entryPremium: parseFloat(e.target.value) || undefined })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      rows={2}
                    />
                  </div>

                  {formError && (
                    <p className="text-red-600 text-sm">{formError}</p>
                  )}

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Add to Watchlist
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Watchlist Table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : watchlistItems.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <h4 className="text-lg font-medium text-gray-600 mb-1">No positions in watchlist</h4>
              <p className="text-gray-500 text-sm">Add positions to track and receive daily alerts</p>
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
                    <th className="text-center py-3 px-2 font-medium text-gray-600">Expiration</th>
                    <th className="text-center py-3 px-2 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {watchlistItems.map((item) => {
                    const hasAlert = alerts.some((a) => a.watchlistItemId === item._id);
                    return (
                      <tr key={item._id} className={`border-b border-gray-100 hover:bg-gray-50 ${hasAlert ? "bg-yellow-50" : ""}`}>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            {hasAlert && <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>}
                            <span className="font-medium">{item.symbol}</span>
                          </div>
                        </td>
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
                          (item.profitLossPercent || 0) >= 0 ? "text-green-600" : "text-red-600"
                        }`}>
                          {formatPercent(item.profitLossPercent)}
                        </td>
                        <td className="py-3 px-2 text-center text-gray-600">
                          {item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <button
                            onClick={() => handleRemoveItem(item._id)}
                            className="text-red-500 hover:text-red-700"
                            title="Remove"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Risk Disclosure */}
        <div className="mt-8 p-4 bg-amber-50 rounded-xl border border-amber-200">
          <h4 className="font-medium text-amber-900 mb-2">Risk Disclosure</h4>
          <p className="text-sm text-amber-800">
            Options involve significant risk and are not suitable for all investors. The strategies and recommendations
            provided are for informational purposes only and do not constitute financial advice. Past performance does
            not guarantee future results. Please read the Options Disclosure Document (ODD) before trading options.
            Consider your risk tolerance, investment objectives, and financial situation before making any investment decisions.
          </p>
        </div>
      </main>
    </div>
  );
}
