/**
 * xAI Grok client with tool calling support.
 * OpenAI-compatible API; tools enable web search and future extensions.
 */

import OpenAI from "openai";
import { searchWeb } from "./web-search";

const XAI_MODEL = "grok-4";

export type GrokMessage = OpenAI.Chat.ChatCompletionMessageParam;

export type GrokToolResult = {
  toolCallId: string;
  content: string;
};

/** Web search tool definition (OpenAI-compatible format). */
export const WEB_SEARCH_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the web for current information like weather, news, general facts, or real-time data. Use when the user asks about topics outside portfolio/market data (e.g., weather, world events, definitions).",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query (e.g., 'current weather Austin TX', 'latest Tesla news')",
        },
        num_results: {
          type: "number",
          description: "Number of results to return (default 5)",
          default: 5,
        },
      },
      required: ["query"],
    },
  },
};

const DEFAULT_TIMEOUT_MS = 60_000;
const DECISION_TIMEOUT_MS = 120_000; // Scanner Grok calls need longer
const RETRY_DELAYS_MS = [2000, 4000];

export function getXaiClient(timeoutMs?: number): OpenAI | null {
  const key = process.env.XAI_API_KEY;
  if (!key?.trim()) return null;
  return new OpenAI({
    apiKey: key,
    baseURL: "https://api.x.ai/v1",
    timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
}

/** Retry wrapper for Grok API calls that may timeout. */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T | null> {
  let lastErr: unknown;
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isTimeout =
        err instanceof Error &&
        (err.message?.toLowerCase().includes("timeout") ||
          err.message?.toLowerCase().includes("timed out"));
      if (i < RETRY_DELAYS_MS.length && isTimeout) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]));
      } else {
        break;
      }
    }
  }
  console.error(`${label} error:`, lastErr);
  return null;
}

/** Execute web_search tool and return formatted result. */
export async function executeWebSearch(
  args: { query?: string; num_results?: number }
): Promise<string> {
  const query = typeof args?.query === "string" ? args.query.trim() : "";
  if (!query) return JSON.stringify({ results: [], error: "Missing query" });

  const num = typeof args?.num_results === "number" ? Math.min(args.num_results, 10) : 5;
  const { results, error } = await searchWeb(query, num);

  if (error) {
    return JSON.stringify({ results: [], error });
  }

  const formatted = results
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.url}`)
    .join("\n\n");

  return formatted || JSON.stringify({ results: [], message: "No results found" });
}

/**
 * Call Grok with tools; handles tool-calling loop for web_search.
 * Pre-injected context (portfolio, news, prices) is passed in userContent.
 */
export async function callGrokWithTools(
  systemPrompt: string,
  userContent: string,
  options?: { tools?: OpenAI.Chat.ChatCompletionTool[] }
): Promise<string> {
  const client = getXaiClient();
  if (!client) {
    return "Grok API is not configured. Add XAI_API_KEY to .env.local.";
  }

  const tools = options?.tools ?? [WEB_SEARCH_TOOL];
  const useTools = Array.isArray(tools) && tools.length > 0;
  const messages: GrokMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  if (!useTools) {
    const completion = await client.chat.completions.create({
      model: XAI_MODEL,
      messages,
      max_tokens: 1024,
    });
    const text = completion.choices[0]?.message?.content?.trim();
    return text || "No response from Grok.";
  }

  const maxToolRounds = 3;
  let round = 0;

  while (round < maxToolRounds) {
    const completion = await client.chat.completions.create({
      model: XAI_MODEL,
      messages,
      tools,
      tool_choice: "auto",
      max_tokens: 1024,
    });

    const choice = completion.choices[0];
    const msg = choice?.message;

    if (!msg) {
      return "No response from Grok.";
    }

    const text = msg.content?.trim();
    const toolCalls = msg.tool_calls;

    if (!toolCalls?.length) {
      return text || "No response from Grok.";
    }

    for (const tc of toolCalls) {
      if (!("function" in tc) || !tc.function) continue;
      const name = tc.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments ?? "{}");
      } catch {
        /* ignore */
      }

      let resultContent = "";
      if (name === "web_search") {
        resultContent = await executeWebSearch(args as { query?: string; num_results?: number });
      } else {
        resultContent = JSON.stringify({ error: `Unknown tool: ${name}` });
      }

      messages.push({
        role: "assistant",
        content: msg.content || null,
        tool_calls: msg.tool_calls,
      });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: resultContent,
      });
    }

    round++;
  }

  return "Tool loop limit reached. Please try a simpler query.";
}

/** Context for option decision (used by OptionScanner hybrid). */
export type OptionDecisionContext = {
  position: {
    type: string;
    strike: number;
    expiration: string;
    qty: number;
    costBasis: number;
    optionType: "call" | "put";
  };
  marketData: {
    underlyingPrice: number;
    optionPrice: number;
    iv?: number;
    delta?: number;
    theta?: number;
    dte: number;
    plPercent: number;
  };
  preliminary: { recommendation: string; reason: string };
  accountContext?: { riskProfile?: string; strategyGoals?: string };
};

/** Grok response for option decision. */
export type OptionDecisionResult = {
  recommendation: "HOLD" | "BUY_TO_CLOSE";
  confidence: number;
  explanation: string;
};

const DEFAULT_OPTION_DECISION_PROMPT = `You are a conservative options trading advisor. Given this position and current market data, decide whether to HOLD or BUY_TO_CLOSE. Be concise, risk-aware, explain reasoning step-by-step.`;

/**
 * Call Grok for option HOLD/BTC decision. Used by OptionScanner hybrid stage.
 * Returns JSON: { recommendation, confidence, explanation }.
 */
export async function callOptionDecision(
  context: OptionDecisionContext,
  options?: { grokSystemPromptOverride?: string }
): Promise<OptionDecisionResult | null> {
  const client = getXaiClient(DECISION_TIMEOUT_MS);
  if (!client) return null;

  const systemPart =
    options?.grokSystemPromptOverride?.trim() || DEFAULT_OPTION_DECISION_PROMPT;
  const prompt = `${systemPart}

