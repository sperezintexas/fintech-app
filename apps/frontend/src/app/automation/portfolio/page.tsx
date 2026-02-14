"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type PortfolioItem = { id: string; name: string };
type CurrentPortfolio = {
  id: string;
  name: string;
  defaultAccountName: string;
  defaultBrokerName: string;
  ownerId: string;
  authorizedUserIds: string[];
  authorizedUsers?: string[];
  createdAt: string;
  updatedAt: string;
};
type Broker = { _id: string; name: string };

export default function PortfolioSetupPage() {
  const [current, setCurrent] = useState<CurrentPortfolio | null>(null);
  const [list, setList] = useState<PortfolioItem[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [accountsCount, setAccountsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    defaultAccountName: "",
    defaultBrokerName: "",
  });
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [justCreatedPortfolio, setJustCreatedPortfolio] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [linkId, setLinkId] = useState("");
  const [linking, setLinking] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [currentRes, listRes, brokersRes, dashboardRes] = await Promise.all([
        fetch("/api/portfolios/current", { credentials: "include" }),
        fetch("/api/portfolios", { credentials: "include" }),
        fetch("/api/brokers", { credentials: "include" }),
        fetch("/api/dashboard", { credentials: "include" }),
      ]);
      if (currentRes.ok) {
        const data = (await currentRes.json()) as CurrentPortfolio;
        setCurrent(data);
        setForm({
          name: data.name,
          defaultAccountName: data.defaultAccountName ?? "",
          defaultBrokerName: data.defaultBrokerName ?? "",
        });
      }
      if (listRes.ok) {
        const data = (await listRes.json()) as PortfolioItem[];
        setList(Array.isArray(data) ? data : []);
      }
      if (brokersRes.ok) {
        const data = (await brokersRes.json()) as Broker[];
        setBrokers(Array.isArray(data) ? data : []);
      }
      if (dashboardRes.ok) {
        const data = (await dashboardRes.json()) as { portfolio?: { accounts?: unknown[] }; stats?: { accountCount?: number } };
        setAccountsCount(data.stats?.accountCount ?? data.portfolio?.accounts?.length ?? 0);
      }
    } catch {
      setMessage({ type: "error", text: "Failed to load portfolio data" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/portfolios/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name.trim() || "Default",
          defaultAccountName: form.defaultAccountName.trim() || undefined,
          defaultBrokerName: form.defaultBrokerName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to save");
      }
      const data = (await res.json()) as CurrentPortfolio;
      setCurrent((c) => (c ? { ...c, ...data } : null));
      setForm((f) => ({ ...f, name: data.name, defaultAccountName: data.defaultAccountName ?? "", defaultBrokerName: data.defaultBrokerName ?? "" }));
      setMessage({ type: "success", text: "Portfolio settings saved." });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  const handleSwitch = async (portfolioId: string) => {
    try {
      const res = await fetch("/api/portfolios/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ portfolioId }),
      });
      if (!res.ok) throw new Error("Failed to switch");
      await fetchData();
      setMessage({ type: "success", text: "Switched to selected portfolio." });
      document.getElementById("portfolio-edit-form")?.scrollIntoView({ behavior: "smooth" });
    } catch {
      setMessage({ type: "error", text: "Failed to switch portfolio" });
    }
  };

  const handleEdit = (portfolioId: string) => {
    if (current?.id === portfolioId) {
      document.getElementById("portfolio-edit-form")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    handleSwitch(portfolioId);
  };

  const handleDelete = async (portfolioId: string, portfolioName: string) => {
    if (!window.confirm(`Delete portfolio "${portfolioName}"? Accounts and data in this portfolio will no longer be grouped under it.`)) return;
    setDeletingId(portfolioId);
    setMessage(null);
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete");
      }
      await fetchData();
      setMessage({ type: "success", text: "Portfolio deleted." });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to delete portfolio" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleLinkId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkId.trim()) return;
    setLinking(true);
    setMessage(null);
    try {
      const res = await fetch("/api/user-settings/link-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ linkId: linkId.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to link");
      }
      setLinkId("");
      await fetchData();
      setMessage({ type: "success", text: "Linked. You should now see portfolios from that login." });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to link" });
    } finally {
      setLinking(false);
    }
  };

  const handleCreatePortfolio = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPortfolioName.trim() || "Default";
    setMessage(null);
    setJustCreatedPortfolio(false);
    try {
      const res = await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to create");
      }
      setNewPortfolioName("");
      await fetchData();
      setMessage({ type: "success", text: `Portfolio "${name}" created and set as current.` });
      setJustCreatedPortfolio(true);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to create portfolio" });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Setup — Portfolio</h3>
        <p className="text-sm text-gray-600 mt-1">
          Manage the default portfolio name, default account name, and default broker. A portfolio can have one or more goals, users, accounts, tasks, and watchlists.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          <p>{message.text}</p>
          {message.type === "success" && justCreatedPortfolio && (
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                href="/accounts?add=1"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Add an account
              </Link>
              <Link
                href="/accounts"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Manage accounts
              </Link>
            </div>
          )}
        </div>
      )}

      {current ? (
        <>
          <form id="portfolio-edit-form" onSubmit={handleSave} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h4 className="font-medium text-gray-900 mb-4">Default portfolio, account & broker</h4>
            <div className="grid gap-4 sm:grid-cols-1 max-w-xl">
              <div>
                <label htmlFor="portfolio-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Portfolio name
                </label>
                <input
                  id="portfolio-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Default"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="default-account-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Default account name
                </label>
                <input
                  id="default-account-name"
                  type="text"
                  value={form.defaultAccountName}
                  onChange={(e) => setForm((f) => ({ ...f, defaultAccountName: e.target.value }))}
                  placeholder="e.g. Default"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Used when creating a new account in this portfolio.</p>
              </div>
              <div>
                <label htmlFor="default-broker" className="block text-sm font-medium text-gray-700 mb-1">
                  Default broker name
                </label>
                <select
                  id="default-broker"
                  value={form.defaultBrokerName}
                  onChange={(e) => setForm((f) => ({ ...f, defaultBrokerName: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">— None —</option>
                  {brokers.map((b) => (
                    <option key={b._id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Suggested when adding accounts. Add or edit brokers under Setup → Brokers.</p>
              </div>
            </div>
            <div className="mt-4">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h4 className="font-medium text-gray-900 mb-3">This portfolio contains</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <span className="font-medium text-gray-700">Authorized users</span>
                <span className="text-gray-500 ml-2">
                  — {(current.authorizedUsers?.length ?? 0) || (current.authorizedUserIds?.length ?? 0)} user(s) with access
                  {((current.authorizedUsers?.length ?? 0) > 0)
                    ? (
                        <span className="ml-1 text-gray-400">
                          ({current.authorizedUsers!.slice(0, 5).join(", ")}
                          {(current.authorizedUsers!.length ?? 0) > 5 ? "…" : ""})
                        </span>
                      )
                    : current.authorizedUserIds?.length
                      ? (
                          <span className="ml-1 text-gray-400">
                            (ids: {current.authorizedUserIds.slice(0, 2).join(", ")}
                            {current.authorizedUserIds.length > 2 ? "…" : ""})
                          </span>
                        )
                      : null}
                </span>
              </li>
              <li>
                <Link href="/automation/goals" className="text-blue-600 hover:underline">
                  Goals
                </Link>
                <span className="text-gray-500 ml-2">— Target value and year for dashboard</span>
              </li>
              <li>
                <Link href="/accounts" className="text-blue-600 hover:underline">
                  Accounts
                </Link>
                <span className="text-gray-500 ml-2">— {accountsCount} account(s)</span>
              </li>
              <li>
                <Link href="/automation/scheduler" className="text-blue-600 hover:underline">
                  Scheduled tasks
                </Link>
                <span className="text-gray-500 ml-2">— Reports and scanners</span>
              </li>
              <li>
                <Link href="/watchlist" className="text-blue-600 hover:underline">
                  Watchlist
                </Link>
                <span className="text-gray-500 ml-2">— Symbols and strategies</span>
              </li>
            </ul>
          </div>
        </>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
          No active portfolio. Create one below or sign in again to get a default portfolio.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h4 className="font-medium text-gray-900 mb-3">Your portfolios</h4>
        {list.length === 0 ? (
          <p className="text-sm text-gray-600">No portfolios yet. Create one below.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0 flex-wrap">
                <span className="font-medium text-gray-900">{p.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSwitch(p.id)}
                    disabled={current?.id === p.id}
                    className="text-sm text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
                  >
                    {current?.id === p.id ? "Current" : "Set as default"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(p.id)}
                    className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id, p.name)}
                    disabled={deletingId === p.id}
                    className="text-sm text-red-600 hover:text-red-700 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
                  >
                    {deletingId === p.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleLinkId} className="mt-6 pt-4 border-t border-gray-200">
          <label htmlFor="link-id" className="block text-sm font-medium text-gray-700 mb-1">
            Link another login
          </label>
          <p className="text-xs text-gray-500 mb-2">
            If you created portfolios with a different login (e.g. access key), enter that identity so they appear here. For access key use <code className="bg-gray-100 px-1 rounded">key</code>.
          </p>
          <div className="flex gap-2 flex-wrap">
            <input
              id="link-id"
              type="text"
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
              placeholder='e.g. key'
              className="rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 flex-1 min-w-[120px]"
            />
            <button
              type="submit"
              disabled={linking || !linkId.trim()}
              className="rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-500 disabled:opacity-50"
            >
              {linking ? "Linking…" : "Link"}
            </button>
          </div>
        </form>

        <form onSubmit={handleCreatePortfolio} className="mt-6 pt-4 border-t border-gray-200">
          <label htmlFor="new-portfolio-name" className="block text-sm font-medium text-gray-700 mb-1">
            Create new portfolio
          </label>
          <div className="flex gap-2 flex-wrap">
            <input
              id="new-portfolio-name"
              type="text"
              value={newPortfolioName}
              onChange={(e) => setNewPortfolioName(e.target.value)}
              placeholder="Portfolio name"
              className="rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 flex-1 min-w-[160px]"
            />
            <button
              type="submit"
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
