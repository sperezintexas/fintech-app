"use client";

import { useState, useCallback } from "react";

const EXAMPLES: Record<string, string> = {
  "List collections": JSON.stringify({ op: "listCollections" }, null, 2),
  "List accounts": JSON.stringify(
    { op: "find", collection: "accounts", filter: {}, limit: 50 },
    null,
    2
  ),
  "Count accounts": JSON.stringify({ op: "count", collection: "accounts", filter: {} }, null, 2),
  "Count activities": JSON.stringify({ op: "count", collection: "activities", filter: {} }, null, 2),
  "Find 10 activities": JSON.stringify(
    { op: "find", collection: "activities", filter: {}, limit: 10 },
    null,
    2
  ),
  "Delete many (example)": JSON.stringify(
    { op: "deleteMany", collection: "alerts", filter: { type: "OLD_TYPE" } },
    null,
    2
  ),
  "Update many (example)": JSON.stringify(
    { op: "updateMany", collection: "alerts", filter: { read: false }, update: { $set: { read: true } } },
    null,
    2
  ),
};

const DEFAULT_STMT = EXAMPLES["List accounts"];

export function XToolsConsole() {
  const [stmt, setStmt] = useState(DEFAULT_STMT);
  const [output, setOutput] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stmt.trim());
    } catch {
      setError("Invalid JSON");
      setOutput("");
      return;
    }
    setError(null);
    setLoading(true);
    setOutput("");
    try {
      const res = await fetch("/api/xtools/console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        setOutput(JSON.stringify(data, null, 2));
      } else {
        setOutput(JSON.stringify(data, null, 2));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setOutput("");
    } finally {
      setLoading(false);
    }
  }, [stmt]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">xTools Console</h3>
      <p className="text-sm text-gray-500 mb-3">
        Run read queries (listCollections, find, count) or cleanup (deleteMany, updateMany) on allowed collections.
        Auto-commit only; no transactions or long-held locks.
      </p>
      <div className="mb-2">
        <label htmlFor="xtools-stmt" className="block text-xs font-medium text-gray-500 mb-1">
          Statement (JSON)
        </label>
        <textarea
          id="xtools-stmt"
          value={stmt}
          onChange={(e) => setStmt(e.target.value)}
          placeholder='e.g. { "op": "listCollections" }'
          rows={6}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
          spellCheck={false}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          type="button"
          onClick={run}
          disabled={loading || !stmt.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Running…" : "Execute"}
        </button>
        <span className="text-xs text-gray-500">Examples:</span>
        {Object.entries(EXAMPLES).map(([label, json]) => (
          <button
            key={label}
            type="button"
            onClick={() => setStmt(json)}
            className="px-2 py-1 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50"
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <div className="mb-2 p-2 rounded bg-red-50 border border-red-200 text-red-800 text-sm">{error}</div>
      )}
      {output && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Output</label>
          <pre className="p-3 rounded-lg bg-gray-900 text-gray-100 text-xs overflow-auto max-h-80 font-mono whitespace-pre-wrap break-all">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