Position: ${context.position.optionType} ${context.position.type} @ $${context.position.strike}, exp ${context.position.expiration}, ${context.position.qty} contracts, cost basis $${context.position.costBasis}
Market: underlying $${context.marketData.underlyingPrice}, option $${context.marketData.optionPrice}, DTE ${context.marketData.dte}, P/L ${context.marketData.plPercent.toFixed(1)}%${context.marketData.iv != null ? `, IV ${context.marketData.iv.toFixed(1)}%` : ""}
Preliminary: ${context.preliminary.recommendation} — ${context.preliminary.reason}
${context.accountContext?.riskProfile ? `Account risk: ${context.accountContext.riskProfile}` : ""}

Output JSON only, no markdown: {"recommendation":"HOLD"|"BUY_TO_CLOSE","confidence":0.0-1.0,"explanation":"..."}`;

  const result = await withRetry(async () => {
    const completion = await client!.chat.completions.create({
      model: XAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 512,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return null;

    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      recommendation?: string;
      confidence?: number;
      explanation?: string;
      reason?: string;
    };

    const rec = parsed.recommendation?.toUpperCase();
    const action: OptionDecisionResult["recommendation"] =
      rec === "BUY_TO_CLOSE" ? "BUY_TO_CLOSE" : "HOLD";
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;
    const explanation =
      typeof parsed.explanation === "string"
        ? parsed.explanation
        : typeof parsed.reason === "string"
          ? parsed.reason
          : "";

    return { recommendation: action, confidence, explanation };
  }, "callOptionDecision");

  return result;
}

/** Context for covered call decision (used by Covered Call Scanner hybrid). */
export type CoveredCallDecisionContext = {
  position: {
    symbol: string;
    strike: number;
    expiration: string;
    premiumReceived: number;
    quantity: number;
  };
  marketData: {
    stockPrice: number;
    callBid: number;
    callAsk: number;
    dte: number;
    unrealizedPl: number;
    extrinsicPercentOfPremium?: number;
    ivRank?: number;
    moneyness?: string;
  };
  preliminary: { recommendation: string; reason: string };
  accountContext?: { riskProfile?: string };
};

/** Grok response for covered call decision. */
export type CoveredCallDecisionResult = {
  recommendation: "HOLD" | "BUY_TO_CLOSE" | "SELL_NEW_CALL" | "ROLL" | "NONE";
  confidence: number;
  reasoning: string;
};

const DEFAULT_COVERED_CALL_DECISION_PROMPT = `You are a conservative covered call advisor. Given this position and market data, decide: HOLD, BUY_TO_CLOSE, SELL_NEW_CALL, or ROLL. Be concise, risk-aware.`;

/**
 * Call Grok for covered call HOLD/BTC/SELL_NEW_CALL/ROLL decision. Used by Covered Call Scanner hybrid stage.
 */
export async function callCoveredCallDecision(
  context: CoveredCallDecisionContext,
  options?: { grokSystemPromptOverride?: string }
): Promise<CoveredCallDecisionResult | null> {
  const client = getXaiClient(DECISION_TIMEOUT_MS);
  if (!client) return null;

  const { position, marketData, preliminary } = context;
  const systemPart =
    options?.grokSystemPromptOverride?.trim() || DEFAULT_COVERED_CALL_DECISION_PROMPT;
  const prompt = `${systemPart}

Position: ${position.symbol} call @ $${position.strike}, exp ${position.expiration}, premium received $${position.premiumReceived}, ${position.quantity} contracts
Market: stock $${marketData.stockPrice}, call bid $${marketData.callBid}/ask $${marketData.callAsk}, DTE ${marketData.dte}, unrealized P/L $${marketData.unrealizedPl}${marketData.ivRank != null ? `, IV rank ${marketData.ivRank}` : ""}${marketData.moneyness ? `, ${marketData.moneyness}` : ""}
Preliminary: ${preliminary.recommendation} — ${preliminary.reason}
${context.accountContext?.riskProfile ? `Account risk: ${context.accountContext.riskProfile}` : ""}

Output JSON only, no markdown: {"recommendation":"HOLD"|"BUY_TO_CLOSE"|"SELL_NEW_CALL"|"ROLL"|"NONE","confidence":0.0-1.0,"reasoning":"..."}`;

  const result = await withRetry(async () => {
    const completion = await client!.chat.completions.create({
      model: XAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 512,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return null;

    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      recommendation?: string;
      confidence?: number;
      reasoning?: string;
      explanation?: string;
    };

    const rec = parsed.recommendation?.toUpperCase();
    const validActions = ["HOLD", "BUY_TO_CLOSE", "SELL_NEW_CALL", "ROLL", "NONE"] as const;
    const action = validActions.includes(rec as (typeof validActions)[number])
      ? (rec as (typeof validActions)[number])
      : "HOLD";
    const confidence =
      typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;
    const reasoning =
      typeof parsed.reasoning === "string"
        ? parsed.reasoning
        : typeof parsed.explanation === "string"
          ? parsed.explanation
          : "";

    return { recommendation: action, confidence, reasoning };
  }, "callCoveredCallDecision");

  return result;
}
