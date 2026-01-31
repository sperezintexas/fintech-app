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

export function getXaiClient(): OpenAI | null {
  const key = process.env.XAI_API_KEY;
  if (!key?.trim()) return null;
  return new OpenAI({
    apiKey: key,
    baseURL: "https://api.x.ai/v1",
    timeout: 60_000,
  });
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
  const messages: GrokMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

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
