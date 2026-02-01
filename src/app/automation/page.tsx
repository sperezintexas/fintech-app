"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import type {
  Account,
  WatchlistAlert,
  AlertDeliveryChannel,
  AlertTemplateId,
  AlertFrequency,
  AlertSeverity,
  ScheduledAlert,
  Job,
  ReportTemplateId,
  StrategySettings,
} from "@/types/portfolio";
import { ALERT_TEMPLATES, ALERT_CHANNEL_COSTS, REPORT_TEMPLATES, getReportTemplate } from "@/types/portfolio";
import { cronToHuman } from "@/lib/cron-utils";
import {
  requestPushPermission,
  registerPushSubscription,
  showDirectNotification,
} from "@/lib/push-client";

type TestChannel = "slack" | "twitter" | "push";

function AutomationContent() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [alerts, setAlerts] = useState<WatchlistAlert[]>([]);
  const [scheduledAlerts, setScheduledAlerts] = useState<ScheduledAlert[]>([]);
  const [loading, setLoading] = useState(true);

  // Alert preferences state
  const [activeTab, setActiveTab] = useState<"alerts" | "settings" | "strategy" | "jobs">("alerts");
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsMessage, setPrefsMessage] = useState("");
  const [channelTest, setChannelTest] = useState<
    Record<TestChannel, { status: "idle" | "sending" | "success" | "error"; message?: string }>
  >({
    slack: { status: "idle" },
    twitter: { status: "idle" },
    push: { status: "idle" },
  });
  // Jobs state
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobTypes, setJobTypes] = useState<Array<{ _id: string; id: string; name: string; description: string; handlerKey: string; supportsPortfolio: boolean; supportsAccount: boolean; order: number; enabled: boolean; defaultConfig?: Record<string, unknown>; defaultDeliveryChannels?: AlertDeliveryChannel[] }>>([]);
  const [showJobForm, setShowJobForm] = useState(false);
  const [jobFormError, setJobFormError] = useState<string>("");
  const [jobFormSaving, setJobFormSaving] = useState(false);

  // Strategy settings (min OI filters for xAIProfitBuilder option chains)
  const [strategySettingsLoading, setStrategySettingsLoading] = useState(false);
  const [strategySettingsSaving, setStrategySettingsSaving] = useState(false);
  const [strategySettingsMessage, setStrategySettingsMessage] = useState<string>("");
  const [strategySettingsError, setStrategySettingsError] = useState<string>("");
  const [strategySettings, setStrategySettings] = useState<StrategySettings | null>(null);
  const [strategyThresholdsForm, setStrategyThresholdsForm] = useState({
    coveredCallMinOI: 500,
    cashSecuredPutMinOI: 500,
    coveredCallMinVolume: 0,
    cashSecuredPutMinVolume: 0,
    coveredCallMaxAssignProb: 100,
    cashSecuredPutMaxAssignProb: 100,
  });
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [jobForm, setJobForm] = useState<{
    name: string;
    jobType: string;
    messageTemplate?: string;
    templateId: ReportTemplateId;
    customSlackTemplate: string;
    scannerConfig?: { holdDteMin?: number; btcDteMax?: number; btcStopLossPercent?: number; holdTimeValuePercentMin?: number; highVolatilityPercent?: number };
    config?: Record<string, unknown>;
    scheduleCron: string;
    channels: AlertDeliveryChannel[];
    status: "active" | "paused";
  }>({
    name: "",
    jobType: "smartxai",
    templateId: "concise",
    customSlackTemplate: "",
    scheduleCron: "0 16 * * 1-5",
    channels: ["slack"],
    status: "active",
  });
  const [jobScheduleTime, setJobScheduleTime] = useState("16:00");
  const [jobScheduleFreq, setJobScheduleFreq] = useState<"daily" | "weekdays">("weekdays");

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

  // Message template JSON editor
  const [templateEditorTab, setTemplateEditorTab] = useState<"alert" | "report">("alert");
  const [alertTemplatesJson, setAlertTemplatesJson] = useState("");
  const [reportTemplatesJson, setReportTemplatesJson] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  // App config (cleanup settings in appUtil collection)
  const [appConfig, setAppConfig] = useState<{
    cleanup: { storageLimitMB: number; purgeThreshold: number; purgeIntervalDays: number; lastDataCleanup?: string };
    storage?: { dataSizeMB: number; percentOfLimit: number };
  } | null>(null);
  const [appConfigSaving, setAppConfigSaving] = useState(false);
  const [appConfigError, setAppConfigError] = useState<string | null>(null);

  // Alert preview state
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

  const runChannelTest = async (channel: TestChannel) => {
    if (!selectedAccountId) return;

    setChannelTest((prev) => ({
      ...prev,
      [channel]: { status: "sending", message: "Sending test..." },
    }));

    try {
      if (channel === "push") {
        showDirectNotification("Hello world", "Push notifications are working.", {
          url: "/automation",
        });
        setChannelTest((prev) => ({
          ...prev,
          push: { status: "success", message: "Displayed browser notification." },
        }));
        return;
      }

      const res = await fetch("/api/alert-preferences/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId,
          channel,
          message: "Hello world from myInvestments",
        }),
      });

      const data = (await res.json()) as { success?: boolean; message?: string; error?: string };
      if (!res.ok) {
        setChannelTest((prev) => ({
          ...prev,
          [channel]: { status: "error", message: data.error || "Test failed" },
        }));
        return;
      }

      setChannelTest((prev) => ({
        ...prev,
        [channel]: { status: "success", message: data.message || "Test sent" },
      }));
    } catch (err) {
      console.error(err);
      setChannelTest((prev) => ({
        ...prev,
        [channel]: { status: "error", message: "Test failed" },
      }));
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
      slack: { enabled: false, target: "" },
      push: { enabled: false, target: "" },
      twitter: { enabled: false, target: "" },
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
          const urlAccountId = searchParams.get("accountId");
          if (data.length > 0) {
            setSelectedAccountId(urlAccountId && data.some((a: Account) => a._id === urlAccountId) ? urlAccountId : data[0]._id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch accounts:", err);
      }
    }
    fetchAccounts();
  }, []);

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    if (!selectedAccountId || selectedAccountId === "__portfolio__") return;

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
    if (!selectedAccountId || selectedAccountId === "__portfolio__") return;

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
    fetchAlerts();
    if (activeTab === "alerts") {
      fetchScheduledAlerts();
    }
  }, [fetchAlerts, fetchScheduledAlerts, activeTab]);

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
    if (!selectedAccountId || selectedAccountId === "__portfolio__") return;

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
            slack: data.channels?.find((c: { channel: string }) => c.channel === "slack") || { enabled: false, target: "" },
            push: data.channels?.find((c: { channel: string }) => c.channel === "push") || { enabled: false, target: "" },
            twitter: data.channels?.find((c: { channel: string }) => c.channel === "twitter") || { enabled: false, target: "" },
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

  // Fetch template JSON and app config when settings tab is active
  useEffect(() => {
    if (activeTab !== "settings") return;
    const fetchSettings = async () => {
      try {
        const [alertRes, reportRes, appConfigRes] = await Promise.all([
          fetch("/api/alert-templates"),
          fetch("/api/report-templates"),
          fetch("/api/app-config"),
        ]);
        if (alertRes.ok) {
          const data = await alertRes.json();
          setAlertTemplatesJson(JSON.stringify(data.templates, null, 2));
        }
        if (reportRes.ok) {
          const data = await reportRes.json();
          setReportTemplatesJson(JSON.stringify(data.templates, null, 2));
        }
        if (appConfigRes.ok) {
          const data = await appConfigRes.json();
          setAppConfig(data);
        }
      } catch (err) {
        console.error("Failed to fetch settings:", err);
      }
    };
    fetchSettings();
  }, [activeTab]);

  const fetchJobs = useCallback(async () => {
    const isPortfolio = selectedAccountId === "__portfolio__";
    const url = isPortfolio ? "/api/jobs" : `/api/jobs?accountId=${selectedAccountId}`;
    if (!selectedAccountId && !isPortfolio) return;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    }
  }, [selectedAccountId]);

  const fetchJobTypes = useCallback(async () => {
    try {
      const res = await fetch("/api/report-types?all=true", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setJobTypes(data);
      }
    } catch (err) {
      console.error("Failed to fetch job types:", err);
    }
  }, []);

  const fetchStrategySettings = useCallback(async () => {
    if (!selectedAccountId || selectedAccountId === "__portfolio__") return;
    setStrategySettingsLoading(true);
    setStrategySettingsError("");
    setStrategySettingsMessage("");
    try {
      const res = await fetch(`/api/strategy-settings?accountId=${encodeURIComponent(selectedAccountId)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as StrategySettings | { error?: string };
      if (!res.ok) {
        setStrategySettingsError((data as { error?: string }).error || "Failed to load strategy settings");
        return;
      }

      const settings = data as StrategySettings;
      setStrategySettings(settings);
      setStrategyThresholdsForm({
        coveredCallMinOI: settings.thresholds?.["covered-call"]?.minOpenInterest ?? 500,
        cashSecuredPutMinOI: settings.thresholds?.["cash-secured-put"]?.minOpenInterest ?? 500,
        coveredCallMinVolume: settings.thresholds?.["covered-call"]?.minVolume ?? 0,
        cashSecuredPutMinVolume: settings.thresholds?.["cash-secured-put"]?.minVolume ?? 0,
        coveredCallMaxAssignProb: settings.thresholds?.["covered-call"]?.maxAssignmentProbability ?? 100,
        cashSecuredPutMaxAssignProb: settings.thresholds?.["cash-secured-put"]?.maxAssignmentProbability ?? 100,
      });
    } catch (e) {
      console.error("Failed to fetch strategy settings:", e);
      setStrategySettingsError("Failed to load strategy settings");
    } finally {
      setStrategySettingsLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    if (activeTab === "strategy") {
      fetchStrategySettings();
    }
  }, [activeTab, fetchStrategySettings]);

  const saveStrategySettings = useCallback(async () => {
    if (!selectedAccountId || selectedAccountId === "__portfolio__") return;
    setStrategySettingsSaving(true);
    setStrategySettingsError("");
    setStrategySettingsMessage("");
    try {
      const res = await fetch("/api/strategy-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId,
          thresholds: {
            "covered-call": {
              minOpenInterest: Number(strategyThresholdsForm.coveredCallMinOI),
              minVolume: Number(strategyThresholdsForm.coveredCallMinVolume),
              maxAssignmentProbability: Number(strategyThresholdsForm.coveredCallMaxAssignProb),
            },
            "cash-secured-put": {
              minOpenInterest: Number(strategyThresholdsForm.cashSecuredPutMinOI),
              minVolume: Number(strategyThresholdsForm.cashSecuredPutMinVolume),
              maxAssignmentProbability: Number(strategyThresholdsForm.cashSecuredPutMaxAssignProb),
            },
          },
        }),
      });
      const data = (await res.json()) as StrategySettings | { error?: string };
      if (!res.ok) {
        setStrategySettingsError((data as { error?: string }).error || "Failed to save strategy settings");
        return;
      }
      setStrategySettings(data as StrategySettings);
      setStrategySettingsMessage("Saved strategy settings.");
      setTimeout(() => setStrategySettingsMessage(""), 2500);
    } catch (e) {
      console.error("Failed to save strategy settings:", e);
      setStrategySettingsError("Failed to save strategy settings");
    } finally {
      setStrategySettingsSaving(false);
    }
  }, [selectedAccountId, strategyThresholdsForm]);

  useEffect(() => {
    if (activeTab === "jobs") {
      fetchJobTypes();
      fetchJobs();
    }
  }, [activeTab, fetchJobTypes, fetchJobs]);

  const scheduleToCron = (time: string, freq: "daily" | "weekdays"): string => {
    const [h, m] = time.split(":").map((x) => parseInt(x, 10) || 0);
    const hour = Math.min(23, Math.max(0, h));
    const minute = Math.min(59, Math.max(0, m));
    if (freq === "weekdays") return `${minute} ${hour} * * 1-5`;
    return `${minute} ${hour} * * *`;
  };

  const openNewJob = () => {
    const isPortfolio = selectedAccountId === "__portfolio__";
    const defaultType = jobTypes.find((t) => (isPortfolio ? t.supportsPortfolio : t.supportsAccount))?.id ?? "smartxai";
    const jobTypeId = isPortfolio ? (jobTypes.find((t) => t.supportsPortfolio)?.id ?? "portfoliosummary") : defaultType;
    const typeInfo = jobTypes.find((t) => t.id === jobTypeId);
    const defaultConfig = typeInfo?.defaultConfig;
    const defaultChannels = typeInfo?.defaultDeliveryChannels;
    const isOptionScanner = typeInfo?.handlerKey === "OptionScanner";
    setEditingJobId(null);
    setJobFormError("");
    setJobScheduleTime("16:00");
    setJobScheduleFreq("weekdays");
    setJobForm({
      name: "",
      jobType: jobTypeId,
      messageTemplate: "",
      templateId: "concise",
      customSlackTemplate: "",
      config: isOptionScanner ? undefined : (defaultConfig as Record<string, unknown> | undefined),
      scannerConfig: isOptionScanner ? (defaultConfig as { holdDteMin?: number; btcDteMax?: number; btcStopLossPercent?: number; holdTimeValuePercentMin?: number; highVolatilityPercent?: number } | undefined) : undefined,
      scheduleCron: scheduleToCron("16:00", "weekdays"),
      channels: (defaultChannels?.length ? defaultChannels : ["slack"]) as AlertDeliveryChannel[],
      status: "active",
    });
    setShowJobForm(true);
  };

  const openEditJob = (j: Job) => {
    setEditingJobId(j._id);
    setJobFormError("");
    const cronParts = (j.scheduleCron ?? "0 16 * * 1-5").trim().split(/\s+/);
    if (cronParts.length >= 5) {
      const minute = cronParts[0] ?? "0";
      const hour = cronParts[1] ?? "16";
      const dow = cronParts[4] ?? "*";
      setJobScheduleTime(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
      setJobScheduleFreq(dow === "*" ? "daily" : "weekdays");
    }
    setJobForm({
      name: j.name,
      jobType: j.jobType,
      messageTemplate: j.messageTemplate ?? "",
      templateId: j.templateId ?? "concise",
      customSlackTemplate: j.customSlackTemplate ?? "",
      scannerConfig: j.scannerConfig,
      config: j.config,
      scheduleCron: j.scheduleCron,
      channels: j.channels ?? ["slack"],
      status: j.status ?? "active",
    });
    setShowJobForm(true);
  };

  const saveJob = async () => {
    const isPortfolio = selectedAccountId === "__portfolio__";
    if (!selectedAccountId && !isPortfolio) return;
    const name = jobForm.name.trim();
    if (!name) return setJobFormError("Job name is required");
    if (!jobForm.jobType) return setJobFormError("Select a job type");
    if (!jobForm.scheduleCron.trim()) return setJobFormError("Cron schedule is required");
    if (!(jobForm.channels ?? []).length) return setJobFormError("Select at least one delivery channel");

    setJobFormSaving(true);
    setJobFormError("");
    try {
      const body = {
        name,
        jobType: jobForm.jobType,
        messageTemplate: jobForm.messageTemplate?.trim() || undefined,
        templateId: jobForm.templateId,
        customSlackTemplate: jobForm.customSlackTemplate.trim() || undefined,
        scannerConfig: jobForm.scannerConfig,
        config: jobForm.config,
        scheduleCron: jobForm.scheduleCron,
        channels: jobForm.channels,
        status: jobForm.status,
      };
      const res = await fetch(
        editingJobId ? `/api/jobs/${editingJobId}` : "/api/jobs",
        {
          method: editingJobId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editingJobId ? body : { accountId: isPortfolio ? null : selectedAccountId, ...body }
          ),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setJobFormError(data.error || "Failed to save job");
        return;
      }
      setShowJobForm(false);
      await fetchJobs();
    } catch (err) {
      console.error(err);
      setJobFormError("Failed to save job");
    } finally {
      setJobFormSaving(false);
    }
  };

  const deleteJob = async (id: string) => {
    if (!confirm("Delete this scheduled job?")) return;
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      if (res.ok) await fetchJobs();
    } catch (err) {
      console.error("Failed to delete job:", err);
    }
  };

  const runJobNow = async (jobId: string) => {
    setSchedulerMessage("");
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "POST",
      });
      const data = (await res.json()) as { success?: boolean; message?: string; error?: string };
      if (res.ok && data.success) {
        setSchedulerMessage(data.message ?? "Job completed.");
        setTimeout(() => setSchedulerMessage(""), 5000);
      } else {
        setSchedulerMessage(`Error: ${data.error ?? "Failed to run job"}`);
      }
      await fetchJobs();
    } catch (err) {
      console.error("Failed to run job now:", err);
      setSchedulerMessage("Error: Failed to run job");
    }
  };

  const runPortfolioScanners = async () => {
    setSchedulerMessage("");
    setSchedulerLoading(true);
    try {
      const res = await fetch("/api/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "runPortfolio" }),
      });
      const data = (await res.json()) as { success?: boolean; message?: string; error?: string };
      if (res.ok && data.success) {
        setSchedulerMessage(data.message ?? "Portfolio scanners triggered.");
        setTimeout(() => setSchedulerMessage(""), 5000);
      } else {
        setSchedulerMessage(`Error: ${data.error ?? "Failed to run portfolio scanners"}`);
      }
    } catch (err) {
      console.error("Failed to run portfolio scanners:", err);
      setSchedulerMessage("Error: Failed to run portfolio scanners");
    } finally {
      setSchedulerLoading(false);
    }
  };

  // Save alert preferences
  const handleSavePrefs = async () => {
    if (!selectedAccountId || selectedAccountId === "__portfolio__") return;
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

  const saveAppConfig = async () => {
    if (!appConfig?.cleanup) return;
    setAppConfigError(null);
    setAppConfigSaving(true);
    try {
      const res = await fetch("/api/app-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cleanup: appConfig.cleanup }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAppConfigError(data.error || "Failed to save");
        return;
      }
      setAppConfig((prev) => (prev ? { ...prev, cleanup: data.cleanup } : { cleanup: data.cleanup }));
    } catch (err) {
      setAppConfigError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setAppConfigSaving(false);
    }
  };

  const saveTemplateJson = async () => {
    setTemplateError(null);
    setTemplateSaving(true);
    try {
      const url = templateEditorTab === "alert" ? "/api/alert-templates" : "/api/report-templates";
      const json = templateEditorTab === "alert" ? alertTemplatesJson : reportTemplatesJson;
      let templates: unknown[];
      try {
        templates = JSON.parse(json);
      } catch {
        setTemplateError("Invalid JSON");
        return;
      }
      if (!Array.isArray(templates)) {
        setTemplateError("JSON must be an array of templates");
        return;
      }
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTemplateError(data.error || "Failed to save");
        return;
      }
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setTemplateSaving(false);
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <AppHeader />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Setup</h2>
            <p className="text-gray-600 mt-1">Manage alerts, report schedules, and automation</p>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="__portfolio__">Portfolio (all accounts)</option>
              {accounts.map((account) => (
                <option key={account._id} value={account._id}>
                  {account.name} ({account.riskLevel})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-4">
            <button
              onClick={() => setActiveTab("alerts")}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === "alerts"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Alerts
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
            <button
              onClick={() => setActiveTab("strategy")}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === "strategy"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Strategy
            </button>
            <button
              onClick={() => setActiveTab("jobs")}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === "jobs"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Scheduled Jobs
            </button>
          </nav>
        </div>

        {/* Alerts Section (shown on both automation and alerts tabs) */}
        {activeTab === "alerts" && alerts.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Alerts</h3>
            <p className="text-gray-500">Run analysis to generate alerts for your automation positions</p>
          </div>
        )}

        {activeTab === "alerts" && alerts.length > 0 && (
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
                  {/* Alert Details (optional - some alerts have different structure) */}
                  {alert.details && (
                    <div className="mt-3 pt-3 border-t border-current/20 grid grid-cols-4 gap-4 text-xs">
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
                          <span className={`ml-1 font-medium ${alert.details.priceChangePercent >= 0 ? "text-green-700" : "text-red-700"}`}>
                            {formatPercent(alert.details.priceChangePercent)}
                          </span>
                        </div>
                      )}
                      {alert.details.daysToExpiration !== undefined && (
                        <div>
                          <span className="text-gray-600">DTE:</span>
                          <span className={`ml-1 font-medium ${alert.details.daysToExpiration <= 7 ? "text-red-700" : ""}`}>
                            {alert.details.daysToExpiration} days
                          </span>
                        </div>
                      )}
                    </div>
                  )}
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
                              <span className="font-medium">Channels:</span> {(scheduled.channels ?? []).join(", ") || "—"}
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
              <p className="text-sm text-gray-600 mb-6">Choose how you want to receive alerts for your automation positions.</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

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
                    <div className="space-y-2">
                      <input
                        type="url"
                        placeholder="https://hooks.slack.com/services/..."
                        value={prefsForm.channels.slack.target}
                        onChange={(e) =>
                          setPrefsForm({
                            ...prefsForm,
                            channels: {
                              ...prefsForm.channels,
                              slack: { ...prefsForm.channels.slack, target: e.target.value },
                            },
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => runChannelTest("slack")}
                        disabled={!selectedAccountId || channelTest.slack.status === "sending"}
                        className="w-full px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-xs text-gray-700 disabled:opacity-50"
                      >
                        {channelTest.slack.status === "sending" ? "Sending..." : "Preview / Hello world"}
                      </button>
                      {channelTest.slack.status !== "idle" && channelTest.slack.message && (
                        <div
                          className={`p-2 rounded text-xs ${
                            channelTest.slack.status === "success"
                              ? "bg-green-50 border border-green-200 text-green-800"
                              : channelTest.slack.status === "error"
                                ? "bg-red-50 border border-red-200 text-red-800"
                                : "bg-gray-50 border border-gray-200 text-gray-700"
                          }`}
                        >
                          {channelTest.slack.message}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* X / Twitter */}
                <div className={`p-4 rounded-xl border-2 ${prefsForm.channels.twitter.enabled ? "border-gray-800 bg-gray-50" : "border-gray-200"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">𝕏</span>
                      <div>
                        <p className="font-medium">X / Twitter</p>
                        <p className="text-xs text-gray-500">{ALERT_CHANNEL_COSTS.twitter.description}</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={prefsForm.channels.twitter.enabled}
                        onChange={(e) => setPrefsForm({
                          ...prefsForm,
                          channels: { ...prefsForm.channels, twitter: { ...prefsForm.channels.twitter, enabled: e.target.checked } }
                        })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-900"></div>
                    </label>
                  </div>
                  {prefsForm.channels.twitter.enabled && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="@yourhandle"
                        value={prefsForm.channels.twitter.target}
                        onChange={(e) =>
                          setPrefsForm({
                            ...prefsForm,
                            channels: {
                              ...prefsForm.channels,
                              twitter: { ...prefsForm.channels.twitter, target: e.target.value },
                            },
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => runChannelTest("twitter")}
                        disabled={!selectedAccountId || channelTest.twitter.status === "sending"}
                        className="w-full px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-xs text-gray-700 disabled:opacity-50"
                      >
                        {channelTest.twitter.status === "sending" ? "Checking..." : "Preview / Hello world"}
                      </button>
                      {channelTest.twitter.status !== "idle" && channelTest.twitter.message && (
                        <div
                          className={`p-2 rounded text-xs ${
                            channelTest.twitter.status === "success"
                              ? "bg-green-50 border border-green-200 text-green-800"
                              : channelTest.twitter.status === "error"
                                ? "bg-red-50 border border-red-200 text-red-800"
                                : "bg-gray-50 border border-gray-200 text-gray-700"
                          }`}
                        >
                          {channelTest.twitter.message}
                        </div>
                      )}
                    </div>
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
                              runChannelTest("push");
                            }}
                            className="w-full px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-xs text-gray-700"
                          >
                            Preview / Hello world
                          </button>
                          {channelTest.push.status !== "idle" && channelTest.push.message && (
                            <div
                              className={`p-2 rounded text-xs ${
                                channelTest.push.status === "success"
                                  ? "bg-green-50 border border-green-200 text-green-800"
                                  : channelTest.push.status === "error"
                                    ? "bg-red-50 border border-red-200 text-red-800"
                                    : "bg-gray-50 border border-gray-200 text-gray-700"
                              }`}
                            >
                              {channelTest.push.message}
                            </div>
                          )}
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

            {/* Edit Template JSON */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Template JSON</h3>
              <p className="text-sm text-gray-600 mb-4">
                View and edit the raw JSON for alert and report message templates. Placeholders: {"{account}"}, {"{action}"}, {"{symbol}"}, {"{reason}"}, {"{profitPercent}"}, {"{currentPrice}"}, {"{dte}"}, etc.
              </p>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setTemplateEditorTab("alert")}
                  className={`px-4 py-2 rounded-lg font-medium text-sm ${
                    templateEditorTab === "alert"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Alert Templates
                </button>
                <button
                  onClick={() => setTemplateEditorTab("report")}
                  className={`px-4 py-2 rounded-lg font-medium text-sm ${
                    templateEditorTab === "report"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Report Templates
                </button>
              </div>
              <textarea
                value={templateEditorTab === "alert" ? alertTemplatesJson : reportTemplatesJson}
                onChange={(e) =>
                  templateEditorTab === "alert"
                    ? setAlertTemplatesJson(e.target.value)
                    : setReportTemplatesJson(e.target.value)
                }
                className="w-full h-64 px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm"
                spellCheck={false}
              />
              {templateError && (
                <p className="mt-2 text-sm text-red-600">{templateError}</p>
              )}
              <button
                onClick={saveTemplateJson}
                disabled={templateSaving}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {templateSaving ? "Saving..." : "Save Templates"}
              </button>
            </div>

            {/* App Config (Data Cleanup - stored in appUtil collection) */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Cleanup Config</h3>
              <p className="text-sm text-gray-600 mb-4">
                Configure when the cleanup job purges old data. Stored in appUtil collection.
              </p>
              {appConfig ? (
                <div className="space-y-4 max-w-md">
                  {appConfig.storage && (
                    <div className="p-3 bg-gray-50 rounded-lg text-sm">
                      <span className="font-medium">Current storage:</span> {appConfig.storage.dataSizeMB.toFixed(2)} MB
                      ({appConfig.storage.percentOfLimit.toFixed(1)}% of limit)
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Storage Limit (MB)</label>
                    <input
                      type="number"
                      min={64}
                      max={512000}
                      value={appConfig.cleanup.storageLimitMB}
                      onChange={(e) =>
                        setAppConfig((c) =>
                          c ? { ...c, cleanup: { ...c.cleanup, storageLimitMB: parseInt(e.target.value) || 512 } } : c
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">Atlas free tier = 512. Use 512000 for 500GB.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Purge Threshold: {(appConfig.cleanup.purgeThreshold * 100).toFixed(0)}%
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={5}
                      value={appConfig.cleanup.purgeThreshold * 100}
                      onChange={(e) =>
                        setAppConfig((c) =>
                          c
                            ? { ...c, cleanup: { ...c.cleanup, purgeThreshold: parseInt(e.target.value) / 100 } }
                            : c
                        )
                      }
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">Purge when storage reaches this % of limit.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Purge Interval (days)</label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={appConfig.cleanup.purgeIntervalDays}
                      onChange={(e) =>
                        setAppConfig((c) =>
                          c
                            ? { ...c, cleanup: { ...c.cleanup, purgeIntervalDays: parseInt(e.target.value) || 30 } }
                            : c
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">Purge records older than this many days.</p>
                  </div>
                  {appConfig.cleanup.lastDataCleanup && (
                    <p className="text-xs text-gray-500">
                      Last cleanup: {new Date(appConfig.cleanup.lastDataCleanup).toLocaleString()}
                    </p>
                  )}
                  {appConfigError && <p className="text-sm text-red-600">{appConfigError}</p>}
                  <button
                    onClick={saveAppConfig}
                    disabled={appConfigSaving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {appConfigSaving ? "Saving..." : "Save Config"}
                  </button>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Loading...</p>
              )}
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
                  onClick={() => handleSchedulerAction("createRecommendedJobs")}
                  disabled={schedulerLoading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Setup Default Schedule
                </button>
                <button
                  onClick={() => handleSchedulerAction("runPortfolio")}
                  disabled={schedulerLoading}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Run Portfolio Now
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
                <Link
                  href="/health"
                  className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 active:bg-gray-100"
                  aria-label="View system health status"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Health Status
                </Link>
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
                  <li><strong>Weekly Portfolio:</strong> Sun 6 PM</li>
                  <li><strong>Daily Options Scanner:</strong> Mon–Fri 4 PM</li>
                  <li><strong>Watchlist Snapshot:</strong> Mon–Fri 9 AM &amp; 4 PM</li>
                  <li><strong>Deliver Alerts:</strong> Mon–Fri 4:30 PM</li>
                  <li><strong>Data Cleanup:</strong> Daily 3 AM</li>
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
                disabled={prefsSaving || selectedAccountId === "__portfolio__"}
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

        {/* Strategy Settings Tab */}
        {activeTab === "strategy" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Strategy Settings</h3>
              <p className="text-sm text-gray-600 mb-6">
                Defaults used by xAIProfitBuilder when filtering option chains.
              </p>

              {strategySettingsLoading ? (
                <div className="flex items-center gap-3 text-gray-600">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  Loading strategy settings…
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-gray-200">
                      <p className="font-medium text-gray-900 mb-1">Covered Calls</p>
                      <p className="text-xs text-gray-500 mb-3">
                        Option chain filters for xAIProfitBuilder (calls).
                      </p>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Open Interest</label>
                      <input
                        type="number"
                        min={0}
                        value={strategyThresholdsForm.coveredCallMinOI}
                        onChange={(e) =>
                          setStrategyThresholdsForm((p) => ({
                            ...p,
                            coveredCallMinOI: Number(e.target.value),
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-3"
                      />
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Volume</label>
                      <input
                        type="number"
                        min={0}
                        value={strategyThresholdsForm.coveredCallMinVolume}
                        onChange={(e) =>
                          setStrategyThresholdsForm((p) => ({
                            ...p,
                            coveredCallMinVolume: Number(e.target.value),
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-3"
                      />
                      <label className="block text-xs font-medium text-gray-700 mb-1">Max Assignment Prob (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={strategyThresholdsForm.coveredCallMaxAssignProb}
                        onChange={(e) =>
                          setStrategyThresholdsForm((p) => ({
                            ...p,
                            coveredCallMaxAssignProb: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                      />
                      <p className="text-[11px] text-gray-500 mt-2">
                        OI/Vol ≥ threshold; 0 = no filter. Hide options with assignment prob &gt; max (100 = no filter).
                      </p>
                    </div>

                    <div className="p-4 rounded-xl border border-gray-200">
                      <p className="font-medium text-gray-900 mb-1">Cash-Secured Puts</p>
                      <p className="text-xs text-gray-500 mb-3">
                        Option chain filters for xAIProfitBuilder (puts).
                      </p>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Open Interest</label>
                      <input
                        type="number"
                        min={0}
                        value={strategyThresholdsForm.cashSecuredPutMinOI}
                        onChange={(e) =>
                          setStrategyThresholdsForm((p) => ({
                            ...p,
                            cashSecuredPutMinOI: Number(e.target.value),
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-3"
                      />
                      <label className="block text-xs font-medium text-gray-700 mb-1">Min Volume</label>
                      <input
                        type="number"
                        min={0}
                        value={strategyThresholdsForm.cashSecuredPutMinVolume}
                        onChange={(e) =>
                          setStrategyThresholdsForm((p) => ({
                            ...p,
                            cashSecuredPutMinVolume: Number(e.target.value),
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-3"
                      />
                      <label className="block text-xs font-medium text-gray-700 mb-1">Max Assignment Prob (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={strategyThresholdsForm.cashSecuredPutMaxAssignProb}
                        onChange={(e) =>
                          setStrategyThresholdsForm((p) => ({
                            ...p,
                            cashSecuredPutMaxAssignProb: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                      />
                      <p className="text-[11px] text-gray-500 mt-2">
                        OI/Vol ≥ threshold; 0 = no filter. Hide options with assignment prob &gt; max (100 = no filter).
                      </p>
                    </div>
                  </div>

                  {strategySettingsError && (
                    <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{strategySettingsError}</div>
                  )}
                  {strategySettingsMessage && (
                    <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">{strategySettingsMessage}</div>
                  )}

                  <button
                    onClick={saveStrategySettings}
                    disabled={strategySettingsSaving || !selectedAccountId || selectedAccountId === "__portfolio__"}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {strategySettingsSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Saving…
                      </>
                    ) : (
                      "Save Strategy Settings"
                    )}
                  </button>

                  {strategySettings && strategySettings._id !== "default" && (
                    <p className="text-[11px] text-gray-500">
                      Stored in MongoDB for this account.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scheduled Jobs Tab */}
        {activeTab === "jobs" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Manage Jobs</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Create, edit, and manage jobs. Each job references a job type.{" "}
                  <Link href="/job-types" className="text-blue-600 hover:underline">
                    Manage job types
                  </Link>
                </p>
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Create Job</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Name</label>
                    <input
                      value={jobForm.name}
                      onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      placeholder="e.g. Daily close report"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Job Type</label>
                    <select
                      value={jobForm.jobType}
                      onChange={(e) => setJobForm({ ...jobForm, jobType: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
                    >
                      {(() => {
                        const isPortfolio = selectedAccountId === "__portfolio__";
                        const filtered = jobTypes.filter((t) => t.enabled && (isPortfolio ? t.supportsPortfolio : t.supportsAccount));
                        if (filtered.length === 0) return <option value="">No job types</option>;
                        return (
                          <>
                            <option value="">Select job type</option>
                            {filtered.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </>
                        );
                      })()}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Time</label>
                    <input
                      type="time"
                      value={jobScheduleTime}
                      onChange={(e) => {
                        const v = e.target.value;
                        setJobScheduleTime(v);
                        setJobForm({ ...jobForm, scheduleCron: scheduleToCron(v, jobScheduleFreq) });
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Frequency</label>
                    <select
                      value={jobScheduleFreq}
                      onChange={(e) => {
                        const v = e.target.value as "daily" | "weekdays";
                        setJobScheduleFreq(v);
                        setJobForm({ ...jobForm, scheduleCron: scheduleToCron(jobScheduleTime, v) });
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
                    >
                      <option value="weekdays">Weekdays (Mon–Fri)</option>
                      <option value="daily">Daily</option>
                    </select>
                  </div>
                </div>
                {jobTypes.find((t) => t.id === jobForm.jobType)?.handlerKey === "portfoliosummary" && (
                  <label className="flex items-center gap-2 mb-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(jobForm.config?.includeAiInsights as boolean) ?? false}
                      onChange={(e) =>
                        setJobForm({ ...jobForm, config: { ...jobForm.config, includeAiInsights: e.target.checked } })
                      }
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Include AI insights (SmartXAI sentiment)</span>
                  </label>
                )}
                {jobTypes.find((t) => t.id === jobForm.jobType) && ["watchlistreport", "smartxai", "portfoliosummary"].includes(jobTypes.find((t) => t.id === jobForm.jobType)?.handlerKey ?? "") && (
                  <div className="mb-4">
                    <label className="block text-xs text-gray-500 mb-2">Message template</label>
                    <div className="flex flex-wrap gap-2">
                      {REPORT_TEMPLATES.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => setJobForm({ ...jobForm, templateId: template.id })}
                          className={`px-3 py-2 rounded-lg border-2 text-sm ${jobForm.templateId === template.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-gray-300"}`}
                        >
                          {template.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {jobTypes.find((t) => t.id === jobForm.jobType)?.handlerKey === "coveredCallScanner" && (
                  <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <h5 className="text-sm font-medium text-gray-700 mb-3">Covered Call Scanner Config</h5>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Min premium ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={(jobForm.config?.minPremium as number) ?? ""}
                          onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, minPremium: parseFloat(e.target.value) || undefined } })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                          placeholder="0.50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Max delta (0–1)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="1"
                          value={(jobForm.config?.maxDelta as number) ?? ""}
                          onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, maxDelta: parseFloat(e.target.value) || undefined } })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                          placeholder="0.35"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Min stock shares</label>
                        <input
                          type="number"
                          min="1"
                          value={(jobForm.config?.minStockShares as number) ?? ""}
                          onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, minStockShares: parseInt(e.target.value, 10) || undefined } })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                          placeholder="100"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">Symbols (comma-separated)</label>
                        <input
                          type="text"
                          value={Array.isArray(jobForm.config?.symbols) ? (jobForm.config.symbols as string[]).join(", ") : (jobForm.config?.symbols as string) ?? ""}
                          onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, symbols: e.target.value ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : undefined } })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                          placeholder="TSLA, AAPL"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Expiration min days</label>
                        <input
                          type="number"
                          min="0"
                          value={(jobForm.config?.expirationRange as { minDays?: number })?.minDays ?? ""}
                          onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, expirationRange: { ...((jobForm.config?.expirationRange as object) ?? {}), minDays: parseInt(e.target.value, 10) || undefined } } })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                          placeholder="7"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Expiration max days</label>
                        <input
                          type="number"
                          min="0"
                          value={(jobForm.config?.expirationRange as { maxDays?: number })?.maxDays ?? ""}
                          onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, expirationRange: { ...((jobForm.config?.expirationRange as object) ?? {}), maxDays: parseInt(e.target.value, 10) || undefined } } })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                          placeholder="45"
                        />
                      </div>
                    </div>
                  </div>
                )}
                {jobTypes.find((t) => t.id === jobForm.jobType)?.handlerKey === "protectivePutScanner" && (
                  <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <h5 className="text-sm font-medium text-gray-700 mb-3">Protective Put / CSP Config</h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Min yield (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={(jobForm.config?.minYield as number) ?? ""}
                          onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, minYield: parseFloat(e.target.value) || undefined } })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                          placeholder="20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Risk tolerance</label>
                        <select
                          value={(jobForm.config?.riskTolerance as string) ?? ""}
                          onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, riskTolerance: (e.target.value as "low" | "medium" | "high") || undefined } })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white"
                        >
                          <option value="">Default</option>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Watchlist ID</label>
                        <input
                          type="text"
                          value={(jobForm.config?.watchlistId as string) ?? ""}
                          onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, watchlistId: e.target.value.trim() || undefined } })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                          placeholder="Optional"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Min stock shares</label>
                        <input
                          type="number"
                          min="1"
                          value={(jobForm.config?.minStockShares as number) ?? ""}
                          onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, minStockShares: parseInt(e.target.value, 10) || undefined } })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                          placeholder="100"
                        />
                      </div>
                    </div>
                  </div>
                )}
                <div className="mb-4">
                  <label className="block text-xs text-gray-500 mb-2">Delivery channel</label>
                  <div className="flex flex-wrap gap-2">
                    {(["slack", "twitter"] as AlertDeliveryChannel[]).map((ch) => {
                      const chans = jobForm.channels ?? [];
                      const checked = chans.includes(ch);
                      return (
                        <label
                          key={ch}
                          className={`px-3 py-2 rounded-lg border cursor-pointer text-sm ${checked ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700"}`}
                        >
                          <input
                            type="checkbox"
                            className="mr-2"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) setJobForm({ ...jobForm, channels: [...chans, ch] });
                              else setJobForm({ ...jobForm, channels: chans.filter((c) => c !== ch) });
                            }}
                          />
                          {ch === "twitter" ? "X" : "Slack"}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      setJobFormError("");
                      const isPortfolio = selectedAccountId === "__portfolio__";
                      if (!selectedAccountId || (!isPortfolio && !accounts.some((a) => a._id === selectedAccountId)))
                        return setJobFormError("Select Portfolio or an account above");
                      const name = jobForm.name.trim();
                      if (!name) return setJobFormError("Name is required");
                      if (!jobForm.jobType) return setJobFormError("Select a job type");
                      if (!jobForm.scheduleCron.trim()) return setJobFormError("Schedule is required");
                      if (!(jobForm.channels ?? []).length) return setJobFormError("Select at least one delivery channel (Slack or X)");
                      setJobFormSaving(true);
                      try {
                        const isPortfolio = selectedAccountId === "__portfolio__";
                        const body = {
                          accountId: isPortfolio ? null : selectedAccountId,
                          name,
                          jobType: jobForm.jobType,
                          messageTemplate: jobForm.messageTemplate?.trim() || undefined,
                          scheduleCron: jobForm.scheduleCron,
                          templateId: jobForm.templateId,
                          config: jobForm.config,
                          channels: jobForm.channels,
                          status: "active",
                        };
                        const res = await fetch("/api/jobs", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(body),
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          setJobFormError(data.error || "Failed to create job");
                          return;
                        }
                        setJobForm({ ...jobForm, name: "" });
                        await fetchJobs();
                      } catch (err) {
                        setJobFormError("Failed to create job");
                      } finally {
                        setJobFormSaving(false);
                      }
                    }}
                    disabled={jobTypes.length === 0 || jobFormSaving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {jobFormSaving ? "Creating…" : "Create Job"}
                  </button>
                  {jobFormError && !showJobForm && (
                    <span className="text-sm text-red-600">{jobFormError}</span>
                  )}
                </div>
              </div>

              {jobTypes.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  Loading job types…
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  No jobs yet. Create one above.
                </div>
              ) : (
                <div className="space-y-3">
                  {jobs.map((j) => {
                    const typeInfo = jobTypes.find((t) => t.id === j.jobType);
                    const typeName = typeInfo?.name ?? j.jobType;
                    const template = getReportTemplate(j.templateId ?? "concise");
                    const scheduleFriendly = cronToHuman(j.scheduleCron ?? "0 16 * * 1-5");
                    const nextRunFriendly = j.nextRunAt
                      ? new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(j.nextRunAt))
                      : null;
                    return (
                      <div key={j._id} className="p-4 rounded-xl border border-gray-200 bg-gray-50">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">{j.name}</p>
                            <p className="text-sm text-gray-600 mt-1">Job type: {typeName}</p>
                            {["watchlistreport", "smartxai", "portfoliosummary"].includes(typeInfo?.handlerKey ?? "") && (
                              <p className="text-sm text-gray-600 mt-0.5">Template: {template.name}</p>
                            )}
                            {typeInfo?.handlerKey === "coveredCallScanner" && j.config && Object.keys(j.config).length > 0 && (
                              <p className="text-sm text-gray-500 mt-0.5">Config: {Object.entries(j.config)
                                .filter(([, v]) => v != null && v !== "")
                                .map(([k, v]) => `${k}: ${Array.isArray(v) ? (v as string[]).join(",") : v}`)
                                .join(" · ")}
                              </p>
                            )}
                            {typeInfo?.handlerKey === "protectivePutScanner" && j.config && Object.keys(j.config).length > 0 && (
                              <p className="text-sm text-gray-500 mt-0.5">Config: {Object.entries(j.config)
                                .filter(([, v]) => v != null && v !== "")
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" · ")}
                              </p>
                            )}
                            <p className="text-sm text-gray-600 mt-0.5">
                              Schedule: {scheduleFriendly}
                              {nextRunFriendly && (
                                <span className="text-gray-500"> · Next: {nextRunFriendly}</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500 mt-2">
                              Channels: {(j.channels ?? []).join(", ") || "—"} · Status: {j.status ?? "active"}
                            </p>
                            {j.lastRunAt && (
                              <p className="text-xs text-gray-500 mt-1">Last run: {new Date(j.lastRunAt).toLocaleString()}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => runJobNow(j._id)}
                              className="px-3 py-1.5 text-sm bg-white border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50"
                            >
                              Run now
                            </button>
                            <button
                              onClick={() => openEditJob(j)}
                              className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-100"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteJob(j._id)}
                              className="px-3 py-1.5 text-sm bg-white border border-red-200 text-red-700 rounded-lg hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>

            {showJobForm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold">
                      {editingJobId ? "Edit Job" : "New Job"}
                    </h4>
                    <button onClick={() => setShowJobForm(false)} className="text-gray-400 hover:text-gray-600">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {jobFormError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      {jobFormError}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Job Name</label>
                      <input
                        value={jobForm.name}
                        onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                        placeholder="e.g. Daily close report"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
                      <select
                        value={jobForm.jobType}
                        onChange={(e) => setJobForm({ ...jobForm, jobType: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white"
                      >
                        {(() => {
                          const isPortfolio = selectedAccountId === "__portfolio__";
                          const filtered = jobTypes.filter((t) => t.enabled && (isPortfolio ? t.supportsPortfolio : t.supportsAccount));
                          if (filtered.length === 0) return <option value="">No job types available</option>;
                          return (
                            <>
                              <option value="">Select job type</option>
                              {filtered.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </>
                          );
                        })()}
                      </select>
                    </div>
                    {jobTypes.find((t) => t.id === jobForm.jobType)?.handlerKey === "coveredCallScanner" && (
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <h5 className="text-sm font-medium text-gray-700 mb-3">Covered Call Scanner Config</h5>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Min premium ($)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={(jobForm.config?.minPremium as number) ?? ""}
                              onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, minPremium: parseFloat(e.target.value) || undefined } })}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                              placeholder="0.50"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Max delta (0–1)</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="1"
                              value={(jobForm.config?.maxDelta as number) ?? ""}
                              onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, maxDelta: parseFloat(e.target.value) || undefined } })}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                              placeholder="0.35"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Min stock shares</label>
                            <input
                              type="number"
                              min="1"
                              value={(jobForm.config?.minStockShares as number) ?? ""}
                              onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, minStockShares: parseInt(e.target.value, 10) || undefined } })}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                              placeholder="100"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Symbols (comma-separated)</label>
                            <input
                              type="text"
                              value={Array.isArray(jobForm.config?.symbols) ? (jobForm.config.symbols as string[]).join(", ") : (jobForm.config?.symbols as string) ?? ""}
                              onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, symbols: e.target.value ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : undefined } })}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                              placeholder="TSLA, AAPL"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Expiration min days</label>
                            <input
                              type="number"
                              min="0"
                              value={(jobForm.config?.expirationRange as { minDays?: number })?.minDays ?? ""}
                              onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, expirationRange: { ...((jobForm.config?.expirationRange as object) ?? {}), minDays: parseInt(e.target.value, 10) || undefined } } })}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                              placeholder="7"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Expiration max days</label>
                            <input
                              type="number"
                              min="0"
                              value={(jobForm.config?.expirationRange as { maxDays?: number })?.maxDays ?? ""}
                              onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, expirationRange: { ...((jobForm.config?.expirationRange as object) ?? {}), maxDays: parseInt(e.target.value, 10) || undefined } } })}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                              placeholder="45"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    {jobTypes.find((t) => t.id === jobForm.jobType)?.handlerKey === "protectivePutScanner" && (
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <h5 className="text-sm font-medium text-gray-700 mb-3">Protective Put / CSP Config</h5>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Min yield (%)</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={(jobForm.config?.minYield as number) ?? ""}
                              onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, minYield: parseFloat(e.target.value) || undefined } })}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                              placeholder="20"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Risk tolerance</label>
                            <select
                              value={(jobForm.config?.riskTolerance as string) ?? ""}
                              onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, riskTolerance: (e.target.value as "low" | "medium" | "high") || undefined } })}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white"
                            >
                              <option value="">Default</option>
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Watchlist ID</label>
                            <input
                              type="text"
                              value={(jobForm.config?.watchlistId as string) ?? ""}
                              onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, watchlistId: e.target.value.trim() || undefined } })}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                              placeholder="Optional"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Min stock shares</label>
                            <input
                              type="number"
                              min="1"
                              value={(jobForm.config?.minStockShares as number) ?? ""}
                              onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, minStockShares: parseInt(e.target.value, 10) || undefined } })}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                              placeholder="100"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    {jobTypes.find((t) => t.id === jobForm.jobType)?.handlerKey === "OptionScanner" && (
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <h5 className="text-sm font-medium text-gray-700 mb-3">Option Scanner Config</h5>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">HOLD DTE min</label>
                            <input
                              type="number"
                              value={jobForm.scannerConfig?.holdDteMin ?? 14}
                              onChange={(e) => setJobForm({ ...jobForm, scannerConfig: { ...jobForm.scannerConfig, holdDteMin: parseInt(e.target.value, 10) || undefined } })}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">BTC DTE max</label>
                            <input
                              type="number"
                              value={jobForm.scannerConfig?.btcDteMax ?? 7}
                              onChange={(e) => setJobForm({ ...jobForm, scannerConfig: { ...jobForm.scannerConfig, btcDteMax: parseInt(e.target.value, 10) || undefined } })}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">BTC stop loss %</label>
                            <input
                              type="number"
                              value={jobForm.scannerConfig?.btcStopLossPercent ?? -50}
                              onChange={(e) => setJobForm({ ...jobForm, scannerConfig: { ...jobForm.scannerConfig, btcStopLossPercent: parseInt(e.target.value, 10) || undefined } })}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">HOLD time value % min</label>
                            <input
                              type="number"
                              value={jobForm.scannerConfig?.holdTimeValuePercentMin ?? 20}
                              onChange={(e) => setJobForm({ ...jobForm, scannerConfig: { ...jobForm.scannerConfig, holdTimeValuePercentMin: parseInt(e.target.value, 10) || undefined } })}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">High IV % (puts)</label>
                            <input
                              type="number"
                              value={jobForm.scannerConfig?.highVolatilityPercent ?? 30}
                              onChange={(e) => setJobForm({ ...jobForm, scannerConfig: { ...jobForm.scannerConfig, highVolatilityPercent: parseInt(e.target.value, 10) || undefined } })}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    {jobTypes.find((t) => t.id === jobForm.jobType)?.handlerKey === "portfoliosummary" && (
                      <label className="flex items-center gap-2 mb-4 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(jobForm.config?.includeAiInsights as boolean) ?? false}
                          onChange={(e) =>
                            setJobForm({ ...jobForm, config: { ...jobForm.config, includeAiInsights: e.target.checked } })
                          }
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Include AI insights (SmartXAI sentiment)</span>
                      </label>
                    )}
                    {jobTypes.find((t) => t.id === jobForm.jobType) && ["watchlistreport", "smartxai", "portfoliosummary"].includes(jobTypes.find((t) => t.id === jobForm.jobType)?.handlerKey ?? "") && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Message template</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {REPORT_TEMPLATES.map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => setJobForm({ ...jobForm, templateId: template.id })}
                              className={`p-2 rounded-lg border-2 text-left text-sm ${jobForm.templateId === template.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
                            >
                              {template.name}
                            </button>
                          ))}
                        </div>
                        <div className="mt-2">
                          <label className="block text-xs text-gray-500 mb-1">Custom template (optional)</label>
                          <textarea
                            value={jobForm.customSlackTemplate}
                            onChange={(e) => setJobForm({ ...jobForm, customSlackTemplate: e.target.value })}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm font-mono"
                            rows={2}
                            placeholder="Leave empty to use selected template"
                          />
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Message template (optional)</label>
                      <p className="text-xs text-gray-500 mb-1">Override default alert/report message. Placeholders: {"{date}"}, {"{reportName}"}, {"{account}"}, {"{stocks}"}, {"{options}"}</p>
                      <textarea
                        value={jobForm.messageTemplate ?? ""}
                        onChange={(e) => setJobForm({ ...jobForm, messageTemplate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                        rows={2}
                        placeholder="Leave empty for default"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Schedule</label>
                      <div className="mb-3">
                        <label className="block text-xs text-gray-500 mb-1">Quick presets</label>
                        <select
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white"
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!v) return;
                            const presets: Record<string, { cron: string; time: string; freq: "daily" | "weekdays" }> = {
                              "0 16 * * 1-5": { cron: "0 16 * * 1-5", time: "16:00", freq: "weekdays" },
                              "0 9 * * 1-5": { cron: "0 9 * * 1-5", time: "09:00", freq: "weekdays" },
                              "0 16 * * *": { cron: "0 16 * * *", time: "16:00", freq: "daily" },
                              "0 9 * * *": { cron: "0 9 * * *", time: "09:00", freq: "daily" },
                            };
                            const p = presets[v];
                            if (p) {
                              setJobScheduleTime(p.time);
                              setJobScheduleFreq(p.freq);
                              setJobForm({ ...jobForm, scheduleCron: p.cron });
                            }
                          }}
                        >
                          <option value="">Choose preset…</option>
                          <option value="0 16 * * 1-5">Weekdays 4:00 PM</option>
                          <option value="0 9 * * 1-5">Weekdays 9:00 AM</option>
                          <option value="0 16 * * *">Daily 4:00 PM</option>
                          <option value="0 9 * * *">Daily 9:00 AM</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Frequency</label>
                          <select
                            value={jobScheduleFreq}
                            onChange={(e) => {
                              const v = e.target.value as "daily" | "weekdays";
                              setJobScheduleFreq(v);
                              setJobForm({ ...jobForm, scheduleCron: scheduleToCron(jobScheduleTime, v) });
                            }}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white"
                          >
                            <option value="daily">Daily</option>
                            <option value="weekdays">Weekdays (Mon–Fri)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Time (24h)</label>
                          <input
                            type="time"
                            value={jobScheduleTime}
                            onChange={(e) => {
                              const v = e.target.value;
                              setJobScheduleTime(v);
                              setJobForm({ ...jobForm, scheduleCron: scheduleToCron(v, jobScheduleFreq) });
                            }}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Cron (edit if needed)</label>
                        <input
                          value={jobForm.scheduleCron}
                          onChange={(e) => setJobForm({ ...jobForm, scheduleCron: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm"
                          placeholder="0 16 * * 1-5"
                        />
                        <p className="text-xs text-gray-500 mt-1">minute hour day month dow · e.g. <span className="font-mono">0 16 * * 1-5</span> = 4 PM Mon–Fri</p>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Channels</label>
                      <div className="flex flex-wrap gap-2">
                        {(["slack", "push", "twitter"] as AlertDeliveryChannel[]).map((ch) => {
                          const chans = jobForm.channels ?? [];
                          const checked = chans.includes(ch);
                          return (
                            <label
                              key={ch}
                              className={`px-3 py-2 rounded-lg border cursor-pointer text-sm ${checked ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700"}`}
                            >
                              <input
                                type="checkbox"
                                className="mr-2"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) setJobForm({ ...jobForm, channels: [...chans, ch] });
                                  else setJobForm({ ...jobForm, channels: chans.filter((c) => c !== ch) });
                                }}
                              />
                              {ch === "twitter" ? "X" : ch}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        value={jobForm.status}
                        onChange={(e) => setJobForm({ ...jobForm, status: e.target.value as "active" | "paused" })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white"
                      >
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        onClick={() => setShowJobForm(false)}
                        className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveJob}
                        disabled={jobFormSaving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {jobFormSaving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
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

export default function AutomationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <AutomationContent />
    </Suspense>
  );
}
