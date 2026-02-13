"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type ScannerType =
  | "unified"
  | "optionScanner"
  | "coveredCall"
  | "protectivePut"
  | "straddleStrangle";

type Account = { _id: string; name: string };

const SCANNER_LABELS: Record<ScannerType, string> = {
  unified: "Unified (all 4 scanners)",
  optionScanner: "Option Scanner",
  coveredCall: "Covered Call Scanner",
  protectivePut: "Protective Put Scanner",
  straddleStrangle: "Straddle/Strangle Scanner",
};

const DEFAULT_CONFIGS: Record<ScannerType, Record<string, unknown>> = {
  unified: {
    optionScanner: { holdDteMin: 14, btcDteMax: 7, grokEnabled: false },
    coveredCall: { minPremium: 0, grokEnabled: false },
    protectivePut: {},
  },
  optionScanner: {
    holdDteMin: 14,
    btcDteMax: 7,
    btcStopLossPercent: -50,
    holdTimeValuePercentMin: 20,
    grokEnabled: false,
  },
  coveredCall: {
    minPremium: 0,
    maxDelta: 0.9,
    minStockShares: 100,
    grokEnabled: false,
    includeWatchlist: false,
    symbol: "TSLA",
  },
  protectivePut: {
    minYield: 0,
    minStockShares: 100,
    includeWatchlist: true,
  },
  straddleStrangle: {},
};

const CONFIG_STORAGE_KEY = "scanTest_config";

export default function ScanTestPage() {
  const [scannerType, setScannerType] = useState<ScannerType>("unified");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>("none");
  const [configJson, setConfigJson] = useState<string>("{}");
  const [configError, setConfigError] = useState<string>("");
  const [persist, setPersist] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    summary: unknown;
    recommendations: unknown;
    message?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/accounts")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => setAccounts([]));
  }, []);

  const loadDefaultConfig = useCallback(() => {
    const cfg = DEFAULT_CONFIGS[scannerType];
    setConfigJson(JSON.stringify(cfg, null, 2));
    setConfigError("");
  }, [scannerType]);

  useEffect(() => {
    loadDefaultConfig();
  }, [scannerType, loadDefaultConfig]);

  const saveConfig = useCallback(() => {
    try {
      JSON.parse(configJson);
      localStorage.setItem(
        `${CONFIG_STORAGE_KEY}_${scannerType}`,
        configJson
      );
      setConfigError("");
    } catch {
      setConfigError("Invalid JSON");
    }
  }, [configJson, scannerType]);

  const loadSavedConfig = useCallback(() => {
    const saved = localStorage.getItem(`${CONFIG_STORAGE_KEY}_${scannerType}`);
    if (saved) {
      setConfigJson(saved);
      setConfigError("");
    }
  }, [scannerType]);

  const runTest = useCallback(async () => {
    let config: Record<string, unknown> | undefined;
    try {
      const parsed = JSON.parse(configJson);
      config =
        Object.keys(parsed).length > 0 ? parsed : undefined;
    } catch {
      setConfigError("Invalid JSON");
      return;
    }
    setConfigError("");
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/scan-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scannerType,
          accountId: accountId === "none" || accountId === "" ? undefined : accountId,
          config,
          persist,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({
          success: false,
          summary: null,
          recommendations: null,
          error: data.error ?? "Request failed",
        });
        return;
      }
      setResult({
        success: data.success,
        summary: data.summary,
        recommendations: data.recommendations,
        message: data.message,
      });
    } catch (e) {
      setResult({
        success: false,
        summary: null,
        recommendations: null,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRunning(false);
    }
  }, [scannerType, accountId, configJson, persist]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Scanner Test
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Test option scanners with custom config. Not in main nav.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ← Back to app
          </Link>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Scanner type
            </label>
            <select
              value={scannerType}
              onChange={(e) =>
                setScannerType(e.target.value as ScannerType)
              }
              className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {(Object.keys(SCANNER_LABELS) as ScannerType[]).map((t) => (
                <option key={t} value={t}>
                  {SCANNER_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="none">NONE (symbol-only, add symbol to config)</option>
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Config (JSON)
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={loadDefaultConfig}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Load default
                </button>
                <button
                  type="button"
                  onClick={saveConfig}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={loadSavedConfig}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Load saved
                </button>
              </div>
            </div>
            <textarea
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              rows={12}
              className={`w-full font-mono text-sm rounded-md border px-3 py-2 focus:ring-1 focus:ring-blue-500 ${
                configError ? "border-red-500" : "border-gray-300"
              }`}
              placeholder="{}"
              spellCheck={false}
            />
            {configError && (
              <p className="text-xs text-red-600 mt-1">{configError}</p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={persist}
                onChange={(e) => setPersist(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                Persist to DB (store recommendations & create alerts)
              </span>
            </label>
            <button
              type="button"
              onClick={runTest}
              disabled={running}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {running ? "Running…" : "Run test"}
            </button>
          </div>
        </div>

        {result && (
          <div className="mt-6 bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Results
            </h2>
            {result.error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">
                {result.error}
              </div>
            )}
            {result.message && (
              <p className="text-sm text-gray-600 mb-4">{result.message}</p>
            )}
            {result.summary != null ? (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Summary
                </h3>
                <pre className="p-4 bg-gray-50 rounded-md text-xs overflow-x-auto">
                  {String(JSON.stringify(result.summary, null, 2))}
                </pre>
              </div>
            ) : null}
            {result.recommendations != null && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Recommendations
                </h3>
                <pre className="p-4 bg-gray-50 rounded-md text-xs overflow-x-auto max-h-96 overflow-y-auto">
                  {String(JSON.stringify(result.recommendations, null, 2))}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
