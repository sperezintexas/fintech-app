import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getMarketNewsAndOutlook, getStockAndOptionPrices } from "@/lib/yahoo";
import { getDb } from "@/lib/mongodb";
import type { Account } from "@/types/portfolio";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

const XAI_MODEL = "grok-4";

function getXaiClient(): OpenAI | null {
  const key = process.env.XAI_API_KEY;
  if (!key?.trim()) return null;
  return new OpenAI({
    apiKey: key,
    baseURL: "https://api.x.ai/v1",
    timeout: 60_000,
  });
}

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

function extractSymbols(text: string): string[] {
  const matches = text.match(SYMBOL_REGEX) ?? [];
  const known = new Set(["SPY", "QQQ", "DIA", "IWM", "AAPL", "TSLA", "MSFT", "GOOGL", "AMZN", "META", "NVDA"]);
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
  return /\b(portfolio|holdings|positions|account|balance)\b/.test(lower);
}

function buildToolContext(toolResults: {
  marketNews?: unknown;
  stockPrices?: unknown;
  portfolio?: unknown;
}): string {
  const parts: string[] = [];
  if (toolResults.marketNews) {
    const m = toolResults.marketNews as {
      news?: { title: string; summary: string }[];
      outlook?: { summary: string; sentiment: string };
    };
    parts.push("## Market Data\n");
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
    parts.push("\n## Stock Data\n");
    parts.push(`Price: $${s.stock.price.toFixed(2)}, Change: ${s.stock.change >= 0 ? "+" : ""}$${s.stock.change.toFixed(2)} (${(s.stock.changePercent ?? 0).toFixed(2)}%), Volume: ${s.stock.volume.toLocaleString()}`);
    if (s.options?.calls?.length || s.options?.puts?.length) parts.push("Options chain available.");
  }
  if (toolResults.portfolio) {
    const p = toolResults.portfolio as {
      accounts: { name: string; balance: number; positions: { ticker?: string; shares?: number; currentPrice?: number }[] }[];
    };
    parts.push("\n## Portfolio\n");
    for (const acc of p.accounts ?? []) {
      parts.push(`${acc.name}: $${acc.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
      for (const pos of acc.positions?.slice(0, 5) ?? []) {
        if (pos.ticker) {
          const val = (pos.shares ?? 0) * (pos.currentPrice ?? 0);
          parts.push(`  - ${pos.ticker}: ${pos.shares} shares @ $${(pos.currentPrice ?? 0).toFixed(2)} = $${val.toFixed(2)}`);
        }
      }
    }
  }
  return parts.join("\n");
}

function buildFallbackResponse(
  toolResults: { marketNews?: unknown; stockPrices?: unknown; portfolio?: unknown }
): string {
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

    const body = await request.json();
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message too long (max ${MAX_MESSAGE_LENGTH} chars)` },
        { status: 400 }
      );
    }

    const toolResults: { marketNews?: unknown; stockPrices?: unknown; portfolio?: unknown } = {};

    if (needsPortfolioTool(message)) {
      try {
        const db = await getDb();
        type AccountDoc = Omit<Account, "_id"> & { _id: ObjectId };
        const accounts = await db.collection<AccountDoc>("accounts").find({}).toArray();
        const prices = await import("@/lib/yahoo").then((m) =>
          m.getMultipleTickerPrices(
            accounts.flatMap((a) => a.positions?.map((p) => p.ticker).filter(Boolean) ?? []).filter(Boolean) as string[]
          )
        );
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
      } catch (e) {
        console.error("Chat portfolio tool error:", e);
      }
    }

    if (needsNewsTool(message)) {
      try {
        toolResults.marketNews = await getMarketNewsAndOutlook({ limit: 10, region: "US" });
      } catch (e) {
        console.error("Chat market news tool error:", e);
      }
    }

    const symbols = extractSymbols(message);
    if (needsPriceTool(message) && symbols.length > 0) {
      const symbol = symbols[0];
      try {
        const prices = await getStockAndOptionPrices(symbol, {
          includeOptions: /\b(option|call|put|chain)\b/i.test(message),
        });
        if (prices) toolResults.stockPrices = prices;
      } catch (e) {
        console.error("Chat stock price tool error:", e);
      }
    }

    const toolContext = buildToolContext(toolResults);
    const xaiClient = getXaiClient();

    let response: string;

    if (xaiClient) {
      try {
        const systemPrompt = `You are Grok, a leading financial expert for myInvestments. You advise on maximizing profits using current, mid, and future potential earnings for valuable companies like TESLA. Provide brief, direct answers with no leading intro; offer more details when asked. Focus on moderate and aggressive suggestions, sound options strategies around TSLA, SpaceX proxies, xAI/Grok proxies, and defense investments. Use the provided market/portfolio data to inform your response. Always include a brief disclaimer that this is not financial advice.`;

        const userContent = toolContext.trim()
          ? `[Context from tools]\n${toolContext}\n\n[User question]\n${message}`
          : message;

        const completion = await xaiClient.chat.completions.create({
          model: XAI_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          max_tokens: 1024,
        });

        const text = completion.choices[0]?.message?.content?.trim();
        response = text || buildFallbackResponse(toolResults);
      } catch (e) {
        console.error("xAI Grok API error:", e);
        response = buildFallbackResponse(toolResults);
      }
    } else {
      response = buildFallbackResponse(toolResults);
    }

    return NextResponse.json({
      response,
      toolResults: Object.keys(toolResults).length > 0 ? toolResults : undefined,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}
