/**
 * xAI Grok client with tool calling support.
 * OpenAI-compatible API; tools enable web search and future extensions.
 */

import OpenAI from "openai";
import { searchWeb } from "./web-search";

export const XAI_MODEL = process.env.XAI_MODEL || "grok-4";

export type GrokUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

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
      "Search the web for current information: weather, news, general facts, earnings dates, analyst views, and real-time data. Use for: company/news (e.g. 'TSLA earnings date', 'Tesla FSD news'), market sentiment, weather, world events, definitions. Use when the user asks about topics not fully covered by the provided portfolio/market context.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query. Examples: 'TSLA earnings date 2026', 'Tesla stock news today', 'BA defense sector outlook', 'current weather Austin TX'",
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

/** Covered call alternatives tool: find options with higher prob OTM and higher premium (same/next week). */
export const COVERED_CALL_ALTERNATIVES_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: "function",
  function: {
    name: "covered_call_alternatives",
    description:
      "Find covered call alternatives for a given scenario: same or next week expirations, with higher probability of expiring OTM (e.g. ~70%) and higher premium. Use when the user describes a short call trade (symbol, strike, expiration, credit, prob OTM) and asks for better value, higher OTM%, or alternatives.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Underlying symbol (e.g. TSLA)" },
        strike: { type: "number", description: "Current strike price" },
        expiration: { type: "string", description: "Current expiration date (YYYY-MM-DD)" },
        credit: { type: "number", description: "Current expected credit (total $)" },
        quantity: { type: "number", description: "Number of contracts (default 1)" },
        min_prob_otm: { type: "number", description: "Minimum probability OTM target (default 70)" },
      },
      required: ["symbol", "strike", "expiration", "credit"],
    },
  },
};

export type CoveredCallAlternativesArgs = {
  symbol?: string;
  strike?: number;
  expiration?: string;
  credit?: number;
  quantity?: number;
  min_prob_otm?: number;
};

/** Execute covered_call_alternatives tool using Yahoo data. */
export async function executeCoveredCallAlternatives(
  args: CoveredCallAlternativesArgs
): Promise<string> {
  const symbol = typeof args?.symbol === "string" ? args.symbol.trim().toUpperCase() : "";
  const strike = typeof args?.strike === "number" ? args.strike : undefined;
  const expiration = typeof args?.expiration === "string" ? args.expiration.trim() : "";
  const credit = typeof args?.credit === "number" ? args.credit : undefined;
  const quantity = typeof args?.quantity === "number" ? args.quantity : 1;
  const minProbOtm = typeof args?.min_prob_otm === "number" ? args.min_prob_otm : 70;

  if (!symbol || strike == null || !expiration || credit == null) {
    return JSON.stringify({
      error: "Missing required parameters: symbol, strike, expiration, credit",
      alternatives: [],
    });
  }

  const { getCoveredCallAlternatives } = await import("@/lib/yahoo");
  const alternatives = await getCoveredCallAlternatives(symbol, {
    currentStrike: strike,
    currentExpiration: expiration,
    currentCredit: credit,
    quantity,
    minProbOtm,
    limit: 10,
  });

  if (alternatives.length === 0) {
    return JSON.stringify({
      message: `No alternatives found for ${symbol} with prob OTM >= ${minProbOtm}% and credit >= $${credit.toLocaleString()}. Try a lower min_prob_otm or check expirations.`,
      alternatives: [],
    });
  }

  const lines = alternatives.map(
    (a, i) =>
      `${i + 1}. Strike $${a.strike.toFixed(2)} exp ${a.expiration} (DTE ${a.dte}): ` +
      `credit $${a.credit.toLocaleString()}, prob OTM ${a.probOtm}%, bid $${a.bid.toFixed(2)}/ask $${a.ask.toFixed(2)}`
  );
  return JSON.stringify({
    symbol,
    currentStrike: strike,
    currentExpiration: expiration,
    currentCredit: credit,
    minProbOtm,
    alternatives: alternatives.map((a) => ({
      strike: a.strike,
      expiration: a.expiration,
      dte: a.dte,
      credit: a.credit,
      probOtm: a.probOtm,
      bid: a.bid,
      ask: a.ask,
    })),
    summary: lines.join("\n"),
  });
}

export type GrokWithToolsResult = {
  text: string;
  usage?: GrokUsage;
  model?: string;
};

/**
 * Call Grok with tools; handles tool-calling loop for web_search.
 * Pre-injected context (portfolio, news, prices) is passed in userContent.
 */
