"use client";

import Link from "next/link";
import { useState, useRef, useCallback, useEffect } from "react";
import type { Account } from "@/types/portfolio";

type Broker = "merrill" | "fidelity";

type ParsedAccount = {
  accountRef: string;
  label: string;
  activities?: unknown[];
  positions?: unknown[];
};

type BrokerImportPanelProps = {
  accounts: Account[];
  onSuccess?: () => void;
};

export function BrokerImportPanel({ accounts, onSuccess }: BrokerImportPanelProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [broker, setBroker] = useState<Broker>("merrill");

  const [_holdingsFile, setHoldingsFile] = useState<File | null>(null);
  const [holdingsCsv, setHoldingsCsv] = useState<string | null>(null);
  const [holdingsParsed, setHoldingsParsed] = useState<ParsedAccount[] | null>(null);
  const [holdingsParseError, setHoldingsParseError] = useState<string | null>(null);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [holdingsResult, setHoldingsResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const holdingsInputRef = useRef<HTMLInputElement>(null);

  const [_activitiesFile, setActivitiesFile] = useState<File | null>(null);
  const [activitiesCsv, setActivitiesCsv] = useState<string | null>(null);
  const [activitiesParsed, setActivitiesParsed] = useState<ParsedAccount[] | null>(null);
  const [activitiesParseError, setActivitiesParseError] = useState<string | null>(null);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [recomputePositions, setRecomputePositions] = useState(true);
  const [activitiesResult, setActivitiesResult] = useState<{ type: "success" | "error"; message: string; linkAccountId?: string } | null>(null);
  const activitiesInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0]._id);
    }
  }, [accounts, selectedAccountId]);

  const buildMappings = useCallback(
    (parsed: ParsedAccount[]) => {
      const next: Record<string, string> = {};
      parsed.forEach((a) => {
        const key = a.accountRef || a.label || "default";
        next[key] = selectedAccountId;
      });
      return next;
    },
    [selectedAccountId]
  );

  const handleHoldingsFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setHoldingsFile(f);
    setHoldingsCsv(null);
    setHoldingsParsed(null);
    setHoldingsParseError(null);
    setHoldingsResult(null);
    if (!f) return;
    f.text().then((text) => setHoldingsCsv(text)).catch(() => setHoldingsParseError("Could not read file"));
  }, []);

  const selectedAccount = accounts.find((a) => a._id === selectedAccountId);
  const fidelityHoldingsDefaultAccountRef = broker === "fidelity" ? (selectedAccount?.accountRef ?? "") : undefined;

  const handleHoldingsParse = useCallback(async () => {
    if (!holdingsCsv?.trim()) return;
    setHoldingsLoading(true);
    setHoldingsParseError(null);
    setHoldingsResult(null);
    try {
      const body: { broker: Broker; exportType: "holdings"; csv: string; fidelityHoldingsDefaultAccountRef?: string } = {
        broker,
        exportType: "holdings",
        csv: holdingsCsv,
      };
      if (broker === "fidelity" && fidelityHoldingsDefaultAccountRef !== undefined) {
        body.fidelityHoldingsDefaultAccountRef = fidelityHoldingsDefaultAccountRef;
      }
      const res = await fetch("/api/import/parse-broker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHoldingsParsed(null);
        setHoldingsParseError((data as { error?: string }).error ?? "Parse failed");
        return;
      }
      const list = (data as { accounts?: ParsedAccount[] }).accounts ?? [];
      if (list.length === 0) {
        setHoldingsParsed(null);
        setHoldingsParseError((data as { error?: string }).error ?? "No accounts parsed");
        return;
      }
      setHoldingsParsed(list);
    } catch {
      setHoldingsParsed(null);
      setHoldingsParseError("Parse request failed");
    } finally {
      setHoldingsLoading(false);
    }
  }, [broker, holdingsCsv, fidelityHoldingsDefaultAccountRef]);

  const handleHoldingsImport = useCallback(async () => {
    if (!holdingsCsv || !holdingsParsed?.length || !selectedAccountId) return;
    setHoldingsLoading(true);
    setHoldingsResult(null);
    const mappings = buildMappings(holdingsParsed);
    const importBody: Record<string, unknown> = {
      broker,
      exportType: "holdings" as const,
      csv: holdingsCsv,
      mappings,
    };
    if (broker === "fidelity" && fidelityHoldingsDefaultAccountRef !== undefined) {
      importBody.fidelityHoldingsDefaultAccountRef = fidelityHoldingsDefaultAccountRef;
    }
    try {
      const res = await fetch("/api/import/broker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(importBody),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHoldingsResult({ type: "error", message: (data as { error?: string }).error ?? "Import failed" });
        return;
      }
      const results = (data as { results?: Array<{ label: string; imported: number; error?: string }> }).results ?? [];
      const lines = results.map((r) => (r.error ? `${r.label}: ${r.error}` : `${r.label}: ${r.imported} imported`));
      const hadError = results.some((r) => r.error);
      setHoldingsResult({ type: hadError ? "error" : "success", message: lines.join(". ") });
      if (!hadError) {
        setHoldingsFile(null);
        setHoldingsCsv(null);
        setHoldingsParsed(null);
        if (holdingsInputRef.current) holdingsInputRef.current.value = "";
        onSuccess?.();
      }
    } catch {
      setHoldingsResult({ type: "error", message: "Import request failed" });
    } finally {
      setHoldingsLoading(false);
    }
  }, [broker, holdingsCsv, holdingsParsed, selectedAccountId, fidelityHoldingsDefaultAccountRef, buildMappings, onSuccess]);

  const handleActivitiesFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setActivitiesFile(f);
    setActivitiesCsv(null);
    setActivitiesParsed(null);
    setActivitiesParseError(null);
    setActivitiesResult(null);
    if (!f) return;
    f.text().then((text) => setActivitiesCsv(text)).catch(() => setActivitiesParseError("Could not read file"));
  }, []);

  const handleActivitiesParse = useCallback(async () => {
    if (!activitiesCsv?.trim()) return;
    setActivitiesLoading(true);
    setActivitiesParseError(null);
    setActivitiesResult(null);
    try {
      const res = await fetch("/api/import/parse-broker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broker, exportType: "activities" as const, csv: activitiesCsv }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActivitiesParsed(null);
        setActivitiesParseError((data as { error?: string }).error ?? "Parse failed");
        return;
      }
      const list = (data as { accounts?: ParsedAccount[] }).accounts ?? [];
      if (list.length === 0) {
        setActivitiesParsed(null);
        setActivitiesParseError((data as { error?: string }).error ?? "No accounts parsed");
        return;
      }
      setActivitiesParsed(list);
    } catch {
      setActivitiesParsed(null);
      setActivitiesParseError("Parse request failed");
    } finally {
      setActivitiesLoading(false);
    }
  }, [broker, activitiesCsv]);

  const handleActivitiesImport = useCallback(async () => {
    if (!activitiesCsv || !activitiesParsed?.length || !selectedAccountId) return;
    setActivitiesLoading(true);
    setActivitiesResult(null);
    const mappings = buildMappings(activitiesParsed);
    try {
      const res = await fetch("/api/import/broker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broker,
          exportType: "activities" as const,
          csv: activitiesCsv,
          mappings,
          recomputePositions,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActivitiesResult({ type: "error", message: (data as { error?: string }).error ?? "Import failed" });
        return;
      }
      const results = (data as { results?: Array<{ label: string; imported: number; error?: string }> }).results ?? [];
      const linkAccountId = (data as { linkAccountId?: string }).linkAccountId;
      const lines = results.map((r) => (r.error ? `${r.label}: ${r.error}` : `${r.label}: ${r.imported} imported`));
      const hadError = results.some((r) => r.error);
      setActivitiesResult({
        type: hadError ? "error" : "success",
        message: lines.join(". "),
        linkAccountId: hadError ? undefined : linkAccountId,
      });
      if (!hadError) {
        setActivitiesFile(null);
        setActivitiesCsv(null);
        setActivitiesParsed(null);
        if (activitiesInputRef.current) activitiesInputRef.current.value = "";
        onSuccess?.();
      }
    } catch {
      setActivitiesResult({ type: "error", message: "Import request failed" });
    } finally {
      setActivitiesLoading(false);
    }
  }, [broker, activitiesCsv, activitiesParsed, selectedAccountId, recomputePositions, buildMappings, onSuccess]);

  const count = (a: ParsedAccount) => (a.positions?.length ?? a.activities?.length ?? 0);

  if (accounts.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Import from broker</h3>
        <p className="text-sm text-gray-500">Create an account on the Accounts page first, then import here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Import from broker</h3>
      <p className="text-sm text-gray-500 mb-4">
        Select the account to import into, then import <strong>Holdings</strong> (optional), then <strong>Activities</strong> with sync/recompute. Merrill test files: <code className="bg-gray-100 px-1 rounded text-xs">Holdings_02092026.csv</code>, <code className="bg-gray-100 px-1 rounded text-xs">MerrillEdgeActivities.csv</code>.
      </p>

      {/* Step 1: Select account */}
      <div className="mb-6">
        <label htmlFor="import-account" className="block text-xs font-medium text-gray-500 mb-1">
          1. Select account to import into
        </label>
        <select
          id="import-account"
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="w-full max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
        >
          {accounts.map((acc) => (
            <option key={acc._id} value={acc._id}>
              {acc.name}
              {acc.accountRef ? ` (${acc.accountRef})` : ""}
            </option>
          ))}
        </select>
        {selectedAccount && (
          <p className="text-xs text-gray-400 mt-1">
            All broker data from the files below will import into <strong>{selectedAccount.name}</strong>.
          </p>
        )}
      </div>

      {/* Broker (shared) */}
      <div className="mb-4">
        <label htmlFor="broker" className="block text-xs font-medium text-gray-500 mb-1">
          Broker
        </label>
        <select
          id="broker"
          value={broker}
          onChange={(e) => {
            setBroker(e.target.value as Broker);
            setHoldingsParsed(null);
            setHoldingsParseError(null);
            setActivitiesParsed(null);
            setActivitiesParseError(null);
          }}
          className="w-full max-w-[10rem] px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
        >
          <option value="merrill">Merrill</option>
          <option value="fidelity">Fidelity</option>
        </select>
      </div>

      {/* Step 2: Holdings */}
      <div className="mb-6 pb-6 border-b border-gray-100">
        <h4 className="text-xs font-semibold text-gray-700 mb-2">2. Import Holdings (optional)</h4>
        {broker === "fidelity" && (
          <p className="text-xs text-amber-600 mb-2">
            Fidelity: Positions file has no account column. Set the selected account&apos;s <strong>Account ref</strong> (e.g. 0196) so holdings map to it.
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="holdings-file" className="block text-xs font-medium text-gray-500 mb-1">
              Holdings CSV
            </label>
            <input
              ref={holdingsInputRef}
              id="holdings-file"
              type="file"
              accept=".csv"
              onChange={handleHoldingsFileChange}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            onClick={handleHoldingsParse}
            disabled={!holdingsCsv || holdingsLoading}
            className="px-4 py-2 bg-gray-100 text-gray-800 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {holdingsLoading ? "Parsing…" : "Parse & preview"}
          </button>
        </div>
        {holdingsParseError && (
          <div className="mt-2 p-2 rounded-lg text-sm bg-red-50 border border-red-200 text-red-800">{holdingsParseError}</div>
        )}
        {holdingsParsed && holdingsParsed.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-gray-600">
              {holdingsParsed.length} account(s), {holdingsParsed.reduce((s, a) => s + count(a), 0)} position(s) → importing into{" "}
              {selectedAccount?.name ?? "selected account"}.
            </p>
            <button
              type="button"
              onClick={handleHoldingsImport}
              disabled={holdingsLoading}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {holdingsLoading ? "Importing…" : "Import holdings"}
            </button>
          </div>
        )}
        {holdingsResult && (
          <div
            className={`mt-2 p-2 rounded-lg text-sm ${
              holdingsResult.type === "success" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"
            }`}
          >
            {holdingsResult.message}
          </div>
        )}
      </div>

      {/* Step 3: Activities + sync */}
      <div>
        <h4 className="text-xs font-semibold text-gray-700 mb-2">3. Import Activities & sync</h4>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="activities-file" className="block text-xs font-medium text-gray-500 mb-1">
              Activities CSV
            </label>
            <input
              ref={activitiesInputRef}
              id="activities-file"
              type="file"
              accept=".csv"
              onChange={handleActivitiesFileChange}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
          <button
            type="button"
            onClick={handleActivitiesParse}
            disabled={!activitiesCsv || activitiesLoading}
            className="px-4 py-2 bg-gray-100 text-gray-800 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {activitiesLoading ? "Parsing…" : "Parse & preview"}
          </button>
        </div>
        {activitiesParseError && (
          <div className="mt-2 p-2 rounded-lg text-sm bg-red-50 border border-red-200 text-red-800">{activitiesParseError}</div>
        )}
        {activitiesParsed && activitiesParsed.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-gray-600">
              {activitiesParsed.length} account(s), {activitiesParsed.reduce((s, a) => s + count(a), 0)} activit(ies) → importing into{" "}
              {selectedAccount?.name ?? "selected account"}.
            </p>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input
                type="checkbox"
                checked={recomputePositions}
                onChange={(e) => setRecomputePositions(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Recompute positions after import
            </label>
            <button
              type="button"
              onClick={handleActivitiesImport}
              disabled={activitiesLoading}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {activitiesLoading ? "Importing…" : "Import activities & sync"}
            </button>
          </div>
        )}
        {activitiesResult && (
          <div
            className={`mt-2 p-2 rounded-lg text-sm ${
              activitiesResult.type === "success"
                ? "bg-green-50 border border-green-200 text-green-800"
                : "bg-red-50 border border-red-200 text-red-800"
            }`}
          >
            <p>{activitiesResult.message}</p>
            {activitiesResult.type === "success" && activitiesResult.linkAccountId && (
              <p className="mt-2">
                <Link
                  href={`/holdings?accountId=${encodeURIComponent(activitiesResult.linkAccountId)}`}
                  className="font-medium underline hover:no-underline"
                >
                  View in Holdings →
                </Link>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
