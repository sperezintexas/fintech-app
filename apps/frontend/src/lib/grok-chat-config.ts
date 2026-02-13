/**
 * Grok Chat config: tools and context configurable from the chat page.
 * Stored in appUtil collection.
 */

import { getDb } from "./mongodb";

const COLLECTION = "appUtil";
const KEY = "grokChatConfig";

export type GrokChatToolsConfig = {
  webSearch: boolean;
  marketData: boolean;
  portfolio: boolean;
  /** When true, pre-fetch recent covered call recommendations when user asks about recommendations/BTC/roll. */
  coveredCallRecs: boolean;
  jobs: boolean;
};

export type GrokChatContextConfig = {
  riskProfile?: "low" | "medium" | "high" | "aggressive";
  strategyGoals?: string;
  systemPromptOverride?: string;
  persona?: string;
};

export type GrokChatConfig = {
  tools: GrokChatToolsConfig;
  context: GrokChatContextConfig;
  updatedAt?: string;
};

/** Partial config for updates (nested objects can be partial). */
export type GrokChatConfigUpdate = {
  tools?: Partial<GrokChatToolsConfig>;
  context?: Partial<GrokChatContextConfig>;
};

const DEFAULT_TOOLS: GrokChatToolsConfig = {
  webSearch: true,
  marketData: true,
  portfolio: true,
  coveredCallRecs: true,
  jobs: true,
};

const DEFAULT_CONTEXT: GrokChatContextConfig = {
  riskProfile: "medium",
  strategyGoals: "",
  systemPromptOverride: "",
  persona: "finance-expert",
};

export async function getGrokChatConfig(): Promise<GrokChatConfig> {
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne({ key: KEY });
  if (doc?.value && typeof doc.value === "object") {
    const v = doc.value as Record<string, unknown>;
    const tools = v.tools as Partial<GrokChatToolsConfig> | undefined;
    const context = v.context as Partial<GrokChatContextConfig> | undefined;
    return {
      tools: {
        webSearch: tools?.webSearch ?? DEFAULT_TOOLS.webSearch,
        marketData: tools?.marketData ?? DEFAULT_TOOLS.marketData,
        portfolio: tools?.portfolio ?? DEFAULT_TOOLS.portfolio,
        coveredCallRecs: tools?.coveredCallRecs ?? DEFAULT_TOOLS.coveredCallRecs,
  jobs: tools?.jobs ?? DEFAULT_TOOLS.jobs,
      },
      context: {
        riskProfile: context?.riskProfile ?? DEFAULT_CONTEXT.riskProfile,
        strategyGoals: context?.strategyGoals ?? DEFAULT_CONTEXT.strategyGoals,
        systemPromptOverride: context?.systemPromptOverride ?? DEFAULT_CONTEXT.systemPromptOverride,
        persona: context?.persona ?? DEFAULT_CONTEXT.persona,
      },
      updatedAt: doc.updatedAt as string | undefined,
    };
  }
  return {
    tools: DEFAULT_TOOLS,
    context: DEFAULT_CONTEXT,
  };
}

export async function setGrokChatConfig(config: GrokChatConfigUpdate): Promise<GrokChatConfig> {
  const existing = await getGrokChatConfig();
  const merged: GrokChatConfig = {
    tools: {
      ...existing.tools,
      ...(config.tools ?? {}),
    },
    context: {
      ...existing.context,
      ...(config.context ?? {}),
    },
    updatedAt: new Date().toISOString(),
  };

  const db = await getDb();
  await db.collection(COLLECTION).updateOne(
    { key: KEY },
    {
      $set: {
        key: KEY,
        value: {
          tools: merged.tools,
          context: merged.context,
        },
        updatedAt: merged.updatedAt,
      },
    },
    { upsert: true }
  );
  return merged;
}
