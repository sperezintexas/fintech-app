"use client";

import Link from "next/link";
import { useState, useRef, useCallback, useEffect } from "react";
import type { Account } from "@/types/portfolio";

type ImportFromJsonPanelProps = {
  accounts: Account[];
  onSuccess?: () => void;
};

type GhostfolioAccountGroup = {
  accountRef: string;
  label: string;
  activities: unknown[];
};

function isGhostfolioShape(data: unknown): data is { accounts: GhostfolioAccountGroup[] } {
  if (!data || typeof data !== "object") return false;
  const o = data as Record<string, unknown>;
  if (!Array.isArray(o.accounts)) return false;
  return o.accounts.every(
    (a) =>
      a &&
      typeof a === "object" &&
      typeof (a as Record<string, unknown>).accountRef === "string" &&
      Array.isArray((a as Record<string, unknown>).activities)
  );
}

export function ImportFromJsonPanel({ accounts, onSuccess }: ImportFromJsonPanelProps) {
  const [parsed, setParsed] = useState<GhostfolioAccountGroup[] | null>(null);
  const [accountMap, setAccountMap] = useState<Record<string, string>>({});
  const [recomputePositions, setRecomputePositions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
    linkAccountId?: string;
    positionsCount?: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (accounts.length > 0 && parsed && Object.keys(accountMap).length === 0) {
      const next: Record<string, string> = {};
      const defaultId = accounts[0]._id;
      parsed.forEach((g) => {
        next[g.accountRef || g.label || "default"] = defaultId;
      });
      setAccountMap(next);
    }
  }, [accounts, parsed, accountMap]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      setResult(null);
      if (!file) {
        setParsed(null);
        setAccountMap({});
        return;
      }
      file
        .text()
        .then((text) => {
          const data = JSON.parse(text) as unknown;
          if (!isGhostfolioShape(data)) {
            setParsed(null);
            setResult({ type: "error", message: "JSON must have an 'accounts' array with accountRef and activities." });
            return;
          }
          setParsed(data.accounts);
          setResult(null);
        })
        .catch(() => {
          setParsed(null);
          setResult({ type: "error", message: "Invalid JSON file." });
        });
    },
    []
  );

  const handleImport = useCallback(async () => {
    if (!parsed || parsed.length === 0) return;
    setLoading(true);
    setResult(null);
    const messages: string[] = [];
    let hadError = false;
    let totalPositions = 0;
    let firstAccountId: string | null = null;
    for (const group of parsed) {
      const key = group.accountRef || group.label || "default";
      const accountId = accountMap[key];
      if (!accountId) {
        messages.push(`No account selected for ${group.label || group.accountRef}.`);
        hadError = true;
        continue;
      }
      try {
        const res = await fetch("/api/import/activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId,
            activities: group.activities,
            recomputePositions,
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          imported?: number;
          positionsUpdated?: boolean;
          positionsCount?: number;
        };
        if (!res.ok) {
          messages.push(`${group.label || group.accountRef}: ${data.error ?? "Import failed"}`);
          hadError = true;
          continue;
        }
        const posCount = data.positionsCount ?? 0;
        messages.push(
          `${group.label || group.accountRef}: imported ${data.imported ?? 0} activities, ${posCount} position(s).`
        );
        totalPositions += posCount;
        firstAccountId = firstAccountId ?? accountId;
      } catch {
        messages.push(`${group.label || group.accountRef}: request failed`);
        hadError = true;
      }
    }
    setResult({
      type: hadError ? "error" : "success",
      message: messages.join(" "),
      ...(!hadError && {
        linkAccountId: firstAccountId ?? undefined,
        positionsCount: totalPositions,
      }),
    });
    if (!hadError) {
      setParsed(null);
      setAccountMap({});
      if (inputRef.current) inputRef.current.value = "";
      onSuccess?.();
    }
    setLoading(false);
  }, [parsed, accountMap, recomputePositions, onSuccess]);

  if (accounts.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Import from JSON (Ghostfolio format)</h3>
        <p className="text-sm text-gray-500">Create an account on the Accounts page first, then import JSON here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Import from JSON (Ghostfolio format)</h3>
      <p className="text-sm text-gray-500 mb-4">
        Upload the JSON from the &quot;Format only (Merrill)&quot; step (or from <code className="bg-gray-100 px-1 rounded text-xs">pnpm run merrill-to-activities -- --output=out.json</code>). Map each account group to an app account, then import into Activities.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
        <div className="min-w-0 flex-1">
          <label htmlFor="json-file" className="block text-xs font-medium text-gray-500 mb-1">
            JSON file
          </label>
          <input
            ref={inputRef}
            id="json-file"
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>
      </div>
      {parsed && parsed.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-sm">
            <p className="font-medium text-gray-700 mb-1">Import file summary</p>
            <p className="text-gray-600">
              <span className="font-medium">Accounts:</span>{" "}
              {parsed.map((g) => `${g.label || g.accountRef} (${g.accountRef})`).join("; ")}
            </p>
            <p className="text-gray-600">
              <span className="font-medium">Activities:</span>{" "}
              {parsed.reduce((s, g) => s + g.activities.length, 0)} total
              {parsed.length > 1 &&
                ` (${parsed.map((g) => `${g.label || g.accountRef}: ${g.activities.length}`).join(", ")})`}
            </p>
            <p className="text-gray-600">
              <span className="font-medium">Potential positions:</span> Computed after import
            </p>
          </div>
          <p className="text-xs font-medium text-gray-600">Map each group to an app account:</p>
          <ul className="space-y-2">
            {parsed.map((g) => {
              const key = g.accountRef || g.label || "default";
              return (
                <li key={key} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-gray-700 min-w-[8rem]">
                    {g.label || g.accountRef || key}
                  </span>
                  <span className="text-gray-500">({g.activities.length} activities)</span>
                  <select
                    value={accountMap[key] ?? ""}
                    onChange={(e) =>
                      setAccountMap((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
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
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
            <input
              type="checkbox"
              checked={recomputePositions}
              onChange={(e) => setRecomputePositions(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Update positions after import
          </label>
          <button
            type="button"
            onClick={handleImport}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Importing…" : "Import into Activities"}
          </button>
        </div>
      )}
      {result && (
        <div
          className={`mt-3 p-3 rounded-lg text-sm ${
            result.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          <p>{result.message}</p>
          {result.type === "success" && result.linkAccountId && (
            <p className="mt-2">
              <Link
                href={`/holdings?accountId=${encodeURIComponent(result.linkAccountId)}`}
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
