"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import type {
  Account,
  AlertDeliveryChannel,
  AlertTemplateId,
  AlertFrequency,
  AlertSeverity,
  Broker,
  StrategySettings,
} from "@/types/portfolio";
import { ALERT_TEMPLATES, ALERT_CHANNEL_COSTS } from "@/types/portfolio";
import {
  requestPushPermission,
  registerPushSubscription,
  showDirectNotification,
} from "@/lib/push-client";
import { useDisplayTimezone } from "@/hooks/useDisplayTimezone";
import { TIMEZONE_OPTIONS } from "@/lib/date-format";
import { BrokerImportPanel } from "@/components/BrokerImportPanel";
import { getPersonaKeys, PERSONAS } from "@/lib/chat-personas";
import { getBrokerLogoUrlFromName } from "@/lib/broker-logo-url";

type TestChannel = "slack" | "twitter" | "push";


function AutomationContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("__portfolio__");

  // Alert preferences state
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<"separation" | "auth-users" | "settings" | "strategy" | "chat" | "brokers">("auth-users");

  // Default Setup to Portfolio when visiting /automation with no tab
  useEffect(() => {
    if (pathname === "/automation" && !tabParam) {
      router.replace("/automation/portfolio");
    }
  }, [pathname, tabParam, router]);
  useEffect(() => {
    if (pathname === "/automation" && tabParam === "xtools") {
      router.replace("/automation/xtools");
    }
  }, [pathname, tabParam, router]);

  useEffect(() => {
    if (tabParam === "separation" || tabParam === "settings" || tabParam === "strategy" || tabParam === "auth-users" || tabParam === "chat" || tabParam === "brokers") {
      setActiveTab(tabParam);
    }
  }, [tabParam]);
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
  // Strategy settings (min OI filters for xStrategyBuilder option chains)
  const [strategySettingsLoading, setStrategySettingsLoading] = useState(false);
  const [strategySettingsSaving, setStrategySettingsSaving] = useState(false);
  const [strategySettingsMessage, setStrategySettingsMessage] = useState<string>("");
  const [strategySettingsError, setStrategySettingsError] = useState<string>("");
  const [strategySettings, setStrategySettings] = useState<StrategySettings | null>(null);
  const [strategyThresholdsForm, setStrategyThresholdsForm] = useState({
    excludeWatchlist: true,
    coveredCallMinOI: 500,
    cashSecuredPutMinOI: 500,
    coveredCallMinVolume: 0,
    cashSecuredPutMinVolume: 0,
    coveredCallMaxAssignProb: 100,
    cashSecuredPutMaxAssignProb: 100,
  });
  // Message template JSON editor
  const [templateEditorTab, setTemplateEditorTab] = useState<"alert" | "report">("alert");
  const [alertTemplatesJson, setAlertTemplatesJson] = useState("");
  const [reportTemplatesJson, setReportTemplatesJson] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  // Auth Users (X allowed usernames) — auth_users table
  const [authUsersList, setAuthUsersList] = useState<{ username: string; createdAt: string }[]>([]);
  const [authUsersLoading, setAuthUsersLoading] = useState(false);
  const [authUsersError, setAuthUsersError] = useState<string | null>(null);
  const [authUsersNewUsername, setAuthUsersNewUsername] = useState("");
  const [authUsersAdding, setAuthUsersAdding] = useState(false);
  const [authUsersSeedResult, setAuthUsersSeedResult] = useState<string | null>(null);

  // Brokers (for account association + logo on manage accounts)
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [brokersLoading, setBrokersLoading] = useState(false);
  const [brokersError, setBrokersError] = useState<string | null>(null);
  const [brokerForm, setBrokerForm] = useState({ name: "" });
  const [editingBroker, setEditingBroker] = useState<Broker | null>(null);
  const [brokersSaving, setBrokersSaving] = useState(false);

  const { timezone: displayTimezone, formatDate, setTimezone: setDisplayTimezone } = useDisplayTimezone();
  const [profileTimezone, setProfileTimezone] = useState(displayTimezone);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  useEffect(() => {
    setProfileTimezone(displayTimezone);
  }, [displayTimezone]);

  // App config (cleanup settings in appUtil collection)
  const [appConfig, setAppConfig] = useState<{
    cleanup: { storageLimitMB: number; purgeThreshold: number; purgeIntervalDays: number; lastDataCleanup?: string };
    storage?: { dataSizeMB: number; percentOfLimit: number };
  } | null>(null);
  const [appConfigSaving, setAppConfigSaving] = useState(false);
  const [appConfigError, setAppConfigError] = useState<string | null>(null);

  // Grok / AI Chat config (persona + system prompt override + effective prompts from collection)
  const [chatConfig, setChatConfig] = useState<{
    context: { persona?: string; systemPromptOverride?: string; riskProfile?: string; strategyGoals?: string };
    personaPromptTexts?: Record<string, string>;
  } | null>(null);
  const [chatConfigLoading, setChatConfigLoading] = useState(false);
  const [chatConfigSaving, setChatConfigSaving] = useState(false);
  const [chatConfigMessage, setChatConfigMessage] = useState("");
  /** When editing "default for this persona", this is the text to save to the collection. */
  const [personaPromptEdit, setPersonaPromptEdit] = useState("");
  /** Add new persona form */
  const [newPersonaKey, setNewPersonaKey] = useState("");
  const [newPersonaPrompt, setNewPersonaPrompt] = useState("");

  // Alert preview state
  const [_pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | null>(null);
  const [enablingPush, setEnablingPush] = useState(false);

  const fetchAuthUsers = useCallback(async () => {
    setAuthUsersLoading(true);
    setAuthUsersError(null);
    try {
      const res = await fetch("/api/x-allowed-usernames");
      if (!res.ok) {
        setAuthUsersError("Failed to load allowed usernames");
        setAuthUsersList([]);
        return;
      }
      const data = (await res.json()) as { username: string; createdAt: string }[];
      setAuthUsersList(Array.isArray(data) ? data : []);
    } finally {
      setAuthUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "auth-users") fetchAuthUsers();
  }, [activeTab, fetchAuthUsers]);

  const fetchBrokers = useCallback(async () => {
    setBrokersLoading(true);
    setBrokersError(null);
    try {
      const res = await fetch("/api/brokers");
      if (!res.ok) {
        setBrokersError("Failed to load brokers");
        setBrokers([]);
        return;
      }
      const data = await res.json();
      setBrokers(Array.isArray(data) ? data : []);
    } catch {
      setBrokersError("Failed to load brokers");
      setBrokers([]);
    } finally {
      setBrokersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "brokers") fetchBrokers();
  }, [activeTab, fetchBrokers]);

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
      setStrategyThresholdsForm((p) => ({
        ...p,
        excludeWatchlist: settings.excludeWatchlist !== false,
        coveredCallMinOI: settings.thresholds?.["covered-call"]?.minOpenInterest ?? 500,
        cashSecuredPutMinOI: settings.thresholds?.["cash-secured-put"]?.minOpenInterest ?? 500,
        coveredCallMinVolume: settings.thresholds?.["covered-call"]?.minVolume ?? 0,
        cashSecuredPutMinVolume: settings.thresholds?.["cash-secured-put"]?.minVolume ?? 0,
        coveredCallMaxAssignProb: settings.thresholds?.["covered-call"]?.maxAssignmentProbability ?? 100,
        cashSecuredPutMaxAssignProb: settings.thresholds?.["cash-secured-put"]?.maxAssignmentProbability ?? 100,
      }));
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

  const fetchChatConfig = useCallback(async () => {
    setChatConfigLoading(true);
    setChatConfigMessage("");
    try {
      const res = await fetch("/api/chat/config", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data?.context) {
        setChatConfig({
          context: data.context,
          personaPromptTexts: data.personaPromptTexts ?? {},
        });
        const persona = data.context?.persona ?? "finance-expert";
        const texts = data.personaPromptTexts ?? {};
        setPersonaPromptEdit(texts[persona] ?? "");
      } else {
        setChatConfig({ context: { persona: "finance-expert", systemPromptOverride: "" }, personaPromptTexts: {} });
        setPersonaPromptEdit("");
      }
    } catch {
      setChatConfigMessage("Failed to load chat config");
      setChatConfig({ context: { persona: "finance-expert", systemPromptOverride: "" }, personaPromptTexts: {} });
      setPersonaPromptEdit("");
    } finally {
      setChatConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "chat") fetchChatConfig();
  }, [activeTab, fetchChatConfig]);

  const saveChatConfig = async () => {
    if (!chatConfig?.context) return;
    setChatConfigSaving(true);
    setChatConfigMessage("");
    try {
      const body: { context?: Record<string, unknown>; personaPrompts?: Record<string, string> } = {
        context: {
          persona: chatConfig.context.persona || undefined,
          systemPromptOverride: chatConfig.context.systemPromptOverride?.trim() || undefined,
        },
      };
      const persona = chatConfig.context.persona;
      if (persona && personaPromptEdit.trim() !== "") {
        body.personaPrompts = { [persona]: personaPromptEdit.trim() };
      }
      const res = await fetch("/api/chat/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setChatConfigMessage("Chat config saved.");
        setTimeout(() => setChatConfigMessage(""), 3000);
        await fetchChatConfig();
      } else {
        const data = await res.json();
        setChatConfigMessage(data?.error ?? "Failed to save");
      }
    } catch {
      setChatConfigMessage("Failed to save chat config");
    } finally {
      setChatConfigSaving(false);
    }
  };

  const savePersonaPromptOnly = async () => {
    const persona = chatConfig?.context?.persona;
    if (!persona) return;
    setChatConfigSaving(true);
    setChatConfigMessage("");
    try {
      const res = await fetch("/api/chat/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaPrompts: { [persona]: personaPromptEdit.trim() },
        }),
      });
      if (res.ok) {
        setChatConfigMessage("Default prompt for this persona saved to collection.");
        setTimeout(() => setChatConfigMessage(""), 3000);
        await fetchChatConfig();
      } else {
        const data = await res.json();
        setChatConfigMessage(data?.error ?? "Failed to save");
      }
    } catch {
      setChatConfigMessage("Failed to save");
    } finally {
      setChatConfigSaving(false);
    }
  };

  const addNewPersona = async () => {
    const key = newPersonaKey.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
    if (!key || !newPersonaPrompt.trim()) {
      setChatConfigMessage("Enter a key (e.g. growth-investor) and prompt.");
      return;
    }
    if (key in PERSONAS) {
      setChatConfigMessage("This key is already a built-in persona. Use a different key.");
      return;
    }
    setChatConfigSaving(true);
    setChatConfigMessage("");
    try {
      const res = await fetch("/api/chat/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaPrompts: { [key]: newPersonaPrompt.trim() } }),
      });
      if (res.ok) {
        setChatConfigMessage("Persona added.");
        setNewPersonaKey("");
        setNewPersonaPrompt("");
        setTimeout(() => setChatConfigMessage(""), 3000);
        await fetchChatConfig();
      } else {
        const data = await res.json();
        setChatConfigMessage(data?.error ?? "Failed to add");
      }
    } catch {
      setChatConfigMessage("Failed to add persona");
    } finally {
      setChatConfigSaving(false);
    }
  };

  const removePersona = async (personaKey: string) => {
    if (personaKey in PERSONAS) {
      setChatConfigMessage("Cannot remove built-in personas.");
      return;
    }
    setChatConfigSaving(true);
    setChatConfigMessage("");
    try {
      const res = await fetch("/api/chat/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaPrompts: { [personaKey]: null } }),
      });
      if (res.ok) {
        setChatConfigMessage("Persona removed.");
        if (chatConfig?.context?.persona === personaKey) {
          setChatConfig((c) => (c ? { ...c, context: { ...c.context, persona: "finance-expert" } } : c));
        }
        setTimeout(() => setChatConfigMessage(""), 3000);
        await fetchChatConfig();
      } else {
        const data = await res.json();
        setChatConfigMessage(data?.error ?? "Failed to remove");
      }
    } catch {
      setChatConfigMessage("Failed to remove");
    } finally {
      setChatConfigSaving(false);
    }
  };

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
          excludeWatchlist: Boolean(strategyThresholdsForm.excludeWatchlist),
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

  return (
    <>
        {/* Separation Tab — Broker import (Merrill + Fidelity) */}
        {activeTab === "separation" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Broker import workflow</h3>
              <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1 mb-2">
                <li><strong>Export</strong> — From Merrill Edge or Fidelity, export Activities (transactions) or Holdings (positions) as CSV.</li>
                <li><strong>Parse &amp; preview</strong> — Choose broker and export type, upload CSV, then Parse to see accounts and counts.</li>
                <li><strong>Import</strong> — Map each broker account to an app account and click Import. No intermediate JSON file.</li>
              </ol>
            </div>
            <BrokerImportPanel accounts={accounts} />
          </div>
        )}

        {/* Auth Users Tab */}
        {activeTab === "auth-users" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">X allowed usernames</h3>
              <p className="text-sm text-gray-600 mb-4">
                Only these usernames can sign in with X. Add or remove below. No user IDs are stored — only usernames.
              </p>
              {authUsersError && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{authUsersError}</div>
              )}
              {authUsersSeedResult && (
                <div className="mb-4 p-3 rounded-lg bg-green-50 text-green-700 text-sm">{authUsersSeedResult}</div>
              )}
              <form
                className="flex flex-wrap gap-2 mb-6"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!authUsersNewUsername.trim() || authUsersAdding) return;
                  setAuthUsersAdding(true);
                  setAuthUsersError(null);
                  try {
                    const res = await fetch("/api/x-allowed-usernames", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ username: authUsersNewUsername.trim() }),
                    });
                    const data = (await res.json()) as { error?: string };
                    if (!res.ok) {
                      setAuthUsersError(data.error ?? "Failed to add");
                      return;
                    }
                    setAuthUsersNewUsername("");
                    await fetchAuthUsers();
                  } finally {
                    setAuthUsersAdding(false);
                  }
                }}
              >
                <input
                  type="text"
                  value={authUsersNewUsername}
                  onChange={(e) => setAuthUsersNewUsername(e.target.value)}
                  placeholder="Username (e.g. myhandle)"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-48"
                  aria-label="New X username"
                />
                <button
                  type="submit"
                  disabled={authUsersAdding || !authUsersNewUsername.trim()}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium"
                >
                  {authUsersAdding ? "Adding…" : "Add"}
                </button>
              </form>
              <p className="text-xs text-gray-500 mb-3">
                To seed from env: set <code className="bg-gray-100 px-1 rounded">ALLOWED_X_USERNAMES</code> (comma-separated) and click Seed below.
              </p>
              <button
                type="button"
                onClick={async () => {
                  setAuthUsersSeedResult(null);
                  setAuthUsersError(null);
                  try {
                    const res = await fetch("/api/x-allowed-usernames/seed", { method: "POST" });
                    const data = (await res.json()) as { ok?: boolean; added?: number; error?: string };
                    if (!res.ok) {
                      setAuthUsersError(data.error ?? "Seed failed");
                      return;
                    }
                    setAuthUsersSeedResult(
                      data.added !== undefined ? `Seeded ${data.added} username(s) from env.` : "Seed completed."
                    );
                    await fetchAuthUsers();
                  } catch {
                    setAuthUsersError("Seed request failed");
                  }
                }}
                className="mb-4 px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
              >
                Seed from env
              </button>
              {authUsersLoading ? (
                <p className="text-gray-500">Loading…</p>
              ) : authUsersList.length === 0 ? (
                <p className="text-gray-500">No usernames yet. Add one above or seed from env.</p>
              ) : (
                <ul className="space-y-2">
                  {authUsersList.map((u) => (
                    <li
                      key={u.username}
                      className="flex items-center justify-between gap-4 p-3 rounded-lg border border-gray-200 bg-gray-50/50"
                    >
                      <span className="font-medium text-gray-800">@{u.username}</span>
                      <span className="text-sm text-gray-500">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch("/api/x-allowed-usernames", {
                              method: "DELETE",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ username: u.username }),
                            });
                            if (res.ok) await fetchAuthUsers();
                            else setAuthUsersError("Failed to remove");
                          } catch {
                            setAuthUsersError("Request failed");
                          }
                        }}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Brokers tab — manage brokers for account logos */}
        {activeTab === "brokers" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Brokers</h3>
              <p className="text-sm text-gray-600 mb-4">
                Add brokers to show logos on Manage Accounts. Assign a broker to each account when creating or editing the account.
              </p>
              {brokersError && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{brokersError}</div>
              )}
              <form
                className="flex flex-wrap gap-3 mb-6 p-4 rounded-xl border border-gray-200 bg-gray-50/50"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const name = brokerForm.name.trim();
                  if (!name || brokersSaving) return;
                  setBrokersSaving(true);
                  setBrokersError(null);
                  try {
                    const url = editingBroker
                      ? `/api/brokers/${editingBroker._id}`
                      : "/api/brokers";
                    const res = await fetch(url, {
                      method: editingBroker ? "PUT" : "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name }),
                    });
                    const data = (await res.json()) as { error?: string };
                    if (!res.ok) {
                      setBrokersError(data.error ?? "Failed to save");
                      return;
                    }
                    setBrokerForm({ name: "" });
                    setEditingBroker(null);
                    await fetchBrokers();
                  } finally {
                    setBrokersSaving(false);
                  }
                }}
              >
                <input
                  type="text"
                  value={brokerForm.name}
                  onChange={(e) => setBrokerForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Broker name (e.g. Merrill, Fidelity)"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 w-48"
                  required
                />
                <button
                  type="submit"
                  disabled={brokersSaving || !brokerForm.name.trim()}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium"
                >
                  {brokersSaving ? "Saving…" : editingBroker ? "Update" : "Add"}
                </button>
                {editingBroker && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBroker(null);
                      setBrokerForm({ name: "" });
                    }}
                    className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                )}
              </form>
              {brokersLoading ? (
                <p className="text-gray-500">Loading…</p>
              ) : brokers.length === 0 ? (
                <p className="text-gray-500">No brokers yet. Add one above, then assign to accounts in Manage Accounts.</p>
              ) : (
                <ul className="space-y-2">
                  {brokers.map((b) => {
                    const logoSrc = getBrokerLogoUrlFromName(b.name) ?? `/api/brokers/${b._id}/logo`;
                    return (
                    <li
                      key={b._id}
                      className="flex items-center gap-4 p-3 rounded-lg border border-gray-200 bg-gray-50/50"
                    >
                      <div className="w-8 h-8 rounded object-contain bg-white shrink-0 flex items-center justify-center overflow-hidden relative">
                        <img
                          src={logoSrc}
                          alt=""
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                          }}
                        />
                        <div className="hidden w-full h-full rounded-full bg-gray-300 flex items-center justify-center text-sm font-medium text-gray-600 absolute inset-0">
                          {(b.name ?? "?").charAt(0).toUpperCase()}
                        </div>
                      </div>
                      <span className="font-medium text-gray-800 flex-1">{b.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBroker(b);
                          setBrokerForm({ name: b.name });
                        }}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Remove broker "${b.name}"? Accounts using it will keep the reference but show no logo until reassigned.`)) return;
                          try {
                            const res = await fetch(`/api/brokers/${b._id}`, { method: "DELETE" });
                            if (res.ok) await fetchBrokers();
                            else setBrokersError("Failed to remove");
                          } catch {
                            setBrokersError("Request failed");
                          }
                        }}
                        className="text-sm text-red-600 hover:text-red-800 font-medium"
                      >
                        Remove
                      </button>
                    </li>
                  );})}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* AI Chat config tab — persona & system prompt (same config as chat page) */}
        {activeTab === "chat" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">AI Chat (Grok) config</h3>
              <p className="text-sm text-gray-600 mb-4">
                Default persona and system prompt for the Grok chat. Default prompts are stored in the collection (or fall back to app defaults). Choose a persona and optionally edit or save its default prompt below.
              </p>
              {chatConfigLoading ? (
                <div className="flex items-center gap-3 text-gray-600 py-4">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  Loading…
                </div>
              ) : chatConfig?.context ? (
                <div className="space-y-4 max-w-3xl">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Persona</label>
                    <select
                      value={chatConfig.context.persona ?? "finance-expert"}
                      onChange={(e) => {
                        const persona = e.target.value || undefined;
                        setChatConfig((c) =>
                          c ? { ...c, context: { ...c.context, persona } } : c
                        );
                        const texts = chatConfig.personaPromptTexts ?? {};
                        setPersonaPromptEdit(persona ? (texts[persona] ?? "") : "");
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      {getPersonaKeys().map((k) => (
                        <option key={k} value={k}>
                          {k === "finance-expert" ? "Finance Expert (default)" : k.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                        </option>
                      ))}
                      {(Object.keys(chatConfig.personaPromptTexts ?? {}).filter((k) => !(k in PERSONAS)) as string[]).map((k) => (
                        <option key={k} value={k}>
                          {k.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} (custom)
                        </option>
                      ))}
                      <option value="">Custom only (use override below)</option>
                    </select>
                  </div>
                  {chatConfig.context.persona && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Default system prompt for this persona (kept in collection)
                      </label>
                      <p className="text-xs text-gray-500 mb-1">
                        Shown when this persona is selected. Stored in appUtil; edit and save to change the default for this persona.
                      </p>
                      <textarea
                        value={personaPromptEdit}
                        onChange={(e) => setPersonaPromptEdit(e.target.value)}
                        placeholder="Default prompt for this persona…"
                        rows={6}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={savePersonaPromptOnly}
                          disabled={chatConfigSaving}
                          className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm"
                        >
                          {chatConfigSaving ? "Saving…" : "Save as default for this persona"}
                        </button>
                        {chatConfig.context.persona && !(chatConfig.context.persona in PERSONAS) && (
                          <button
                            type="button"
                            onClick={() => removePersona(chatConfig.context.persona!)}
                            disabled={chatConfigSaving}
                            className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 text-sm"
                          >
                            Remove this persona
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Add new persona</h4>
                    <p className="text-xs text-gray-500 mb-2">Create a custom persona with its own system prompt. Use a short key (e.g. growth-investor).</p>
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        value={newPersonaKey}
                        onChange={(e) => setNewPersonaKey(e.target.value)}
                        placeholder="Key (e.g. growth-investor)"
                        className="w-full max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                      />
                      <textarea
                        value={newPersonaPrompt}
                        onChange={(e) => setNewPersonaPrompt(e.target.value)}
                        placeholder="System prompt for this persona…"
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                      />
                      <button
                        type="button"
                        onClick={addNewPersona}
                        disabled={chatConfigSaving || !newPersonaKey.trim() || !newPersonaPrompt.trim()}
                        className="w-fit px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                      >
                        {chatConfigSaving ? "Saving…" : "Add persona"}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">System prompt override (optional)</label>
                    <p className="text-xs text-gray-500 mb-1">Used instead of the persona default when set. Leave empty to use the default above.</p>
                    <textarea
                      value={chatConfig.context.systemPromptOverride ?? ""}
                      onChange={(e) =>
                        setChatConfig((c) =>
                          c ? { ...c, context: { ...c.context, systemPromptOverride: e.target.value } } : c
                        )
                      }
                      placeholder="Override to use fully custom instructions for this session."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                    />
                  </div>
                  {chatConfigMessage && (
                    <p className={`text-sm ${chatConfigMessage.startsWith("Failed") ? "text-red-600" : "text-green-600"}`}>
                      {chatConfigMessage}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={saveChatConfig}
                    disabled={chatConfigSaving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                  >
                    {chatConfigSaving ? "Saving…" : "Save chat config"}
                  </button>
                </div>
              ) : null}
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
            {/* Profile: Display timezone */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile</h3>
              <p className="text-sm text-gray-600 mb-4">Dates and times across the app (scheduler, alerts, reports) use this timezone.</p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="font-medium text-gray-700">Display timezone</label>
                <select
                  value={profileTimezone}
                  onChange={(e) => setProfileTimezone(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
                >
                  {TIMEZONE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    setProfileSaving(true);
                    setProfileMessage("");
                    try {
                      await setDisplayTimezone(profileTimezone);
                      setProfileMessage("Timezone saved.");
                    } catch {
                      setProfileMessage("Failed to save.");
                    } finally {
                      setProfileSaving(false);
                    }
                  }}
                  disabled={profileSaving || profileTimezone === displayTimezone}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {profileSaving ? "Saving..." : "Save"}
                </button>
                {profileMessage && <span className="text-sm text-gray-600">{profileMessage}</span>}
              </div>
            </div>

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

                {/* X */}
                <div className={`p-4 rounded-xl border-2 ${prefsForm.channels.twitter.enabled ? "border-gray-800 bg-gray-50" : "border-gray-200"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">𝕏</span>
                      <div>
                        <p className="font-medium">X</p>
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
                      Last cleanup: {formatDate(appConfig.cleanup.lastDataCleanup)}
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
                Defaults used by xStrategyBuilder when filtering option chains.
              </p>

              {strategySettingsLoading ? (
                <div className="flex items-center gap-3 text-gray-600">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  Loading strategy settings…
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/50">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={strategyThresholdsForm.excludeWatchlist}
                        onChange={(e) =>
                          setStrategyThresholdsForm((p) => ({ ...p, excludeWatchlist: e.target.checked }))
                        }
                        className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <div>
                        <span className="font-medium text-gray-900">Exclude Watchlist</span>
                        <p className="text-xs text-gray-600 mt-1">
                          When on (default), the Covered Call Scanner does not evaluate watchlist items during the daily job, to save time. Turn off to include watchlist call/covered-call items in the scan.
                        </p>
                      </div>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-gray-200">
                      <p className="font-medium text-gray-900 mb-1">Covered Calls</p>
                      <p className="text-xs text-gray-500 mb-3">
                        Option chain filters for xStrategyBuilder (calls).
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
                        Option chain filters for xStrategyBuilder (puts).
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
    </>
  );
}

export default function AutomationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <AutomationContent />
    </Suspense>
  );
}
