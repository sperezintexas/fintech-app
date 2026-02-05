"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

type GrokChatConfig = {
  tools: { webSearch: boolean; marketData: boolean; portfolio: boolean; coveredCallRecs: boolean };
  context: { riskProfile?: string; strategyGoals?: string; systemPromptOverride?: string };
};

const DEFAULT_CONFIG: GrokChatConfig = {
  tools: { webSearch: true, marketData: true, portfolio: true, coveredCallRecs: true },
  context: { riskProfile: "medium", strategyGoals: "", systemPromptOverride: "" },
};

export type OrderContext = {
  symbol: string;
  strike: number;
  expiration: string;
  credit: number;
  quantity?: number;
  probOtm?: number;
};

type ChatInterfaceProps = {
  initialMessage?: string;
  initialOrderContext?: OrderContext;
};

export function ChatInterface({ initialMessage, initialOrderContext }: ChatInterfaceProps = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialMessage ?? "");
  const [orderContext, setOrderContext] = useState<OrderContext | undefined>(initialOrderContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState<GrokChatConfig>(DEFAULT_CONFIG);
  const [configSaving, setConfigSaving] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [lastStats, setLastStats] = useState<{
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    model?: string;
  } | null>(null);
  const [modelInUse, setModelInUse] = useState<string>("grok-4");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialMessage != null) setInput(initialMessage);
    if (initialOrderContext != null) setOrderContext(initialOrderContext);
  }, [initialMessage, initialOrderContext]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    fetch("/api/chat/config")
      .then((r) => r.json())
      .then((data) => {
        if (data?.tools || data?.context) {
          setConfig({
            tools: { ...DEFAULT_CONFIG.tools, ...data.tools },
            context: { ...DEFAULT_CONFIG.context, ...data.context },
          });
        }
        if (typeof data?.model === "string") setModelInUse(data.model);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/chat/history")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { role: string; content: string; timestamp?: string }[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setMessages(
            data.map((m) => ({
              id: crypto.randomUUID(),
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  const saveConfig = async () => {
    setConfigSaving(true);
    try {
      const res = await fetch("/api/chat/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) setConfigOpen(false);
    } finally {
      setConfigSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const historyForApi = messages.map((m) => ({ role: m.role, content: m.content }));
      const body: { message: string; history: { role: string; content: string }[]; orderContext?: OrderContext } = {
        message: trimmed,
        history: historyForApi,
      };
      if (orderContext) body.orderContext = orderContext;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to get response");
      }

      if (data.usage != null || data.model != null) {
        setLastStats({
          usage:
            data.usage &&
            typeof data.usage.prompt_tokens === "number" &&
            typeof data.usage.completion_tokens === "number" &&
            typeof data.usage.total_tokens === "number"
              ? data.usage
              : undefined,
          model: typeof data.model === "string" ? data.model : undefined,
        });
      }
      if (typeof data.model === "string") setModelInUse(data.model);

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response ?? "No response.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] min-h-[400px] bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <h3 className="font-medium text-gray-700">Chat</h3>
        <button
          type="button"
          onClick={() => setConfigOpen((o) => !o)}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          title="Configure tools and Grok context"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
      {configOpen && (
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 space-y-3">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Tools</p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.tools.webSearch}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      tools: { ...c.tools, webSearch: e.target.checked },
                    }))
                  }
                  className="rounded border-gray-300"
                />
                <span className="text-sm">Web Search</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.tools.marketData}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      tools: { ...c.tools, marketData: e.target.checked },
                    }))
                  }
                  className="rounded border-gray-300"
                />
                <span className="text-sm">Market Data</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.tools.portfolio}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      tools: { ...c.tools, portfolio: e.target.checked },
                    }))
                  }
                  className="rounded border-gray-300"
                />
                <span className="text-sm">Portfolio</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.tools.coveredCallRecs ?? true}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      tools: { ...c.tools, coveredCallRecs: e.target.checked },
                    }))
                  }
                  className="rounded border-gray-300"
                />
                <span className="text-sm">Covered Call Recs</span>
              </label>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Grok Context</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Risk profile</label>
                <select
                  value={config.context.riskProfile ?? "medium"}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      context: { ...c.context, riskProfile: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Strategy goals</label>
                <input
                  type="text"
                  value={config.context.strategyGoals ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      context: { ...c.context, strategyGoals: e.target.value },
                    }))
                  }
                  placeholder="e.g. Growth by 2030"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200"
                />
              </div>
            </div>
            <details className="mt-2">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">Advanced: System prompt override</summary>
              <textarea
                value={config.context.systemPromptOverride ?? ""}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    context: { ...c.context, systemPromptOverride: e.target.value },
                  }))
                }
                placeholder="Override default Grok system prompt (leave empty for default)"
                rows={3}
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 font-mono"
              />
            </details>
          </div>
          <button
            type="button"
            onClick={saveConfig}
            disabled={configSaving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {configSaving ? "Saving…" : "Save config"}
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-medium mb-2">Smart Grok Chat</p>
            <p className="text-sm max-w-md mx-auto">
              Ask about stocks, market outlook, portfolio, or investment strategies. Powered by yahooFinance data and xAI {modelInUse}.
            </p>
            <p className="text-xs mt-2 text-gray-400">Try:</p>
            <ul className="mt-3 text-sm space-y-1 text-gray-600">
              <li>• What&apos;s the price of TSLA?</li>
              <li>• What&apos;s the market outlook?</li>
              <li>• Show my portfolio</li>
              <li>• What am I watching? / How is my watchlist doing?</li>
              <li>• Market news and sentiment</li>
            </ul>
            <p className="mt-4 text-xs text-gray-500">
              Chat history loads automatically when you visit <Link href="/chat" className="text-blue-600 hover:underline">/chat</Link>.
            </p>
            <details className="mt-4 text-left max-w-md mx-auto">
              <summary className="text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700">
                Tool keywords — what triggers data
              </summary>
              <div className="mt-2 text-xs text-gray-500 space-y-2">
                <p><strong>Market News:</strong> market, news, outlook, trending, sentiment, conditions, indices</p>
                <p><strong>Stock Prices:</strong> price, quote, stock, option, trading, how much, current, value — or ticker (TSLA, AAPL)</p>
                <p><strong>Portfolio &amp; Watchlist:</strong> portfolio, holdings, positions, account, balance, watchlist, watching, tracking</p>
              </div>
            </details>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-900"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                  {msg.content.split("\n").map((line, i) => {
                    if (line.startsWith("**") && line.endsWith("**")) {
                      return (
                        <p key={i} className="font-semibold mt-2 first:mt-0">
                          {line.slice(2, -2)}
                        </p>
                      );
                    }
                    if (line.startsWith("- ")) {
                      return (
                        <li key={i} className="list-disc ml-4">
                          {line.slice(2)}
                        </li>
                      );
                    }
                    if (line.startsWith("  - ")) {
                      return (
                        <li key={i} className="list-none ml-2 text-sm">
                          {line.slice(4)}
                        </li>
                      );
                    }
                    return (
                      <p key={i} className="text-sm">
                        {line}
                      </p>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-red-700 text-sm">
            {error}
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-100">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about stocks, market, or portfolio..."
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            disabled={loading}
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Send
          </button>
          <button
            type="button"
            onClick={() => setStatsOpen((o) => !o)}
            className="px-4 py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium"
            title="Grok usage stats (tokens, model)"
          >
            Stats
          </button>
        </div>
        {statsOpen && (
          <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-700">
            <p className="font-medium text-gray-800 mb-2">Grok status</p>
            {lastStats && (lastStats.usage != null || lastStats.model != null) ? (
              <dl className="space-y-1">
                {lastStats.model != null && (
                  <>
                    <dt className="text-gray-500">Model</dt>
                    <dd className="font-mono">{lastStats.model}</dd>
                  </>
                )}
                {lastStats?.usage != null && (
                  <>
                    <dt className="text-gray-500 mt-2">Tokens</dt>
                    <dd className="font-mono">
                      prompt: {lastStats.usage.prompt_tokens} · completion: {lastStats.usage.completion_tokens} · total: {lastStats.usage.total_tokens}
                    </dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="text-gray-500">Send a message to see Grok usage stats (tokens, model).</p>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
