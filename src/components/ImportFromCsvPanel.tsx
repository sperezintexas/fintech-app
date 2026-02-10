"use client";

import Link from "next/link";
import { useState, useRef, useCallback, useEffect } from "react";
import type { Account } from "@/types/portfolio";

type ImportFromCsvPanelProps = {
  accounts: Account[];
  onSuccess?: () => void;
};

type JsonAccountGroup = {
  accountRef: string;
  label: string;
  activities?: unknown[];
  positions?: unknown[];
};

function isJsonImportShape(data: unknown): data is { accounts: JsonAccountGroup[] } {
  if (!data || typeof data !== "object") return false;
  const o = data as Record<string, unknown>;
  if (!Array.isArray(o.accounts)) return false;
  return o.accounts.every((a) => {
    if (!a || typeof a !== "object") return false;
    const acc = a as Record<string, unknown>;
    if (typeof acc.accountRef !== "string") return false;
    const hasActivities = Array.isArray(acc.activities);
    const hasPositions = Array.isArray(acc.positions);
    return hasActivities || hasPositions;
  });
}

export function ImportFromCsvPanel({ accounts, onSuccess }: ImportFromCsvPanelProps) {
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importTargetAccountId, setImportTargetAccountId] = useState<string>("");
  const [importRecomputePositions, setImportRecomputePositions] = useState(true);
  const [importNuclearOption, setImportNuclearOption] = useState(false);
  const [importFormat, setImportFormat] = useState<"generic" | "fidelity" | "schwab">("generic");
  const [importType, setImportType] = useState<"activities" | "holdings">("activities");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{
    type: "success" | "error";
    message: string;
    linkAccountId?: string;
    positionsCount?: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // JSON from Format step: parsed account groups (when user uploads a .json file)
  const [jsonGroups, setJsonGroups] = useState<JsonAccountGroup[] | null>(null);
  const [jsonAccountMap, setJsonAccountMap] = useState<Record<string, string>>({});

  const isJsonMode = importFile?.name.toLowerCase().endsWith(".json") ?? false;

  useEffect(() => {
    if (accounts.length > 0 && !importTargetAccountId) setImportTargetAccountId(accounts[0]._id);
  }, [accounts, importTargetAccountId]);

  useEffect(() => {
    if (!importTargetAccountId) return;
    const account = accounts.find((a) => a._id === importTargetAccountId);
    if (account?.brokerType === "Merrill") setImportFormat("generic");
    else if (account?.brokerType === "Fidelity") setImportFormat("fidelity");
  }, [importTargetAccountId, accounts]);

  useEffect(() => {
    if (accounts.length > 0 && jsonGroups && jsonGroups.length > 0 && Object.keys(jsonAccountMap).length === 0) {
      const next: Record<string, string> = {};
      const defaultId = accounts[0]._id;
      jsonGroups.forEach((g) => {
        const key = g.accountRef || g.label || "default";
        next[key] = defaultId;
      });
      setJsonAccountMap(next);
    }
  }, [accounts, jsonGroups, jsonAccountMap]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImportFile(file);
    setImportResult(null);
    setJsonGroups(null);
    setJsonAccountMap({});
    if (!file) return;
    if (file.name.toLowerCase().endsWith(".json")) {
      file
        .text()
        .then((text) => {
          try {
            const data = JSON.parse(text) as unknown;
            if (!isJsonImportShape(data)) {
              setJsonGroups(null);
              setImportResult({ type: "error", message: "JSON must have an 'accounts' array with activities or positions (output from Format step)." });
              return;
            }
            setJsonGroups(data.accounts);
          } catch {
            setJsonGroups(null);
            setImportResult({ type: "error", message: "Invalid JSON file." });
          }
        })
        .catch(() => {
          setJsonGroups(null);
          setImportResult({ type: "error", message: "Could not read file." });
        });
    }
  }, []);

  const deleteActivitiesForAccountId = useCallback(async (accountId: string): Promise<number> => {
    const res = await fetch(`/api/activities?accountId=${encodeURIComponent(accountId)}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string; deleted?: number };
    if (!res.ok) throw new Error(data.error ?? "Failed to delete activities");
    return data.deleted ?? 0;
  }, []);

  const handleImportCsv = useCallback(async () => {
    if (!importFile || !importTargetAccountId || importFile.name.toLowerCase().endsWith(".json")) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      if (importNuclearOption) {
        await deleteActivitiesForAccountId(importTargetAccountId);
      }
      const csv = await importFile.text();
      const res = await fetch("/api/import/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: importTargetAccountId,
          csv,
          format: importFormat,
          recomputePositions: importRecomputePositions,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const details = Array.isArray(data.details) ? data.details.join("; ") : data.error ?? "Import failed";
        setImportResult({ type: "error", message: details });
        return;
      }
      const imported = data.imported ?? 0;
      const positionsUpdated = data.positionsUpdated === true;
      const positionsCount = data.positionsCount ?? 0;
      const parseErrors = Array.isArray(data.parseErrors) ? data.parseErrors.length : 0;
      const lines = [
        importNuclearOption ? "Nuclear: existing activities deleted, then " : "",
        `Sync: ${imported} activities imported.`,
        positionsUpdated ? `Recompute: ${positionsCount} position(s) derived.` : "Recompute: Skipped (or not requested).",
      ];
      if (parseErrors > 0) lines.push(`${parseErrors} row(s) had parse errors.`);
      if (positionsCount === 0 && positionsUpdated) lines.push("Only net-long (open) positions appear; 0 means all trades are closed.");
      setImportResult({
        type: "success",
        message: lines.join(" "),
        linkAccountId: importTargetAccountId,
        positionsCount,
      });
      setImportFile(null);
      setJsonGroups(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onSuccess?.();
    } catch (err) {
      setImportResult({ type: "error", message: err instanceof Error ? err.message : "Import failed" });
    } finally {
      setImportLoading(false);
    }
  }, [importFile, importTargetAccountId, importFormat, importRecomputePositions, importNuclearOption, deleteActivitiesForAccountId, onSuccess]);

  const handleImportJson = useCallback(async () => {
    if (!jsonGroups || jsonGroups.length === 0) return;
    setImportLoading(true);
    setImportResult(null);
    const syncLines: string[] = [];
    const recomputeResults: boolean[] = [];
    let hadError = false;
    const isHoldingsImport = importType === "holdings";
    if (importNuclearOption && !isHoldingsImport) {
      const accountIds = new Set<string>();
      for (const group of jsonGroups) {
        const key = group.accountRef || group.label || "default";
        const accountId = jsonAccountMap[key] ?? importTargetAccountId;
        if (accountId) accountIds.add(accountId);
      }
      try {
        for (const accountId of accountIds) {
          await deleteActivitiesForAccountId(accountId);
        }
      } catch (err) {
        setImportResult({ type: "error", message: err instanceof Error ? err.message : "Nuclear delete failed" });
        setImportLoading(false);
        return;
      }
    }
    for (const group of jsonGroups) {
      const key = group.accountRef || group.label || "default";
      const accountId = jsonAccountMap[key] ?? importTargetAccountId;
      const label = group.label || group.accountRef || key;
      if (!accountId) {
        syncLines.push(`No account for ${label}.`);
        hadError = true;
        continue;
      }
      if (isHoldingsImport && Array.isArray(group.positions) && group.positions.length > 0) {
        try {
          const res = await fetch("/api/import/holdings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountId, positions: group.positions }),
          });
          const data = (await res.json()) as { error?: string; imported?: number; positionsCount?: number };
          if (!res.ok) {
            syncLines.push(`${label}: ${data.error ?? "Import failed"}`);
            hadError = true;
            continue;
          }
          const count = data.imported ?? data.positionsCount ?? 0;
          syncLines.push(`${label}: ${count} position(s) imported.`);
        } catch {
          syncLines.push(`${label}: request failed`);
          hadError = true;
        }
        continue;
      }
      if (Array.isArray(group.activities) && group.activities.length > 0) {
        try {
          const res = await fetch("/api/import/activities", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accountId,
              activities: group.activities,
              recomputePositions: importRecomputePositions,
            }),
          });
          const data = (await res.json()) as {
            error?: string;
            imported?: number;
            positionsUpdated?: boolean;
            positionsCount?: number;
          };
          if (!res.ok) {
            syncLines.push(`${label}: ${data.error ?? "Import failed"}`);
            hadError = true;
            continue;
          }
          const imported = data.imported ?? 0;
          const posCount = data.positionsCount ?? 0;
          recomputeResults.push(data.positionsUpdated === true);
          syncLines.push(`${label}: ${imported} activities, ${posCount} position(s).`);
        } catch {
          syncLines.push(`${label}: request failed`);
          hadError = true;
        }
        continue;
      }
      syncLines.push(`${label}: no activities or positions to import.`);
      hadError = true;
    }
    const recomputeDone = recomputeResults.some(Boolean);
    const prefix = importNuclearOption && !isHoldingsImport ? "Nuclear: existing activities deleted, then " : "";
    const firstAccountId = jsonGroups.length > 0 ? (jsonAccountMap[jsonGroups[0].accountRef || jsonGroups[0].label || "default"] ?? importTargetAccountId) : importTargetAccountId;
    setImportResult({
      type: hadError ? "error" : "success",
      message: hadError
        ? syncLines.join(" ")
        : isHoldingsImport
          ? `${prefix}${syncLines.join(" ")}`
          : `${prefix}Sync: ${syncLines.join(" ")} Recompute: ${recomputeDone ? "Positions updated from activities." : "Skipped (or not requested)."}`,
      linkAccountId: !hadError ? firstAccountId : undefined,
    });
    if (!hadError) {
      setImportFile(null);
      setJsonGroups(null);
      setJsonAccountMap({});
      if (fileInputRef.current) fileInputRef.current.value = "";
      onSuccess?.();
    }
    setImportLoading(false);
  }, [jsonGroups, jsonAccountMap, importTargetAccountId, importType, importRecomputePositions, importNuclearOption, deleteActivitiesForAccountId, onSuccess]);

  const handleImport = useCallback(() => {
    if (isJsonMode && jsonGroups && jsonGroups.length > 0) {
      void handleImportJson();
    } else {
      void handleImportCsv();
    }
  }, [isJsonMode, jsonGroups, handleImportJson, handleImportCsv]);

  if (accounts.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Import</h3>
        <p className="text-sm text-gray-500">Create an account on the Accounts page first, then import here.</p>
      </div>
    );
  }

  const hasFile = !!importFile;
  const jsonReady = isJsonMode && jsonGroups && jsonGroups.length > 0;
  const csvReady = hasFile && !isJsonMode;
  const showMappingAndImport = hasFile && (jsonReady || csvReady);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Import</h3>

      {/* Step 1: Choose file only */}
      <p className="text-sm text-gray-500 mb-2">
        {!hasFile
          ? "Choose a formatted JSON file (from the Format step above) or raw broker CSV. Then map source accounts and import."
          : isJsonMode
            ? jsonReady
              ? "Map each source account below to a portfolio account, then import."
              : importResult?.type === "error"
                ? "File is invalid or not in the expected format. Use JSON from the Format step or choose another file."
                : "Reading file…"
            : "Map CSV to an account below, then import."}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="import-file" className="block text-xs font-medium text-gray-500 mb-1">
            {hasFile ? "File selected" : "Choose file (CSV or JSON)"}
          </label>
          <input
            ref={fileInputRef}
            id="import-file"
            type="file"
            accept=".csv,.json,application/json"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>
      </div>

      {/* Step 2: Only after file selected and (for JSON) parsed — source accounts + mapping + options + Import */}
      {showMappingAndImport && (
        <div className="mt-5 pt-4 border-t border-gray-100 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-full sm:w-40">
              <label htmlFor="import-type" className="block text-xs font-medium text-gray-500 mb-1">
                Import type
              </label>
              <select
                id="import-type"
                value={importType}
                onChange={(e) => setImportType(e.target.value as "activities" | "holdings")}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="activities">Activities</option>
                <option value="holdings">Holdings</option>
              </select>
            </div>
          </div>
          {isJsonMode && jsonGroups && jsonGroups.length > 0 && (
            <div className="space-y-2">
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-sm">
                <p className="font-medium text-gray-700 mb-1">Import file summary</p>
                <p className="text-gray-600">
                  <span className="font-medium">Accounts:</span>{" "}
                  {jsonGroups.map((g) => `${g.label || g.accountRef} (${g.accountRef})`).join("; ")}
                </p>
                <p className="text-gray-600">
                  {jsonGroups.some((g) => Array.isArray(g.positions) && g.positions.length > 0) ? (
                    <>
                      <span className="font-medium">Positions:</span>{" "}
                      {jsonGroups.reduce((s, g) => s + (g.positions?.length ?? 0), 0)} total
                      {jsonGroups.length > 1 &&
                        ` (${jsonGroups.map((g) => `${g.label || g.accountRef}: ${g.positions?.length ?? 0}`).join(", ")})`}
                    </>
                  ) : (
                    <>
                      <span className="font-medium">Activities:</span>{" "}
                      {jsonGroups.reduce((s, g) => s + (g.activities?.length ?? 0), 0)} total
                      {jsonGroups.length > 1 &&
                        ` (${jsonGroups.map((g) => `${g.label || g.accountRef}: ${g.activities?.length ?? 0}`).join(", ")})`}
                    </>
                  )}
                </p>
                <p className="text-gray-600">
                  <span className="font-medium">Potential positions:</span>{" "}
                  {jsonGroups.some((g) => Array.isArray(g.positions)) ? "In file (set Import type = Holdings)." : "Computed after import (Activities)."}
                </p>
              </div>
              <p className="text-xs font-medium text-gray-600">Source accounts in file — map each to a portfolio account:</p>
              <ul className="space-y-1.5">
                {jsonGroups.map((g) => {
                  const key = g.accountRef || g.label || "default";
                  return (
                    <li key={key} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-gray-700 min-w-[6rem]">{g.label || g.accountRef || key}</span>
                      <span className="text-gray-500">
                        ({(g.positions?.length ?? g.activities?.length ?? 0)} {g.positions?.length != null && g.positions.length > 0 ? "positions" : "activities"})
                      </span>
                      <span className="text-gray-400">→</span>
                      <select
                        value={jsonAccountMap[key] ?? importTargetAccountId}
                        onChange={(e) => setJsonAccountMap((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="px-2 py-1 border border-gray-200 rounded-lg text-sm bg-white"
                        aria-label={`Import ${g.label || g.accountRef || key} into`}
                      >
                        {accounts.map((a) => (
                          <option key={a._id} value={a._id}>
                            {a.name}
                            {a.accountRef ? ` (${a.accountRef})` : ""}
                          </option>
                        ))}
                      </select>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {csvReady && (
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="w-full sm:w-48">
                <label htmlFor="import-account" className="block text-xs font-medium text-gray-500 mb-1">
                  Import into account
                </label>
                <select
                  id="import-account"
                  value={importTargetAccountId}
                  onChange={(e) => setImportTargetAccountId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  {accounts.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                      {a.accountRef ? ` (${a.accountRef})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-full sm:w-40">
                <label htmlFor="import-format" className="block text-xs font-medium text-gray-500 mb-1">
                  CSV format
                </label>
                <select
                  id="import-format"
                  value={importFormat}
                  onChange={(e) => setImportFormat(e.target.value as "generic" | "fidelity" | "schwab")}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="generic">Generic / Merrill</option>
                  <option value="fidelity">Fidelity</option>
                  <option value="schwab">Schwab</option>
                </select>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={importRecomputePositions}
                onChange={(e) => setImportRecomputePositions(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Update positions after import</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer" title="Delete all existing activities for the selected account(s) before importing">
              <input
                type="checkbox"
                checked={importNuclearOption}
                onChange={(e) => setImportNuclearOption(e.target.checked)}
                className="rounded border-red-300 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm text-amber-700 font-medium">Nuclear Option: delete then import</span>
            </label>
            <button
              type="button"
              onClick={handleImport}
              disabled={importLoading || (isJsonMode && !jsonGroups?.length)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {importLoading ? "Importing…" : "Import"}
            </button>
          </div>
        </div>
      )}

      {importResult && (
        <div
          className={`mt-3 p-3 rounded-lg text-sm ${
            importResult.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          <p>{importResult.message}</p>
          {importResult.type === "success" && importResult.linkAccountId && (
            <p className="mt-2">
              <Link
                href={`/holdings?accountId=${encodeURIComponent(importResult.linkAccountId)}`}
                className="font-medium underline hover:no-underline"
              >
                View in Holdings →
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
