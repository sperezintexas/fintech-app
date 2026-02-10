"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Account } from "@/types/portfolio";

type ImportFromCsvPanelProps = {
  accounts: Account[];
  onSuccess?: () => void;
};

export function ImportFromCsvPanel({ accounts, onSuccess }: ImportFromCsvPanelProps) {
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importTargetAccountId, setImportTargetAccountId] = useState<string>("");
  const [importRecomputePositions, setImportRecomputePositions] = useState(true);
  const [importFormat, setImportFormat] = useState<"generic" | "fidelity" | "schwab">("generic");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (accounts.length > 0 && !importTargetAccountId) setImportTargetAccountId(accounts[0]._id);
  }, [accounts, importTargetAccountId]);

  const handleImportCsv = useCallback(async () => {
    if (!importFile || !importTargetAccountId) return;
    setImportLoading(true);
    setImportResult(null);
    try {
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
      setImportResult({
        type: "success",
        message: `Imported ${data.imported ?? 0} activities.${data.positionsUpdated ? " Positions updated." : ""}${data.parseErrors?.length ? ` ${data.parseErrors.length} row(s) had errors.` : ""}`,
      });
      setImportFile(null);
      if (csvInputRef.current) csvInputRef.current.value = "";
      onSuccess?.();
    } catch (err) {
      setImportResult({ type: "error", message: err instanceof Error ? err.message : "Import failed" });
    } finally {
      setImportLoading(false);
    }
  }, [importFile, importTargetAccountId, importFormat, importRecomputePositions, onSuccess]);

  if (accounts.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Import from CSV</h3>
        <p className="text-sm text-gray-500">Create an account on the Accounts page first, then import broker CSV here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Import from CSV</h3>
      <p className="text-sm text-gray-500 mb-4">
        Upload a broker CSV (e.g. Merrill Edge, Fidelity, Schwab). Activities are appended to the selected account; optionally update positions to match.
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="csv-file" className="block text-xs font-medium text-gray-500 mb-1">
            File
          </label>
          <input
            ref={csvInputRef}
            id="csv-file"
            type="file"
            accept=".csv"
            onChange={(e) => {
              setImportFile(e.target.files?.[0] ?? null);
              setImportResult(null);
            }}
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>
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
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={importRecomputePositions}
            onChange={(e) => setImportRecomputePositions(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Update positions after import</span>
        </label>
        <button
          type="button"
          onClick={handleImportCsv}
          disabled={!importFile || importLoading}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {importLoading ? "Importing…" : "Import"}
        </button>
      </div>
      {importResult && (
        <div
          className={`mt-3 p-3 rounded-lg text-sm ${
            importResult.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {importResult.message}
        </div>
      )}
    </div>
  );
}
