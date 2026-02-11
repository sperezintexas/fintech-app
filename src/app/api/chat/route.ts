import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMarketNewsAndOutlook, getStockAndOptionPrices } from "@/lib/yahoo";
import { getDb } from "@/lib/mongodb";
import type { Account } from "@/types/portfolio";
import { ObjectId } from "mongodb";
import { callGrokWithTools, WEB_SEARCH_TOOL, COVERED_CALL_ALTERNATIVES_TOOL, LIST_JOBS_TOOL, TRIGGER_PORTFOLIO_SCAN_TOOL } from "@/lib/xai-grok";
import { getGrokChatConfig } from "@/lib/grok-chat-config";
import { getPersonaPrompt } from "@/lib/chat-personas";
import { appendChatHistory } from "@/lib/chat-history";
import { getRecentCoveredCallRecommendations } from "@/lib/covered-call-analyzer";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 min
const RATE_LIMIT_MAX = 20;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function getClientId(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(clientId);
  if (!entry) {
    rateLimitMap.set(clientId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (now > entry.resetAt) {
    rateLimitMap.set(clientId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

const SYMBOL_REGEX = /\b([A-Z]{1,5})\b/g;

/** Extract ticker symbols (2–5 chars). Normalizes case so "tsla" or "TSLA" both yield ["TSLA"]. */
function extractSymbols(text: string): string[] {
  const upper = text.toUpperCase();
  const matches = upper.match(SYMBOL_REGEX) ?? [];
  return [...new Set(matches.filter((s) => s.length >= 2 && s.length <= 5))];
}

function needsPriceTool(query: string): boolean {
  const lower = query.toLowerCase();
  return (
    /\b(price|quote|stock|option|trading|how much|current|value)\b/.test(lower) ||
    extractSymbols(query).length > 0
  );
}

function needsNewsTool(query: string): boolean {
  const lower = query.toLowerCase();
  return /\b(market|news|outlook|trending|sentiment|conditions|indices)\b/.test(lower);
}

function needsPortfolioTool(query: string): boolean {
  const lower = query.toLowerCase();
  return /\b(portfolio|holdings|positions|account|balance|watchlist|watching|tracking)\b/.test(lower);
}

function needsRiskTool(query: string): boolean {
  const lower = query.toLowerCase();
  return /\b(risk|var|beta|sharpe|diversification|volatility|stress|analyze.*portfolio)\b/.test(lower);
}

function needsCoveredCallTool(query: string): boolean {
  const lower = query.toLowerCase();
  return (
    /\b(covered call|my calls?|scanner|recommendations?|btc|buy to close|roll|assign|assignment|expiration|expiring)\b/.test(
      lower
    ) ||
    /\b(should i (btc|roll|close)|what.*recommend)\b/.test(lower) ||
    /\b(better value|alternatives?|higher (premium|prob|otm)|same week|next week)\b/.test(lower)
  );
}

function buildToolContext(toolResults: {
  marketNews?: unknown;
  stockPrices?: unknown;
  portfolio?: unknown;
  watchlist?: unknown;
  riskAnalysis?: unknown;
  coveredCallRecommendations?: unknown;
  orderContext?: unknown;
  symbol?: string;
}): string {
  const parts: string[] = [];
  const now = new Date();
  const timestamp = now.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  // Add prominent data freshness header
  parts.push("=== REAL-TIME DATA (USE THIS, NOT TRAINING DATA) ===");
  parts.push(`Data retrieved: ${timestamp}\n`);

  if (toolResults.marketNews) {
    const m = toolResults.marketNews as {
      news?: { title: string; summary: string }[];
      outlook?: { summary: string; sentiment: string };
    };
    parts.push("## Market Data (LIVE)\n");
    if (m.outlook?.summary) parts.push(m.outlook.summary);
    if (m.outlook?.sentiment) parts.push(`\nSentiment: ${m.outlook.sentiment}`);
    if (m.news?.length) {
      parts.push("\nRecent developments:");
      m.news.slice(0, 5).forEach((n, i) => parts.push(`${i + 1}. ${n.title || n.summary}`));
    }
  }
  if (toolResults.stockPrices) {
    const s = toolResults.stockPrices as {
      stock: { price: number; change: number; volume: number; changePercent?: number };
      options?: { calls: unknown[]; puts: unknown[] };
    };
    const sym = toolResults.symbol ?? "Stock";
    parts.push(`\n## ${sym} Price Data (LIVE - fetched ${timestamp})\n`);
    parts.push(`CURRENT PRICE: $${s.stock.price.toFixed(2)}`);
    parts.push(`Today's Change: ${s.stock.change >= 0 ? "+" : ""}$${s.stock.change.toFixed(2)} (${(s.stock.changePercent ?? 0).toFixed(2)}%)`);
    parts.push(`Volume: ${s.stock.volume.toLocaleString()}`);
    if (s.options?.calls?.length || s.options?.puts?.length) parts.push("Options chain available.");
  }
  if (toolResults.portfolio) {
    const p = toolResults.portfolio as {
      accounts: { name: string; balance: number; positions: { ticker?: string; shares?: number; currentPrice?: number }[] }[];
    };
    parts.push("\n## Portfolio (LIVE PRICES)\n");
    for (const acc of p.accounts ?? []) {
      parts.push(`${acc.name}: $${acc.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
      for (const pos of acc.positions?.slice(0, 5) ?? []) {
        if (pos.ticker) {
          const val = (pos.shares ?? 0) * (pos.currentPrice ?? 0);
          parts.push(`  - ${pos.ticker}: ${pos.shares} shares @ $${(pos.currentPrice ?? 0).toFixed(2)} (CURRENT) = $${val.toFixed(2)}`);
        }
      }
    }
  }
  if (toolResults.riskAnalysis) {
    const r = toolResults.riskAnalysis as {
      riskLevel?: string;
      recommendations?: string[];
      explanation?: string;
      metrics?: { totalValue?: number; vaR95?: number; beta?: number; diversification?: number };
    };
    parts.push("\n## Risk Analysis\n");
    parts.push(`Risk level: ${r.riskLevel ?? "—"}`);
    if (r.explanation) parts.push(r.explanation);
    if (r.recommendations?.length) {
      parts.push("\nRecommendations:");
      r.recommendations.forEach((rec) => parts.push(`  - ${rec}`));
    }
    if (r.metrics) {
      parts.push(`\nMetrics: Total $${(r.metrics.totalValue ?? 0).toLocaleString()}, VaR(95%) $${(r.metrics.vaR95 ?? 0).toLocaleString()}, Beta ${r.metrics.beta ?? "—"}, Diversification ${((r.metrics.diversification ?? 0) * 100).toFixed(1)}%`);
    }
  }
  if (toolResults.watchlist) {
    const w = toolResults.watchlist as {
      watchlists: { name: string; items: { symbol: string; type?: string; strategy?: string; quantity?: number; entryPrice?: number; strikePrice?: number; expirationDate?: string; currentPrice?: number; notes?: string; rationale?: string }[] }[];
    };
    parts.push("\n## Watchlist (LIVE PRICES)\n");
    for (const wl of w.watchlists ?? []) {
      if (wl.items?.length > 0) {
        parts.push(`${wl.name}:`);
        for (const item of wl.items.slice(0, 10)) {
          const priceStr = item.currentPrice != null ? ` @ $${item.currentPrice.toFixed(2)} (CURRENT)` : "";
          const optStr =
            item.strikePrice != null && item.expirationDate
              ? ` ${item.type ?? ""} ${item.strikePrice} exp ${item.expirationDate}`
              : "";
          const rationaleStr = item.rationale ? ` [Last run: ${item.rationale}]` : "";
          parts.push(`  - ${item.symbol}${optStr} qty ${item.quantity ?? 0} entry $${(item.entryPrice ?? 0).toFixed(2)}${priceStr}${rationaleStr}${item.notes ? ` (${item.notes})` : ""}`);
        }
      }
    }
  }
  if (toolResults.orderContext) {
    const o = toolResults.orderContext as {
      symbol?: string;
      strike?: number;
      expiration?: string;
      credit?: number;
      quantity?: number;
      probOtm?: number;
    };
    parts.push("\n## xStrategyBuilder Order (use for covered_call_alternatives)\n");
    parts.push(`Symbol: ${o.symbol ?? "—"}, Strike: $${o.strike ?? "—"}, Expiration: ${o.expiration ?? "—"}, Credit: $${o.credit ?? "—"}, Quantity: ${o.quantity ?? 1}, Prob OTM: ${o.probOtm ?? "—"}%`);
    parts.push("\nWhen the user asks for better value or alternatives, call covered_call_alternatives with these values.");
  }
  if (toolResults.coveredCallRecommendations) {
    const recs = toolResults.coveredCallRecommendations as Array<{
      symbol: string;
      recommendation: string;
      reason: string;
      source?: string;
      confidence?: string;
      strikePrice?: number;
      expirationDate?: string;
      metrics?: { stockPrice?: number; dte?: number; moneyness?: string };
      storedAt?: string;
      grokEvaluated?: boolean;
    }>;
    parts.push("\n## Covered Call Recommendations (from scanner)\n");
    if (recs.length === 0) {
      parts.push("No recent covered call recommendations in the system. Run the Covered Call Scanner (Automation) to generate recommendations.");
    } else {
      recs.slice(0, 15).forEach((r, i) => {
        const meta = [r.strikePrice != null ? `$${r.strikePrice}` : "", r.expirationDate ?? "", r.metrics?.dte != null ? `DTE ${r.metrics.dte}` : ""].filter(Boolean).join(" ");
        parts.push(`${i + 1}. ${r.symbol} ${r.recommendation} — ${r.reason}${meta ? ` (${meta})` : ""}${r.storedAt ? ` [stored ${r.storedAt}]` : ""}`);
      });
    }
  }
  return parts.join("\n");
}

function buildFallbackResponse(toolResults: {
  marketNews?: unknown;
  stockPrices?: unknown;
  portfolio?: unknown;
  watchlist?: unknown;
  riskAnalysis?: unknown;
  coveredCallRecommendations?: unknown;
}): string {
  const ctx = buildToolContext(toolResults);
  if (!ctx.trim()) {
    return "I couldn't find relevant market data for your query. Try asking about a specific stock (e.g., \"What's the price of TSLA?\") or market conditions (e.g., \"What's the market outlook?\").";
  }
  return ctx + "\n\n*Data from Yahoo Finance. Not financial advice.*";
}

export async function POST(request: NextRequest) {
  try {
    const clientId = getClientId(request);
    if (!checkRateLimit(clientId)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a minute before sending more messages." },
        { status: 429 }
      );
    }

    const body = (await request.json()) as {
      message?: string;
      history?: { role?: string; content?: string }[];
      orderContext?: {
        symbol?: string;
        strike?: number;
        expiration?: string;
        credit?: number;
        quantity?: number;
        probOtm?: number;
      };
    };
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const orderContext = body?.orderContext;
    const history = Array.isArray(body?.history)
      ? (body.history as { role?: string; content?: string }[]).filter(
          (m) => m?.role && m?.content && ["user", "assistant"].includes(m.role)
        )
      : [];
    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message too long (max ${MAX_MESSAGE_LENGTH} chars)` },
        { status: 400 }
      );
    }

    const grokConfig = await getGrokChatConfig();
    const { tools: toolConfig, context: ctxConfig } = grokConfig;

    const toolResults: {
      marketNews?: unknown;
      stockPrices?: unknown;
      portfolio?: unknown;
      watchlist?: unknown;
      riskAnalysis?: unknown;
      coveredCallRecommendations?: unknown;
      orderContext?: unknown;
    } = {};

    if (orderContext && typeof orderContext === "object") {
      toolResults.orderContext = orderContext;
    }

    if (toolConfig.portfolio && needsPortfolioTool(message)) {
      try {
        const db = await getDb();
        type AccountDoc = Omit<Account, "_id"> & { _id: ObjectId };
        const accounts = await db.collection<AccountDoc>("accounts").find({}).toArray();
        const portfolioTickers = accounts.flatMap((a) =>
          (a.positions ?? []).map((p) => p.ticker).filter(Boolean)
        ) as string[];

        type WatchlistDoc = { _id: ObjectId; name: string };
        type WatchlistItemDoc = {
          watchlistId?: string | ObjectId;
          symbol?: string;
          underlyingSymbol?: string;
          type?: string;
          strategy?: string;
          quantity?: number;
          entryPrice?: number;
          strikePrice?: number;
          expirationDate?: string;
          notes?: string;
          rationale?: string;
        };
        const watchlists = await db.collection<WatchlistDoc>("watchlists").find({}).sort({ name: 1 }).toArray();
        const watchlistItems = await db.collection<WatchlistItemDoc>("watchlist").find({}).sort({ addedAt: -1 }).toArray();
        const watchlistTickers = [
          ...new Set(
            watchlistItems.map((i) => i.symbol ?? i.underlyingSymbol).filter(Boolean)
          ),
        ] as string[];

        const allTickers = [...new Set([...portfolioTickers, ...watchlistTickers])];
        const prices = await import("@/lib/yahoo").then((m) => m.getMultipleTickerPrices(allTickers));

        const accountsWithPrices = accounts.map((acc) => {
          const positions = (acc.positions ?? []).map((pos) => {
            const livePrice = pos.ticker ? prices.get(pos.ticker)?.price : undefined;
            return { ...pos, currentPrice: livePrice ?? pos.currentPrice };
          });
          const balance = positions.reduce(
            (sum, p) => sum + (p.shares ?? 0) * (p.currentPrice ?? 0),
            0
          );
          return { name: acc.name, balance, positions };
        });
        toolResults.portfolio = { accounts: accountsWithPrices };

        const defaultWatchlistId = watchlists.find((w) => w.name === "Default")?._id?.toString();
        const watchlistsWithItems = watchlists.map((w) => {
          const wlId = w._id.toString();
          const isDefault = defaultWatchlistId && wlId === defaultWatchlistId;
          const items = watchlistItems.filter((i) => {
            const itemWlId = i.watchlistId != null ? String(i.watchlistId) : "";
            return itemWlId === wlId || (isDefault && !itemWlId);
          });
          const enriched = items.slice(0, 15).map((item) => {
            const sym = item.symbol ?? item.underlyingSymbol ?? "";
            const livePrice = sym ? prices.get(sym)?.price : undefined;
            return {
              symbol: sym,
              type: item.type,
              strategy: item.strategy,
              quantity: item.quantity,
              entryPrice: item.entryPrice,
              strikePrice: item.strikePrice,
              expirationDate: item.expirationDate,
              currentPrice: livePrice,
              notes: item.notes,
              rationale: item.rationale,
            };
          });
          return { name: w.name, items: enriched };
        });
        toolResults.watchlist = { watchlists: watchlistsWithItems };
      } catch (e) {
        console.error("Chat portfolio tool error:", e);
      }
    }

    if (toolConfig.portfolio && needsRiskTool(message)) {
      try {
        const db = await getDb();
        type AccountDoc = Omit<Account, "_id"> & { _id: ObjectId };
        const accounts = await db.collection<AccountDoc>("accounts").find({}).toArray();
        const { getMultipleTickerPrices } = await import("@/lib/yahoo");
        const tickers = [...new Set(accounts.flatMap((a) => (a.positions ?? []).map((p) => p.ticker).filter((t): t is string => !!t)))];
        const prices = tickers.length > 0 ? await getMultipleTickerPrices(tickers) : new Map();
        const accountsWithPrices = accounts.map((acc) => ({
          ...acc,
          _id: acc._id.toString(),
          positions: (acc.positions ?? []).map((pos) => {
            if (pos.type === "stock" && pos.ticker) {
              const p = prices.get(pos.ticker);
              return { ...pos, currentPrice: p?.price ?? pos.currentPrice ?? pos.purchasePrice };
            }
            return pos;
          }),
        }));
        const { computeRiskMetricsWithPositions } = await import("@/lib/risk-management");
        const { analyzeRiskWithGrok } = await import("@/lib/xai-grok");
        const { metrics, positions } = await computeRiskMetricsWithPositions(accountsWithPrices);
        const profile = accounts[0]?.riskLevel ?? "medium";
        const analysis = await analyzeRiskWithGrok({ profile, metrics, positions });
        if (analysis) {
          toolResults.riskAnalysis = {
            riskLevel: analysis.riskLevel,
            recommendations: analysis.recommendations,
            explanation: analysis.explanation,
            metrics: { totalValue: metrics.totalValue, vaR95: metrics.vaR95, beta: metrics.beta, diversification: metrics.diversification },
          };
        }
      } catch (e) {
        console.error("Chat risk tool error:", e);
      }
    }

    if (toolConfig.marketData && needsNewsTool(message)) {
      try {
        toolResults.marketNews = await getMarketNewsAndOutlook({ limit: 10, region: "US" });
      } catch (e) {
        console.error("Chat market news tool error:", e);
      }
    }

    if (toolConfig.coveredCallRecs && needsCoveredCallTool(message)) {
      try {
        const recs = await getRecentCoveredCallRecommendations(20);
        toolResults.coveredCallRecommendations = recs;
      } catch (e) {
        console.error("Chat covered call recommendations tool error:", e);
      }
    }

    const symbols = extractSymbols(message);
    let queriedSymbol: string | undefined;
    if (toolConfig.marketData && needsPriceTool(message) && symbols.length > 0) {
      const symbol = symbols[0];
      queriedSymbol = symbol;
      try {
        const prices = await getStockAndOptionPrices(symbol, {
          includeOptions: /\b(option|call|put|chain)\b/i.test(message),
        });
        if (prices) toolResults.stockPrices = prices;
      } catch (e) {
        console.error("Chat stock price tool error:", e);
      }
    }

    const toolContext = buildToolContext({ ...toolResults, symbol: queriedSymbol });

    let response: string;
    let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
    let model: string | undefined;

    try {
    const personaPrompt = ctxConfig.persona ? getPersonaPrompt(ctxConfig.persona) ?? '' : '';
    const overridePrompt = ctxConfig.systemPromptOverride?.trim() ?? '';
    const defaultPrompt = getPersonaPrompt('finance-expert') ?? 'You are Grok, a helpful assistant.';
    const basePrompt = personaPrompt || overridePrompt || defaultPrompt;

      const riskLine = ctxConfig.riskProfile
        ? `\nUser risk profile: ${ctxConfig.riskProfile}. Tailor advice accordingly.`
        : "";
      const goalsLine = ctxConfig.strategyGoals?.trim()
        ? `\nUser strategy goals: ${ctxConfig.strategyGoals}`
        : "";
      const toolsLine = toolConfig.webSearch
        ? "\nFor current stock/option prices always use the pre-injected [Context from tools] data first. Use web_search only for earnings dates, news, sentiment, or facts not already in that context (e.g. 'TSLA earnings', 'Tesla FSD news')."
        : "";

      const dataFreshnessInstructions = `
CRITICAL: Use ONLY the current stock/option data provided below.
- Your training data is OUTDATED. Do NOT use prices from your training.
- The [Context from tools] section contains REAL-TIME data (LIVE/CURRENT) just fetched from Yahoo Finance.
- For any price, quote, or options question: use ONLY the numbers from that section when present.
- Never say "as of my last update"; cite the live data and its timestamp.
- If no real-time data is provided for a symbol, say so and use web_search only then for current price.`;

      const systemPrompt = `${basePrompt}${riskLine}${goalsLine}${toolsLine}${dataFreshnessInstructions}
Use the provided market/portfolio context when available. Reason step-by-step internally when combining multiple data sources.
Always include a brief disclaimer that this is not financial advice.`;

      const historyBlock =
        history.length > 0
          ? history
              .slice(-10)
              .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
              .join("\n\n") + "\n\n"
          : "";
      const userContent = toolContext.trim()
        ? `${historyBlock}[Context from tools - REAL-TIME DATA - USE THIS FOR PRICES]\n${toolContext}\n\n[User question]\n${message}`
        : historyBlock
          ? `${historyBlock}[User question]\n${message}`
          : message;

      const grokTools = [...(toolConfig.webSearch ? [WEB_SEARCH_TOOL] : [])];
      if (toolConfig.coveredCallRecs && (orderContext || needsCoveredCallTool(message))) {
        grokTools.push(COVERED_CALL_ALTERNATIVES_TOOL);
      }
      if (toolConfig.jobs) {
        grokTools.push(LIST_JOBS_TOOL, TRIGGER_PORTFOLIO_SCAN_TOOL);
      }
      const grokResult = await callGrokWithTools(systemPrompt, userContent, { tools: grokTools });
      response = grokResult.text;
      if (!response?.trim() || response.includes("Tool loop limit")) {
        response = buildFallbackResponse(toolResults);
      } else {
        usage = grokResult.usage;
        model = grokResult.model;
      }
    } catch (e) {
      console.error("xAI Grok API error:", e);
      response = buildFallbackResponse(toolResults);
    }

    const session = await auth();
    const userId = session?.user?.id ?? (session?.user as { username?: string })?.username;
    if (userId) {
      try {
        await appendChatHistory(userId, [
          { role: "user", content: message, timestamp: new Date().toISOString() },
          { role: "assistant", content: response, timestamp: new Date().toISOString() },
        ]);
      } catch (e) {
        console.error("Chat history save error:", e);
      }
    }

    return NextResponse.json({
      response,
      toolResults: Object.keys(toolResults).length > 0 ? toolResults : undefined,
      usage: usage ?? undefined,
      model: model ?? undefined,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}
