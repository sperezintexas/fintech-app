"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type {
  Account,
  WatchlistItem,
  WatchlistAlert,
  WatchlistStrategy,
  WatchlistItemType,
  AlertDeliveryChannel,
  AlertTemplateId,
  AlertFrequency,
  AlertSeverity,
  ScheduledAlert,
} from "@/types/portfolio";
import { ALERT_TEMPLATES, ALERT_CHANNEL_COSTS } from "@/types/portfolio";
import {
  requestPushPermission,
  registerPushSubscription,
  showDirectNotification,
} from "@/lib/push-client";

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
  const [scheduledAlerts, setScheduledAlerts] = useState<ScheduledAlert[]>([]);
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

  // Alert preferences state
  const [activeTab, setActiveTab] = useState<"watchlist" | "alerts" | "settings">("watchlist");
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsMessage, setPrefsMessage] = useState("");

  // Scheduler state
  type ScheduledJob = {
    id: string;
    name: string;
    lastRunAt: string | null;
    nextRunAt: string | null;
    lastFinishedAt: string | null;
    failCount: number;
  };
  const [schedulerStatus, setSchedulerStatus] = useState<{
    status: string;
    jobs: ScheduledJob[];
  } | null>(null);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [schedulerMessage, setSchedulerMessage] = useState("");

  // Alert preview state
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    alert: WatchlistAlert;
    formatted: {
      subject: string;
      body: string;
      sms: string;
      slack: string;
    };
    template: { id: string; name: string };
    analysis: {
      recommendation: string;
      severity: string;
      reason: string;
      confidence: number;
    };
  } | null>(null);
  const [previewTemplateId, setPreviewTemplateId] = useState<AlertTemplateId>("concise");

  // Schedule alert state
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleChannels, setScheduleChannels] = useState<AlertDeliveryChannel[]>([]);
  const [scheduleType, setScheduleType] = useState<"immediate" | "daily" | "weekly" | "once" | "recurring">("immediate");
  const [scheduleTime, setScheduleTime] = useState("16:00");
  const [scheduleDay, setScheduleDay] = useState(1); // Monday
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleCron, setScheduleCron] = useState("0 16 * * 1-5");
  const [scheduling, setScheduling] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | null>(null);
  const [enablingPush, setEnablingPush] = useState(false);

  // Check push notification permission on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushPermission(Notification.permission);
      setPushEnabled(Notification.permission === "granted");
    }
  }, []);

  // Enable push notifications
  const handleEnablePush = async () => {
    setEnablingPush(true);
    try {
      const result = await requestPushPermission();

      if (result.success && result.subscription) {
        // Register with server
        await registerPushSubscription(result.subscription, selectedAccountId);
        setPushEnabled(true);
        setPushPermission("granted");
      } else if (result.error?.includes("VAPID")) {
        // VAPID not configured, use direct notifications
        setPushEnabled(true);
        setPushPermission("granted");
      } else {
        alert(result.error || "Failed to enable push notifications");
      }
    } catch (err) {
      console.error("Failed to enable push:", err);
      alert("Failed to enable push notifications");
    } finally {
      setEnablingPush(false);
    }
  };

  // Alert preferences form
  const [prefsForm, setPrefsForm] = useState({
    templateId: "concise" as AlertTemplateId,
    frequency: "daily" as AlertFrequency,
    severityFilter: ["warning", "urgent", "critical"] as AlertSeverity[],
    profitThreshold: 50,
    lossThreshold: 20,
    dteWarning: 7,
    quietHoursStart: "",
    quietHoursEnd: "",
    channels: {
      email: { enabled: false, target: "" },
      sms: { enabled: false, target: "" },
      slack: { enabled: false, target: "" },
      push: { enabled: false, target: "" },
    },
  });

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

  // Fetch scheduled alerts
  const fetchScheduledAlerts = useCallback(async () => {
    if (!selectedAccountId) return;

    try {
      const res = await fetch(`/api/alerts/schedule?accountId=${selectedAccountId}&status=pending`);
      if (res.ok) {
        const data = await res.json();
        setScheduledAlerts(data);
      }
    } catch (err) {
      console.error("Failed to fetch scheduled alerts:", err);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    fetchWatchlist();
    fetchAlerts();
    if (activeTab === "alerts") {
      fetchScheduledAlerts();
    }
  }, [fetchWatchlist, fetchAlerts, fetchScheduledAlerts, activeTab]);

  // Run analysis - Generate SmartXAI report
  const handleRunAnalysis = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/reports/smartxai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: selectedAccountId }),
      });

      if (res.ok) {
        const data = await res.json();
        // Navigate to the report page
        window.location.href = `/reports/${data.report._id}`;
      } else {
        const error = await res.json();
        alert(error.error || "Failed to generate report");
      }
    } catch (err) {
      console.error("Failed to run analysis:", err);
      alert("Failed to generate SmartXAI report");
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

  // Fetch alert preferences
  const fetchAlertPrefs = useCallback(async () => {
    if (!selectedAccountId) return;

    setPrefsLoading(true);
    try {
      const res = await fetch(`/api/alert-preferences?accountId=${selectedAccountId}`);
      if (res.ok) {
        const data = await res.json();

        // Update form with fetched data
        setPrefsForm({
          templateId: data.templateId || "concise",
          frequency: data.frequency || "daily",
          severityFilter: data.severityFilter || ["warning", "urgent", "critical"],
          profitThreshold: data.thresholds?.profitThreshold || 50,
          lossThreshold: data.thresholds?.lossThreshold || 20,
          dteWarning: data.thresholds?.dteWarning || 7,
          quietHoursStart: data.quietHoursStart || "",
          quietHoursEnd: data.quietHoursEnd || "",
          channels: {
            email: data.channels?.find((c: { channel: string }) => c.channel === "email") || { enabled: false, target: "" },
            sms: data.channels?.find((c: { channel: string }) => c.channel === "sms") || { enabled: false, target: "" },
            slack: data.channels?.find((c: { channel: string }) => c.channel === "slack") || { enabled: false, target: "" },
            push: data.channels?.find((c: { channel: string }) => c.channel === "push") || { enabled: false, target: "" },
          },
        });
      }
    } catch (err) {
      console.error("Failed to fetch alert preferences:", err);
    } finally {
      setPrefsLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    if (activeTab === "settings") {
      fetchAlertPrefs();
    }
  }, [activeTab, fetchAlertPrefs]);

  // Save alert preferences
  const handleSavePrefs = async () => {
    setPrefsSaving(true);
    setPrefsMessage("");

    try {
      const channels = Object.entries(prefsForm.channels)
        .filter(([, config]) => config.enabled || config.target)
        .map(([channel, config]) => ({
          channel: channel as AlertDeliveryChannel,
          enabled: config.enabled,
          target: config.target,
          estimatedCost: ALERT_CHANNEL_COSTS[channel as AlertDeliveryChannel]?.perMessage || 0,
        }));

      const res = await fetch("/api/alert-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId,
          channels,
          templateId: prefsForm.templateId,
          frequency: prefsForm.frequency,
          severityFilter: prefsForm.severityFilter,
          quietHoursStart: prefsForm.quietHoursStart || undefined,
          quietHoursEnd: prefsForm.quietHoursEnd || undefined,
          thresholds: {
            profitThreshold: prefsForm.profitThreshold,
            lossThreshold: prefsForm.lossThreshold,
            dteWarning: prefsForm.dteWarning,
          },
        }),
      });

      if (res.ok) {
        setPrefsMessage("Alert preferences saved!");
        setTimeout(() => setPrefsMessage(""), 3000);
      } else {
        const data = await res.json();
        setPrefsMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setPrefsMessage("Failed to save preferences");
      console.error(err);
    } finally {
      setPrefsSaving(false);
    }
  };

  // Calculate estimated monthly cost
  const estimatedMonthlyCost = () => {
    const enabledChannels = Object.entries(prefsForm.channels).filter(([, c]) => c.enabled);
    const alertsPerMonth = prefsForm.frequency === "daily" ? 30 : prefsForm.frequency === "weekly" ? 4 : 60;

    let totalCents = 0;
    enabledChannels.forEach(([channel]) => {
      totalCents += (ALERT_CHANNEL_COSTS[channel as AlertDeliveryChannel]?.perMessage || 0) * alertsPerMonth;
    });

    return totalCents / 100;
  };

  // Fetch scheduler status
  const fetchSchedulerStatus = useCallback(async () => {
    setSchedulerLoading(true);
    try {
      const res = await fetch("/api/scheduler");
      if (res.ok) {
        const data = await res.json();
        setSchedulerStatus(data);
      }
    } catch (err) {
      console.error("Failed to fetch scheduler status:", err);
    } finally {
      setSchedulerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "settings") {
      fetchSchedulerStatus();
    }
  }, [activeTab, fetchSchedulerStatus]);

  // Scheduler actions
  const handleSchedulerAction = async (action: string, jobName?: string) => {
    setSchedulerLoading(true);
    setSchedulerMessage("");

    try {
      const res = await fetch("/api/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, jobName }),
      });

      const data = await res.json();

      if (res.ok) {
        setSchedulerMessage(data.message || "Action completed");
        await fetchSchedulerStatus();
        setTimeout(() => setSchedulerMessage(""), 3000);
      } else {
        setSchedulerMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setSchedulerMessage("Action failed");
      console.error(err);
    } finally {
      setSchedulerLoading(false);
    }
  };

  // Fetch alert preview
  const handlePreviewAlert = async (itemId: string, templateId?: AlertTemplateId) => {
    setPreviewLoading(true);
    setPreviewItemId(itemId);
    setPreviewTemplateId(templateId || previewTemplateId);

    try {
      const res = await fetch("/api/watchlist/preview-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          watchlistItemId: itemId,
          templateId: templateId || previewTemplateId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPreviewData(data);
      } else {
        const error = await res.json();
        console.error("Failed to generate preview:", error);
      }
    } catch (err) {
      console.error("Failed to generate preview:", err);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Schedule alert
  const handleScheduleAlert = async () => {
    if (!previewData || !previewItemId || scheduleChannels.length === 0) {
      setScheduleMessage("Please select at least one delivery channel");
      return;
    }

    // Check if push is selected but not enabled
    if (scheduleChannels.includes("push") && pushPermission !== "granted") {
      setScheduleMessage("Please enable push notifications first in Alert Settings");
      return;
    }

    setScheduling(true);
    setScheduleMessage("");

    try {
      // Build schedule object
      let schedule: {
        type: string;
        time?: string;
        dayOfWeek?: number;
        datetime?: string;
        cron?: string;
      };

      switch (scheduleType) {
        case "immediate":
          schedule = { type: "immediate" };
          break;
        case "daily":
          schedule = { type: "daily", time: scheduleTime };
          break;
        case "weekly":
          schedule = { type: "weekly", dayOfWeek: scheduleDay, time: scheduleTime };
          break;
        case "once":
          if (!scheduleDate) {
            setScheduleMessage("Please select a date");
            setScheduling(false);
            return;
          }
          schedule = { type: "once", datetime: new Date(`${scheduleDate}T${scheduleTime}`).toISOString() };
          break;
        case "recurring":
          schedule = { type: "recurring", cron: scheduleCron };
          break;
        default:
          setScheduleMessage("Invalid schedule type");
          setScheduling(false);
          return;
      }

      const res = await fetch("/api/alerts/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          watchlistItemId: previewItemId,
          alert: previewData.alert,
          channels: scheduleChannels,
          templateId: previewTemplateId,
          schedule,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setScheduleMessage("Alert scheduled successfully!");

        // If immediate schedule and push enabled, show notification now
        if (scheduleType === "immediate" && scheduleChannels.includes("push") && pushEnabled && previewData) {
          showDirectNotification(
            previewData.formatted.subject,
            previewData.formatted.sms,
            {
              symbol: previewData.alert.symbol,
              recommendation: previewData.alert.recommendation,
              url: "/watchlist",
            }
          );
        }

        setShowScheduleForm(false);
        setTimeout(() => {
          setScheduleMessage("");
          setPreviewItemId(null);
          setPreviewData(null);
        }, 2000);
      } else {
        setScheduleMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setScheduleMessage("Failed to schedule alert");
      console.error(err);
    } finally {
      setScheduling(false);
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
            {activeTab === "watchlist" && (
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
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-4">
            <button
              onClick={() => setActiveTab("watchlist")}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === "watchlist"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Watchlist
            </button>
            <button
              onClick={() => setActiveTab("alerts")}
              className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === "alerts"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Alerts
              {alerts.length > 0 && (
                <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">
                  {alerts.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === "settings"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Alert Settings
            </button>
          </nav>
        </div>

        {/* Alerts Section (shown on both watchlist and alerts tabs) */}
        {activeTab === "alerts" && alerts.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Alerts</h3>
            <p className="text-gray-500">Run analysis to generate alerts for your watchlist positions</p>
          </div>
        )}

        {(activeTab === "watchlist" || activeTab === "alerts") && alerts.length > 0 && (
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

        {/* Scheduled Alerts Section */}
        {activeTab === "alerts" && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Scheduled Alerts ({scheduledAlerts.length})
            </h3>
            {scheduledAlerts.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-2xl border border-gray-100">
                <p className="text-gray-500">No scheduled alerts. Preview an alert and schedule it to send.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {scheduledAlerts.map((scheduled: ScheduledAlert) => {
                  const scheduleDesc =
                    scheduled.schedule.type === "immediate" ? "Immediate" :
                    scheduled.schedule.type === "daily" ? `Daily at ${scheduled.schedule.time}` :
                    scheduled.schedule.type === "weekly" ? `Weekly on ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][scheduled.schedule.dayOfWeek || 0]} at ${scheduled.schedule.time}` :
                    scheduled.schedule.type === "once" ? `Once on ${new Date(scheduled.schedule.datetime || "").toLocaleString()}` :
                    `Recurring: ${scheduled.schedule.cron}`;

                  return (
                    <div
                      key={scheduled._id}
                      className="p-4 rounded-xl border border-indigo-200 bg-indigo-50"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-bold text-lg">{scheduled.alert.symbol}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRecommendationBadge(scheduled.alert.recommendation)}`}>
                              {scheduled.alert.recommendation}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                              {scheduled.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mb-2">{scheduled.alert.reason}</p>
                          <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                            <div>
                              <span className="font-medium">Schedule:</span> {scheduleDesc}
                            </div>
                            <div>
                              <span className="font-medium">Channels:</span> {scheduled.channels.join(", ")}
                            </div>
                            <div>
                              <span className="font-medium">Template:</span> {scheduled.templateId}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            if (confirm("Cancel this scheduled alert?")) {
                              try {
                                await fetch(`/api/alerts/schedule/${scheduled._id}`, { method: "DELETE" });
                                await fetchScheduledAlerts();
                              } catch (err) {
                                console.error("Failed to cancel:", err);
                              }
                            }
                          }}
                          className="text-red-500 hover:text-red-700 ml-4"
                          title="Cancel"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Watchlist Section */}
        {activeTab === "watchlist" && (
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
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handlePreviewAlert(item._id)}
                              className="text-indigo-600 hover:text-indigo-800"
                              title="Preview Alert"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleRemoveItem(item._id)}
                              className="text-red-500 hover:text-red-700"
                              title="Remove"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {/* Alert Preview Modal */}
        {previewItemId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">Alert Preview</h3>
                <button
                  onClick={() => {
                    setPreviewItemId(null);
                    setPreviewData(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Template Selector */}
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium text-gray-700">Template:</label>
                  <select
                    value={previewTemplateId}
                    onChange={(e) => {
                      const newTemplate = e.target.value as AlertTemplateId;
                      setPreviewTemplateId(newTemplate);
                      if (previewItemId) {
                        handlePreviewAlert(previewItemId, newTemplate);
                      }
                    }}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    {ALERT_TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {previewLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : previewData ? (
                  <>
                    {/* Analysis Summary */}
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                      <h4 className="font-semibold text-blue-900 mb-3">Analysis Summary</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-blue-600 mb-1">Recommendation</p>
                          <p className={`font-bold ${getRecommendationBadge(previewData.analysis.recommendation)} px-2 py-1 rounded inline-block`}>
                            {previewData.analysis.recommendation}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-blue-600 mb-1">Severity</p>
                          <p className={`font-bold ${getSeverityColor(previewData.analysis.severity)} px-2 py-1 rounded inline-block`}>
                            {previewData.analysis.severity}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-blue-600 mb-1">Confidence</p>
                          <p className="font-bold text-blue-900">{previewData.analysis.confidence}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-blue-600 mb-1">Template</p>
                          <p className="font-bold text-blue-900">{previewData.template.name}</p>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-blue-200">
                        <p className="text-sm text-blue-800">
                          <strong>Reason:</strong> {previewData.analysis.reason}
                        </p>
                      </div>
                    </div>

                    {/* Formatted Alerts by Channel */}
                    <div className="space-y-4">
                      {/* Email */}
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center gap-2">
                          <span className="text-xl">📧</span>
                          <span className="font-medium text-gray-900">Email</span>
                        </div>
                        <div className="p-4 bg-white">
                          <div className="mb-2">
                            <span className="text-xs text-gray-500">Subject:</span>
                            <p className="font-semibold text-gray-900">{previewData.formatted.subject}</p>
                          </div>
                          <div className="mt-3">
                            <span className="text-xs text-gray-500">Body:</span>
                            <pre className="mt-1 p-3 bg-gray-50 rounded text-sm whitespace-pre-wrap font-sans">
                              {previewData.formatted.body}
                            </pre>
                          </div>
                        </div>
                      </div>

                      {/* SMS */}
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center gap-2">
                          <span className="text-xl">📱</span>
                          <span className="font-medium text-gray-900">SMS / Text</span>
                          <span className="text-xs text-gray-500 ml-auto">
                            {previewData.formatted.sms.length} / 160 chars
                          </span>
                        </div>
                        <div className="p-4 bg-white">
                          <pre className="p-3 bg-gray-50 rounded text-sm whitespace-pre-wrap font-sans">
                            {previewData.formatted.sms}
                          </pre>
                        </div>
                      </div>

                      {/* Slack */}
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center gap-2">
                          <span className="text-xl">💬</span>
                          <span className="font-medium text-gray-900">Slack</span>
                        </div>
                        <div className="p-4 bg-white">
                          <pre className="p-3 bg-gray-50 rounded text-sm whitespace-pre-wrap font-mono">
                            {previewData.formatted.slack}
                          </pre>
                        </div>
                      </div>

                      {/* Push Notification */}
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center gap-2">
                          <span className="text-xl">🔔</span>
                          <span className="font-medium text-gray-900">Browser Push</span>
                        </div>
                        <div className="p-4 bg-white">
                          <p className="font-semibold text-gray-900">{previewData.formatted.subject}</p>
                          <p className="text-sm text-gray-600 mt-1">{previewData.formatted.sms}</p>
                        </div>
                      </div>
                    </div>

                    {/* Alert Details */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h4 className="font-semibold text-gray-900 mb-3">Alert Details</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Symbol</p>
                          <p className="font-medium">{previewData.alert.symbol}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Current Price</p>
                          <p className="font-medium">{formatCurrency(previewData.alert.details.currentPrice)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">P/L</p>
                          <p className={`font-medium ${previewData.alert.details.priceChangePercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {formatPercent(previewData.alert.details.priceChangePercent)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">DTE</p>
                          <p className="font-medium">
                            {previewData.alert.details.daysToExpiration !== undefined
                              ? `${previewData.alert.details.daysToExpiration} days`
                              : "N/A"}
                          </p>
                        </div>
                      </div>
                      {previewData.alert.suggestedActions.length > 0 && (
                        <div className="mt-4">
                          <p className="text-gray-600 mb-2">Suggested Actions:</p>
                          <ul className="list-disc list-inside space-y-1 text-sm">
                            {previewData.alert.suggestedActions.map((action, idx) => (
                              <li key={idx} className="text-gray-800">{action}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {previewData.alert.riskWarning && (
                        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded">
                          <p className="text-xs font-medium text-amber-900 mb-1">Risk Warning:</p>
                          <p className="text-sm text-amber-800">{previewData.alert.riskWarning}</p>
                        </div>
                      )}
                    </div>

                    {/* Schedule Alert Section */}
                    <div className="border-t border-gray-200 pt-6">
                      {!showScheduleForm ? (
                        <button
                          onClick={() => setShowScheduleForm(true)}
                          className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Schedule This Alert
                        </button>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-gray-900">Schedule Alert</h4>
                            <button
                              onClick={() => setShowScheduleForm(false)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>

                          {/* Delivery Channels */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Delivery Channels *
                            </label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {(["email", "sms", "slack", "push"] as AlertDeliveryChannel[]).map((channel) => (
                                <label
                                  key={channel}
                                  className={`flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                                    scheduleChannels.includes(channel)
                                      ? "border-indigo-500 bg-indigo-50"
                                      : "border-gray-200 hover:border-gray-300"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={scheduleChannels.includes(channel)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setScheduleChannels([...scheduleChannels, channel]);
                                      } else {
                                        setScheduleChannels(scheduleChannels.filter((c) => c !== channel));
                                      }
                                    }}
                                    className="rounded"
                                  />
                                  <span className="text-sm font-medium capitalize">{channel}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          {/* Schedule Type */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Schedule *
                            </label>
                            <select
                              value={scheduleType}
                              onChange={(e) => setScheduleType(e.target.value as typeof scheduleType)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                            >
                              <option value="immediate">Send Immediately</option>
                              <option value="daily">Daily at specific time</option>
                              <option value="weekly">Weekly on specific day</option>
                              <option value="once">Once at specific date/time</option>
                              <option value="recurring">Recurring (Cron expression)</option>
                            </select>
                          </div>

                          {/* Schedule Options */}
                          {scheduleType === "daily" && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                              <input
                                type="time"
                                value={scheduleTime}
                                onChange={(e) => setScheduleTime(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                              />
                            </div>
                          )}

                          {scheduleType === "weekly" && (
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Day of Week</label>
                                <select
                                  value={scheduleDay}
                                  onChange={(e) => setScheduleDay(parseInt(e.target.value))}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                                >
                                  <option value={0}>Sunday</option>
                                  <option value={1}>Monday</option>
                                  <option value={2}>Tuesday</option>
                                  <option value={3}>Wednesday</option>
                                  <option value={4}>Thursday</option>
                                  <option value={5}>Friday</option>
                                  <option value={6}>Saturday</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                                <input
                                  type="time"
                                  value={scheduleTime}
                                  onChange={(e) => setScheduleTime(e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                                />
                              </div>
                            </div>
                          )}

                          {scheduleType === "once" && (
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                                <input
                                  type="date"
                                  value={scheduleDate}
                                  onChange={(e) => setScheduleDate(e.target.value)}
                                  min={new Date().toISOString().split("T")[0]}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                                <input
                                  type="time"
                                  value={scheduleTime}
                                  onChange={(e) => setScheduleTime(e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                                />
                              </div>
                            </div>
                          )}

                          {scheduleType === "recurring" && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Cron Expression</label>
                              <input
                                type="text"
                                value={scheduleCron}
                                onChange={(e) => setScheduleCron(e.target.value)}
                                placeholder="0 16 * * 1-5"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm"
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                Format: minute hour day month dayOfWeek (e.g., "0 16 * * 1-5" = 4 PM Mon-Fri)
                              </p>
                            </div>
                          )}

                          {/* Message */}
                          {scheduleMessage && (
                            <div className={`p-3 rounded-lg ${
                              scheduleMessage.includes("Error") || scheduleMessage.includes("Please")
                                ? "bg-red-100 text-red-800"
                                : "bg-green-100 text-green-800"
                            }`}>
                              {scheduleMessage}
                            </div>
                          )}

                          {/* Submit Button */}
                          <button
                            onClick={handleScheduleAlert}
                            disabled={scheduling || scheduleChannels.length === 0}
                            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {scheduling ? (
                              <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Scheduling...
                              </>
                            ) : (
                              <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Schedule Alert
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    Click a watchlist item to preview its alert
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Alert Settings Tab */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            {prefsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="ml-3 text-gray-600">Loading preferences...</span>
              </div>
            ) : (
            <>
            {/* Alert Delivery Channels */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Alert Delivery Channels</h3>
              <p className="text-sm text-gray-600 mb-6">Choose how you want to receive alerts for your watchlist positions.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Email */}
                <div className={`p-4 rounded-xl border-2 ${prefsForm.channels.email.enabled ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📧</span>
                      <div>
                        <p className="font-medium">Email</p>
                        <p className="text-xs text-gray-500">{ALERT_CHANNEL_COSTS.email.description}</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={prefsForm.channels.email.enabled}
                        onChange={(e) => setPrefsForm({
                          ...prefsForm,
                          channels: { ...prefsForm.channels, email: { ...prefsForm.channels.email, enabled: e.target.checked } }
                        })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  {prefsForm.channels.email.enabled && (
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={prefsForm.channels.email.target}
                      onChange={(e) => setPrefsForm({
                        ...prefsForm,
                        channels: { ...prefsForm.channels, email: { ...prefsForm.channels.email, target: e.target.value } }
                      })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  )}
                </div>

                {/* SMS */}
                <div className={`p-4 rounded-xl border-2 ${prefsForm.channels.sms.enabled ? "border-green-500 bg-green-50" : "border-gray-200"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📱</span>
                      <div>
                        <p className="font-medium">SMS / Text</p>
                        <p className="text-xs text-gray-500">{ALERT_CHANNEL_COSTS.sms.description}</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={prefsForm.channels.sms.enabled}
                        onChange={(e) => setPrefsForm({
                          ...prefsForm,
                          channels: { ...prefsForm.channels, sms: { ...prefsForm.channels.sms, enabled: e.target.checked } }
                        })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                    </label>
                  </div>
                  {prefsForm.channels.sms.enabled && (
                    <input
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={prefsForm.channels.sms.target}
                      onChange={(e) => setPrefsForm({
                        ...prefsForm,
                        channels: { ...prefsForm.channels, sms: { ...prefsForm.channels.sms, target: e.target.value } }
                      })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  )}
                </div>

                {/* Slack */}
                <div className={`p-4 rounded-xl border-2 ${prefsForm.channels.slack.enabled ? "border-purple-500 bg-purple-50" : "border-gray-200"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">💬</span>
                      <div>
                        <p className="font-medium">Slack</p>
                        <p className="text-xs text-gray-500">{ALERT_CHANNEL_COSTS.slack.description}</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={prefsForm.channels.slack.enabled}
                        onChange={(e) => setPrefsForm({
                          ...prefsForm,
                          channels: { ...prefsForm.channels, slack: { ...prefsForm.channels.slack, enabled: e.target.checked } }
                        })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>
                  {prefsForm.channels.slack.enabled && (
                    <input
                      type="url"
                      placeholder="https://hooks.slack.com/services/..."
                      value={prefsForm.channels.slack.target}
                      onChange={(e) => setPrefsForm({
                        ...prefsForm,
                        channels: { ...prefsForm.channels, slack: { ...prefsForm.channels.slack, target: e.target.value } }
                      })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  )}
                </div>

                {/* Push */}
                <div className={`p-4 rounded-xl border-2 ${prefsForm.channels.push.enabled ? "border-orange-500 bg-orange-50" : "border-gray-200"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🔔</span>
                      <div>
                        <p className="font-medium">Browser Push</p>
                        <p className="text-xs text-gray-500">{ALERT_CHANNEL_COSTS.push.description}</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={prefsForm.channels.push.enabled}
                        onChange={(e) => setPrefsForm({
                          ...prefsForm,
                          channels: { ...prefsForm.channels, push: { ...prefsForm.channels.push, enabled: e.target.checked } }
                        })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                    </label>
                  </div>
                  {prefsForm.channels.push.enabled && (
                    <div className="space-y-2">
                      {pushPermission === "granted" ? (
                        <div className="space-y-2">
                          <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800">
                            ✓ Push notifications enabled
                          </div>
                          <button
                            onClick={() => {
                              showDirectNotification(
                                "Test Alert",
                                "This is a test notification from myInvestments",
                                { url: "/watchlist" }
                              );
                            }}
                            className="w-full px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-xs text-gray-700"
                          >
                            Test Notification
                          </button>
                        </div>
                      ) : pushPermission === "denied" ? (
                        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                          ✗ Push notifications blocked. Please enable in browser settings.
                        </div>
                      ) : (
                        <button
                          onClick={handleEnablePush}
                          disabled={enablingPush}
                          className="w-full px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                        >
                          {enablingPush ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Enabling...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                              </svg>
                              Enable Push Notifications
                            </>
                          )}
                        </button>
                      )}
                      <p className="text-xs text-gray-500">
                        {pushPermission === "granted"
                          ? "You'll receive push notifications for scheduled alerts."
                          : "Click to enable browser push notifications."}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Estimated Cost */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>Estimated monthly cost:</strong>{" "}
                  <span className="font-bold text-green-600">${estimatedMonthlyCost().toFixed(2)}</span>
                  <span className="text-gray-500 ml-2">(based on {prefsForm.frequency === "daily" ? "30" : prefsForm.frequency === "weekly" ? "4" : "60"} alerts/month)</span>
                </p>
              </div>
            </div>

            {/* Alert Template */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Message Template</h3>
              <p className="text-sm text-gray-600 mb-6">Choose how detailed your alert messages should be.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ALERT_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setPrefsForm({ ...prefsForm, templateId: template.id })}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      prefsForm.templateId === template.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <p className="font-medium text-gray-900">{template.name}</p>
                    <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                    <div className="mt-3 p-2 bg-gray-100 rounded text-xs font-mono text-gray-700 overflow-hidden">
                      {template.smsTemplate.substring(0, 60)}...
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Alert Frequency & Thresholds */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Frequency & Thresholds</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Frequency */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Alert Frequency</label>
                  <select
                    value={prefsForm.frequency}
                    onChange={(e) => setPrefsForm({ ...prefsForm, frequency: e.target.value as AlertFrequency })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  >
                    <option value="realtime">Real-time (as events occur)</option>
                    <option value="daily">Daily Summary (end of day)</option>
                    <option value="weekly">Weekly Digest</option>
                  </select>
                </div>

                {/* Severity Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Alert Severity Filter</label>
                  <div className="flex flex-wrap gap-2">
                    {(["info", "warning", "urgent", "critical"] as AlertSeverity[]).map((sev) => (
                      <button
                        key={sev}
                        onClick={() => {
                          const current = prefsForm.severityFilter;
                          const updated = current.includes(sev)
                            ? current.filter((s) => s !== sev)
                            : [...current, sev];
                          setPrefsForm({ ...prefsForm, severityFilter: updated });
                        }}
                        className={`px-3 py-1 rounded-full text-sm ${
                          prefsForm.severityFilter.includes(sev)
                            ? sev === "critical" ? "bg-red-100 text-red-700 border-2 border-red-300"
                            : sev === "urgent" ? "bg-orange-100 text-orange-700 border-2 border-orange-300"
                            : sev === "warning" ? "bg-yellow-100 text-yellow-700 border-2 border-yellow-300"
                            : "bg-blue-100 text-blue-700 border-2 border-blue-300"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {sev}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Profit Threshold */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Profit Alert Threshold: {prefsForm.profitThreshold}%
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={prefsForm.profitThreshold}
                    onChange={(e) => setPrefsForm({ ...prefsForm, profitThreshold: parseInt(e.target.value) })}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">Alert when profit exceeds this percentage</p>
                </div>

                {/* Loss Threshold */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Loss Alert Threshold: {prefsForm.lossThreshold}%
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={prefsForm.lossThreshold}
                    onChange={(e) => setPrefsForm({ ...prefsForm, lossThreshold: parseInt(e.target.value) })}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">Alert when loss exceeds this percentage</p>
                </div>

                {/* DTE Warning */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    DTE Warning: {prefsForm.dteWarning} days
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={prefsForm.dteWarning}
                    onChange={(e) => setPrefsForm({ ...prefsForm, dteWarning: parseInt(e.target.value) })}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">Warn when options have this many days or fewer to expiration</p>
                </div>

                {/* Quiet Hours */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Quiet Hours (optional)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={prefsForm.quietHoursStart}
                      onChange={(e) => setPrefsForm({ ...prefsForm, quietHoursStart: e.target.value })}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                    <span className="text-gray-500">to</span>
                    <input
                      type="time"
                      value={prefsForm.quietHoursEnd}
                      onChange={(e) => setPrefsForm({ ...prefsForm, quietHoursEnd: e.target.value })}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">No alerts during these hours</p>
                </div>
              </div>
            </div>

            {/* Scheduler Management */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Scheduled Jobs</h3>
              <p className="text-sm text-gray-600 mb-6">
                Automatic analysis runs on a schedule using MongoDB-backed jobs. Jobs persist across restarts.
              </p>

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-3 mb-6">
                <button
                  onClick={() => handleSchedulerAction("setup-defaults")}
                  disabled={schedulerLoading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Setup Default Schedule
                </button>
                <button
                  onClick={() => handleSchedulerAction("run", "daily-analysis")}
                  disabled={schedulerLoading}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Run Analysis Now
                </button>
                <button
                  onClick={fetchSchedulerStatus}
                  disabled={schedulerLoading}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                >
                  <svg className={`w-5 h-5 ${schedulerLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh Status
                </button>
              </div>

              {/* Status Message */}
              {schedulerMessage && (
                <div className={`mb-4 p-3 rounded-lg ${schedulerMessage.startsWith("Error") ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
                  {schedulerMessage}
                </div>
              )}

              {/* Jobs Table */}
              {schedulerStatus && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-2 px-3 text-left font-medium text-gray-600">Job Name</th>
                        <th className="py-2 px-3 text-left font-medium text-gray-600">Last Run</th>
                        <th className="py-2 px-3 text-left font-medium text-gray-600">Next Run</th>
                        <th className="py-2 px-3 text-left font-medium text-gray-600">Status</th>
                        <th className="py-2 px-3 text-center font-medium text-gray-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedulerStatus.jobs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-gray-500">
                            No scheduled jobs. Click &quot;Setup Default Schedule&quot; to create them.
                          </td>
                        </tr>
                      ) : (
                        schedulerStatus.jobs.map((job) => (
                          <tr key={job.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-3 font-medium">{job.name}</td>
                            <td className="py-3 px-3 text-gray-600">
                              {job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : "Never"}
                            </td>
                            <td className="py-3 px-3 text-gray-600">
                              {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : "Not scheduled"}
                            </td>
                            <td className="py-3 px-3">
                              {job.failCount > 0 ? (
                                <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                                  Failed ({job.failCount}x)
                                </span>
                              ) : job.nextRunAt ? (
                                <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                                  Scheduled
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
                                  Inactive
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleSchedulerAction("run", job.name)}
                                  className="text-indigo-600 hover:text-indigo-800"
                                  title="Run Now"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleSchedulerAction("cancel", job.name)}
                                  className="text-red-600 hover:text-red-800"
                                  title="Cancel"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Schedule Info */}
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Default Schedules</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li><strong>daily-analysis:</strong> 4:00 PM Mon-Fri (market close)</li>
                  <li><strong>cleanup-alerts:</strong> 2:00 AM Sunday (removes old acknowledged alerts)</li>
                </ul>
                <p className="text-xs text-blue-700 mt-2">
                  Jobs are stored in MongoDB and persist across app restarts.
                </p>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-between">
              <div>
                {prefsMessage && (
                  <p className={`text-sm ${prefsMessage.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
                    {prefsMessage}
                  </p>
                )}
              </div>
              <button
                onClick={handleSavePrefs}
                disabled={prefsSaving}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {prefsSaving ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Save Alert Preferences
                  </>
                )}
              </button>
            </div>
            </>
            )}
          </div>
        )}

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