export async function callGrokWithTools(
  systemPrompt: string,
  userContent: string,
  options?: { tools?: OpenAI.Chat.ChatCompletionTool[] }
): Promise<GrokWithToolsResult> {
  const client = getXaiClient();
  if (!client) {
    return { text: "Grok API is not configured. Add XAI_API_KEY to .env.local." };
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
    const text = completion.choices[0]?.message?.content?.trim() || "No response from Grok.";
    const usage = completion.usage
      ? {
          prompt_tokens: completion.usage.prompt_tokens ?? 0,
          completion_tokens: completion.usage.completion_tokens ?? 0,
          total_tokens: completion.usage.total_tokens ?? 0,
        }
      : undefined;
    return { text, usage, model: completion.model ?? XAI_MODEL };
  }

  const maxToolRounds = 3;
  let round = 0;
  const totalUsage: GrokUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  while (round < maxToolRounds) {
    const completion = await client.chat.completions.create({
      model: XAI_MODEL,
      messages,
      tools,
      tool_choice: "auto",
      max_tokens: 1024,
    });

    if (completion.usage) {
      totalUsage.prompt_tokens += completion.usage.prompt_tokens ?? 0;
      totalUsage.completion_tokens += completion.usage.completion_tokens ?? 0;
      totalUsage.total_tokens += completion.usage.total_tokens ?? 0;
    }

    const choice = completion.choices[0];
    const msg = choice?.message;

    if (!msg) {
      return { text: "No response from Grok.", usage: totalUsage, model: completion.model ?? XAI_MODEL };
    }

    const text = msg.content?.trim();
    const toolCalls = msg.tool_calls;

    if (!toolCalls?.length) {
      return {
        text: text || "No response from Grok.",
        usage: totalUsage,
        model: completion.model ?? XAI_MODEL,
      };
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
      } else if (name === "covered_call_alternatives") {
        resultContent = await executeCoveredCallAlternatives(args as CoveredCallAlternativesArgs);
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

  return {
    text: "Tool loop limit reached. Please try a simpler query.",
    usage: totalUsage,
    model: XAI_MODEL,
  };
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

/** Context for risk analysis (used by riskScanner and chat). */
export type RiskAnalysisContext = {
  profile: string;
  metrics: import("@/types/portfolio").RiskMetrics;
  positions: Array<{ ticker: string; type: string; value: number; weight: number }>;
};

const DEFAULT_RISK_ANALYSIS_PROMPT = `You are a risk management advisor for myInvestments. Given portfolio metrics and positions, assess risk level (low/medium/high) and provide brief, actionable recommendations. Consider VaR, beta, diversification, and options exposure. Tailor advice to the user's risk profile.`;

/**
 * Call Grok for portfolio risk analysis. Returns structured RiskAnalysis.
 */
export async function analyzeRiskWithGrok(
  context: RiskAnalysisContext,
  options?: { systemPromptOverride?: string }
): Promise<import("@/types/portfolio").RiskAnalysis | null> {
  const client = getXaiClient(DECISION_TIMEOUT_MS);
  if (!client) return null;

  const systemPart =
    options?.systemPromptOverride?.trim() || DEFAULT_RISK_ANALYSIS_PROMPT;
  const m = context.metrics;
  const posSummary = context.positions
    .slice(0, 15)
    .map((p) => `${p.ticker} (${p.type}): $${p.value.toLocaleString()} ${(p.weight * 100).toFixed(1)}%`)
    .join("\n");

  const prompt = `${systemPart}

Profile: ${context.profile}
Metrics: Total $${m.totalValue.toLocaleString()}, VaR(95%) $${m.vaR95.toLocaleString()}, Beta ${m.beta}, Sharpe ${m.sharpe}, Diversification ${(m.diversification * 100).toFixed(1)}%, Volatility ${m.volatility}%, Positions ${m.positionCount}

Top positions:
${posSummary || "No positions"}

Output JSON only, no markdown: {"riskLevel":"low"|"medium"|"high","recommendations":["...","..."],"confidence":0.0-1.0,"explanation":"..."}`;

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
      riskLevel?: string;
      recommendations?: string[];
      confidence?: number;
      explanation?: string;
    };

    const level = parsed.riskLevel?.toLowerCase();
    const riskLevel: "low" | "medium" | "high" =
      level === "low" || level === "medium" || level === "high"
        ? level
        : "medium";
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.filter((r): r is string => typeof r === "string")
      : [];
    const confidence =
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5;
    const explanation =
      typeof parsed.explanation === "string" ? parsed.explanation : "";

    return {
      riskLevel,
      recommendations,
      confidence,
      explanation,
    };
  }, "analyzeRiskWithGrok");

  return result;
}
