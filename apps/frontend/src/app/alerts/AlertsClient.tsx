"use client";

import { useState, useEffect, useCallback } from "react";
import { AppHeader } from "@/components/AppHeader";
import Link from "next/link";
import type { Account } from "@/types/portfolio";
import type { AlertRecordServer } from "@/lib/data-server";
import { useDisplayTimezone } from "@/hooks/useDisplayTimezone";

function formatCurrency(value: number | undefined): string {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function getSeverityColor(severity: string): string {
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
}

function getRecommendationBadge(rec: string): string {
  switch (rec) {
    case "HOLD":
      return "bg-green-100 text-green-800";
    case "CLOSE":
    case "STC":
    case "BUY_TO_CLOSE":
      return "bg-red-100 text-red-800";
    case "BTC":
      return "bg-yellow-100 text-yellow-800";
    case "ROLL":
    case "SELL_NEW_CALL":
      return "bg-blue-100 text-blue-800";
    case "WATCH":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function getAlertSourceLabel(type?: string): string {
  if (!type) return "Daily Analysis";
  switch (type) {
    case "option-scanner":
      return "Option Scanner";
    case "covered-call":
      return "Covered Call";
    case "protective-put":
      return "Protective Put";
    default:
      return type;
  }
}

function getDeliveryStatusLabel(deliveryStatus?: AlertRecordServer["deliveryStatus"]): string {
  if (!deliveryStatus || Object.keys(deliveryStatus).length === 0) return "—";
  const entries = Object.entries(deliveryStatus);
  const sent = entries.filter(([, v]) => v.status === "sent");
  const failed = entries.filter(([, v]) => v.status === "failed");
  if (failed.length > 0) return `Failed (${failed.length})`;
  if (sent.length > 0) return `Sent (${sent.length})`;
  return "Pending";
}

/** Broker login/home URLs — open in new tab. */
const BROKER_URLS: Record<string, string> = {
  Merrill: "https://www.merrilledge.com",
  Fidelity: "https://www.fidelity.com",
};

const JOB_TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "daily-analysis", label: "Daily Analysis" },
  { value: "option-scanner", label: "Option Scanner" },
  { value: "covered-call", label: "Covered Call" },
  { value: "protective-put", label: "Protective Put" },
];

export type AlertsClientProps = {
  initialAccounts: Account[];
  initialAlerts: AlertRecordServer[];
};

export function AlertsClient({ initialAccounts, initialAlerts }: AlertsClientProps) {
  const { formatDate } = useDisplayTimezone();
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [alerts, setAlerts] = useState<AlertRecordServer[]>(initialAlerts);
  const [loading, setLoading] = useState(false);
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [filterType, setFilterType] = useState<string>("");
  const [filterSymbol, setFilterSymbol] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedAccountId) params.set("accountId", selectedAccountId);
      if (!showAcknowledged) params.set("unacknowledged", "true");
      if (filterType) params.set("type", filterType);
      if (filterSymbol.trim()) params.set("symbol", filterSymbol.trim());
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);
      params.set("limit", "100");
      const res = await fetch(`/api/alerts?${params.toString()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAlerts(data);
      } else {
        setAlerts([]);
      }
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, showAcknowledged, filterType, filterSymbol, filterDateFrom, filterDateTo]);

  useEffect(() => {
    if (initialAccounts.length === 0) {
      fetch("/api/accounts", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : []))
        .then(setAccounts)
        .catch(() => {});
    }
  }, [initialAccounts.length]);

  const isFiltering =
    selectedAccountId !== "" ||
    showAcknowledged ||
    filterType !== "" ||
    filterSymbol.trim() !== "" ||
    filterDateFrom !== "" ||
    filterDateTo !== "";

  useEffect(() => {
    if (isFiltering) fetchAlerts();
  }, [isFiltering, selectedAccountId, showAcknowledged, filterType, filterSymbol, filterDateFrom, filterDateTo, fetchAlerts]);

  const handleAcknowledge = async (id: string) => {
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

  const activeAlerts = alerts.filter((a) => !a.acknowledged);
  const acknowledgedAlerts = alerts.filter((a) => a.acknowledged);

  const handleExportCsv = () => {
    const headers = ["Date", "Type", "Symbol", "Recommendation", "Reason", "Delivery"];
    const rows = alerts.map((a) => [
      formatDate(a.createdAt),
      getAlertSourceLabel(a.type),
      a.symbol,
      a.recommendation,
      a.reason.replace(/"/g, '""'),
      getDeliveryStatusLabel(a.deliveryStatus),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alerts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearAll = useCallback(async () => {
    const accountName =
      selectedAccountId && selectedAccountId !== ""
        ? accounts.find((a) => a._id === selectedAccountId)?.name || selectedAccountId
        : "all";
    if (!confirm(`Clear all alerts for ${accountName}? This action cannot be undone.`)) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedAccountId && selectedAccountId !== "") params.set("accountId", selectedAccountId);
      const res = await fetch(`/api/alerts?${params.toString()}`, { method: "DELETE" });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to clear alerts");
      }
      await fetchAlerts();
    } catch (err) {
      console.error("Failed to clear alerts:", err);
      alert("Failed to clear alerts. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, accounts, fetchAlerts]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Alerts</h2>
            <p className="text-gray-600 mt-1">
              View alerts from daily analysis, Option Scanner, Covered Call, and Protective Put scanners
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-label="Filter by account"
            >
              <option value="">All accounts</option>
              {accounts.map((acc) => (
                <option key={acc._id} value={acc._id}>
                  {acc.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showAcknowledged}
                onChange={(e) => setShowAcknowledged(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Show acknowledged
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {JOB_TYPE_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Symbol"
              value={filterSymbol}
              onChange={(e) => setFilterSymbol(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-24 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={handleExportCsv}
              disabled={alerts.length === 0}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Export CSV
            </button>
            <button
              onClick={handleClearAll}
              disabled={loading || alerts.length === 0}
              className="px-3 py-2 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed ml-2"
            >
              Clear All ({alerts.length})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="mt-2 text-gray-500">Loading alerts...</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
            <svg
              className="w-12 h-12 text-gray-400 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Alerts</h3>
            <p className="text-gray-500 mb-4">
              {showAcknowledged
                ? "No alerts found. Run daily analysis or Option Scanner to generate alerts."
                : "No active alerts. Acknowledged alerts are hidden."}
            </p>
            <Link
              href="/automation"
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Go to Setup → Alerts
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {activeAlerts.length > 0 && (
              <section>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  Active Alerts ({activeAlerts.length})
                </h3>
                <div className="space-y-3">
                  {activeAlerts.map((alert) => (
                    <AlertCard
                      key={alert._id}
                      alert={alert}
                      accounts={accounts}
                      onAcknowledge={handleAcknowledge}
                      formatCurrency={formatCurrency}
                      formatPercent={formatPercent}
                      getSeverityColor={getSeverityColor}
                      getRecommendationBadge={getRecommendationBadge}
                      getAlertSourceLabel={getAlertSourceLabel}
                      getDeliveryStatusLabel={getDeliveryStatusLabel}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              </section>
            )}
            {showAcknowledged && acknowledgedAlerts.length > 0 && (
              <section>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Acknowledged ({acknowledgedAlerts.length})</h3>
                <div className="space-y-3">
                  {acknowledgedAlerts.map((alert) => (
                    <AlertCard
                      key={alert._id}
                      alert={alert}
                      accounts={accounts}
                      onAcknowledge={handleAcknowledge}
                      formatCurrency={formatCurrency}
                      formatPercent={formatPercent}
                      getSeverityColor={getSeverityColor}
                      getRecommendationBadge={getRecommendationBadge}
                      getAlertSourceLabel={getAlertSourceLabel}
                      getDeliveryStatusLabel={getDeliveryStatusLabel}
                      formatDate={formatDate}
                      isAcknowledged
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

type AlertCardProps = {
  alert: AlertRecordServer;
  accounts: Account[];
  onAcknowledge: (id: string) => void;
  formatCurrency: (v?: number) => string;
  formatPercent: (v?: number) => string;
  getSeverityColor: (s: string) => string;
  getRecommendationBadge: (r: string) => string;
  getAlertSourceLabel: (t?: string) => string;
  getDeliveryStatusLabel: (d?: AlertRecordServer["deliveryStatus"]) => string;
  formatDate: (date: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions) => string;
  isAcknowledged?: boolean;
};

function AlertCard({
  alert,
  accounts,
  onAcknowledge,
  formatCurrency,
  formatPercent,
  getSeverityColor,
  getRecommendationBadge,
  getAlertSourceLabel,
  getDeliveryStatusLabel,
  formatDate,
  isAcknowledged = false,
}: AlertCardProps) {
  const severity = alert.severity ?? "info";
  const hasDetails = alert.details && typeof alert.details === "object";
  const hasMetrics = alert.metrics && typeof alert.metrics === "object";
  const account = alert.accountId ? accounts.find((a) => a._id === alert.accountId) : undefined;
  const accountLabel = alert.accountName ?? account?.name ?? alert.accountId;
  const brokerUrl = account?.brokerType ? BROKER_URLS[account.brokerType] : undefined;

  return (
    <div
      className={`p-4 rounded-xl border ${getSeverityColor(severity)} ${isAcknowledged ? "opacity-75" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="font-bold text-lg">{alert.symbol}</span>
            {accountLabel && (
              brokerUrl ? (
                <a
                  href={brokerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800 hover:bg-sky-200 transition-colors"
                >
                  {accountLabel}
                </a>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800">
                  {accountLabel}
                </span>
              )
            )}
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRecommendationBadge(alert.recommendation)}`}
            >
              {alert.recommendation}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
              {getAlertSourceLabel(alert.type)}
            </span>
            {alert.type === "option-scanner" && alert.metrics?.dte != null && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                DTE: {alert.metrics.dte} days
              </span>
            )}
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
              {getDeliveryStatusLabel(alert.deliveryStatus)}
            </span>
            <span className="text-xs text-gray-500">
              {formatDate(alert.createdAt)}
            </span>
          </div>
          <p className="text-sm mb-2 whitespace-pre-line">{alert.reason}</p>
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
            <p className="text-xs text-red-700 mt-2 italic">Risk: {alert.riskWarning}</p>
          )}
        </div>
        {!isAcknowledged && (
          <button
            onClick={() => onAcknowledge(alert._id)}
            className="ml-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-white/50 rounded-lg"
            title="Acknowledge"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        )}
      </div>
      {(hasDetails || hasMetrics) && (
        <div className="mt-3 pt-3 border-t border-current/20 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          {hasDetails && alert.details && (
            <>
              {alert.details.currentPrice != null && (
                <div>
                  <span className="text-gray-600">Current:</span>
                  <span className="ml-1 font-medium">{formatCurrency(alert.details.currentPrice)}</span>
                </div>
              )}
              {alert.details.entryPrice != null && (
                <div>
                  <span className="text-gray-600">Entry:</span>
                  <span className="ml-1 font-medium">{formatCurrency(alert.details.entryPrice)}</span>
                </div>
              )}
              {alert.details.priceChangePercent != null && (
                <div>
                  <span className="text-gray-600">Change:</span>
                  <span
                    className={`ml-1 font-medium ${
                      alert.details.priceChangePercent >= 0 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {formatPercent(alert.details.priceChangePercent)}
                  </span>
                </div>
              )}
              {alert.details.daysToExpiration != null && (
                <div>
                  <span className="text-gray-600">DTE:</span>
                  <span
                    className={`ml-1 font-medium ${
                      alert.details.daysToExpiration <= 7 ? "text-red-700" : ""
                    }`}
                  >
                    {alert.details.daysToExpiration} days
                  </span>
                </div>
              )}
            </>
          )}
          {hasMetrics && alert.metrics && (
            <>
              {alert.metrics.stockPrice != null && (
                <div>
                  <span className="text-gray-600">Stock:</span>
                  <span className="ml-1 font-medium">{formatCurrency(alert.metrics.stockPrice)}</span>
                </div>
              )}
              {alert.metrics.dte != null && (
                <div>
                  <span className="text-gray-600">DTE:</span>
                  <span className="ml-1 font-medium">{alert.metrics.dte} days</span>
                </div>
              )}
              {alert.metrics.plPercent != null && (
                <div>
                  <span className="text-gray-600">P/L:</span>
                  <span
                    className={`ml-1 font-medium ${
                      alert.metrics.plPercent >= 0 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {formatPercent(alert.metrics.plPercent)}
                  </span>
                </div>
              )}
              {alert.metrics.callBid != null && alert.metrics.callAsk != null && (
                <div>
                  <span className="text-gray-600">Call:</span>
                  <span className="ml-1 font-medium">
                    {formatCurrency(alert.metrics.callBid)}–{formatCurrency(alert.metrics.callAsk)}
                  </span>
                </div>
              )}
              {alert.metrics.unitCost != null && (
                <div>
                  <span className="text-gray-600">Unit cost:</span>
                  <span className="ml-1 font-medium">{formatCurrency(alert.metrics.unitCost)}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
