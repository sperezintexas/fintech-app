"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type AccessKeyRow = {
  id: string;
  name: string;
  createdAt: string;
  revoked: boolean;
  mask: string;
};

export default function AccessKeysPage() {
  const [keys, setKeys] = useState<AccessKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [authUserEmail, setAuthUserEmail] = useState("");
  const [authUserPassword, setAuthUserPassword] = useState("");
  const [authUserSubmitting, setAuthUserSubmitting] = useState(false);
  const [authUserDone, setAuthUserDone] = useState(false);

  const fetchKeys = useCallback(async () => {
    const res = await fetch("/api/access-keys");
    if (!res.ok) {
      setError("Failed to load keys");
      setKeys([]);
      return;
    }
    const data = await res.json();
    setKeys(Array.isArray(data) ? data : []);
    setError("");
  }, []);

  useEffect(() => {
    fetchKeys().finally(() => setLoading(false));
  }, [fetchKeys]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCreating(true);
    setCreatedKey(null);
    try {
      const res = await fetch("/api/access-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName || "Unnamed" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create key");
        return;
      }
      setCreatedKey(data.key);
      setNewName("");
      await fetchKeys();
    } finally {
      setCreating(false);
    }
  };

  const handleAddAuthUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setAuthUserSubmitting(true);
    setAuthUserDone(false);
    try {
      const res = await fetch("/api/auth-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authUserEmail.trim(), password: authUserPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to add user");
        return;
      }
      setAuthUserEmail("");
      setAuthUserPassword("");
      setAuthUserDone(true);
    } finally {
      setAuthUserSubmitting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this key? It will stop working immediately.")) return;
    setError("");
    const res = await fetch(`/api/access-keys/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to revoke");
      return;
    }
    await fetchKeys();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/"
          className="text-gray-500 hover:text-gray-700 font-medium"
        >
          ← Dashboard
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Access keys</h1>
      <p className="text-gray-600 mb-6">
        Anyone with a valid key can sign in (no username). Create keys to share
        access; revoke to disable.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Create key</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Label (optional)"
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-48"
          />
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {creating ? "Creating…" : "Create key"}
          </button>
        </form>
        {createdKey && (
          <div className="mt-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-sm font-medium text-amber-800 mb-1">
              Copy this key now. It won’t be shown again.
            </p>
            <code className="block p-2 bg-white rounded border border-amber-200 text-sm break-all select-all">
              {createdKey}
            </code>
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          Add email/password login
        </h2>
        <p className="text-sm text-gray-600 mb-3">
          Create another account that can sign in with email and password.
        </p>
        <form onSubmit={handleAddAuthUser} className="flex flex-wrap gap-2">
          <input
            type="email"
            value={authUserEmail}
            onChange={(e) => setAuthUserEmail(e.target.value)}
            placeholder="Email"
            required
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-48"
          />
          <input
            type="password"
            value={authUserPassword}
            onChange={(e) => setAuthUserPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={8}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-48"
          />
          <button
            type="submit"
            disabled={authUserSubmitting}
            className="px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-50 font-medium"
          >
            {authUserSubmitting ? "Adding…" : "Add user"}
          </button>
        </form>
        {authUserDone && (
          <p className="mt-2 text-sm text-green-600">User added. They can sign in with email/password on the login page.</p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Keys</h2>
        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-gray-500">No keys yet. Create one above.</p>
        ) : (
          <ul className="space-y-2">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex items-center justify-between gap-4 p-3 rounded-lg border border-gray-200 bg-gray-50/50"
              >
                <div>
                  <span className="font-medium text-gray-800">{k.name}</span>
                  <span className="text-gray-500 ml-2 font-mono text-sm">
                    {k.mask}
                  </span>
                  {k.revoked && (
                    <span className="ml-2 text-red-600 text-sm">Revoked</span>
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  {new Date(k.createdAt).toLocaleDateString()}
                </div>
                {!k.revoked && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(k.id)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
