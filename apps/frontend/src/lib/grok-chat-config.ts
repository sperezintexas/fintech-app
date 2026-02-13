/**
 * Grok Chat config: tools, context, and per-persona prompt text.
 * Stored in appUtil collection. Persona prompts in DB override code defaults (chat-personas.ts).
 */

import { getDb } from "./mongodb";
import { PERSONAS, type PersonaKey } from "./chat-personas";

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

/** Per-persona prompt text stored in collection. Keys can be built-in (PersonaKey) or custom (e.g. "growth-investor"). */
export type PersonaPrompts = Record<string, string>;

/** Update: use null as value to remove a persona key. */
export type PersonaPromptsUpdate = Record<string, string | null>;

export type GrokChatConfig = {
  tools: GrokChatToolsConfig;
  context: GrokChatContextConfig;
  /** Stored prompts per persona; merged with code defaults for effective text. */
  personaPrompts?: PersonaPrompts;
  updatedAt?: string;
};

/** Partial config for updates (nested objects can be partial). */
export type GrokChatConfigUpdate = {
  tools?: Partial<GrokChatToolsConfig>;
  context?: Partial<GrokChatContextConfig>;
  personaPrompts?: PersonaPromptsUpdate;
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
    const personaPrompts = v.personaPrompts as PersonaPrompts | undefined;
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
      personaPrompts:
      personaPrompts && typeof personaPrompts === "object"
        ? (personaPrompts as PersonaPrompts)
        : undefined,
      updatedAt: doc.updatedAt as string | undefined,
    };
  }
  return {
    tools: DEFAULT_TOOLS,
    context: DEFAULT_CONTEXT,
  };
}

/** Effective prompt for a persona: stored in collection overrides code default. Custom keys use stored only. */
export function getEffectivePersonaPrompt(personaKey: string, storedPrompts?: PersonaPrompts): string | undefined {
  const fromStored = storedPrompts?.[personaKey];
  if (fromStored != null && fromStored.trim() !== "") return fromStored;
  return PERSONAS[personaKey as PersonaKey];
}

/** All effective prompts (for UI): built-in + custom personas. Stored overrides code for built-in keys. */
export function getEffectivePersonaPrompts(storedPrompts?: PersonaPrompts): Record<string, string> {
  const out: Record<string, string> = {};
  const builtInKeys = Object.keys(PERSONAS) as PersonaKey[];
  for (const k of builtInKeys) {
    out[k] = getEffectivePersonaPrompt(k, storedPrompts) ?? "";
  }
  if (storedPrompts && typeof storedPrompts === "object") {
    for (const k of Object.keys(storedPrompts)) {
      if (!(k in PERSONAS) && storedPrompts[k]?.trim() !== "") out[k] = storedPrompts[k];
    }
  }
  return out;
}

export async function setGrokChatConfig(config: GrokChatConfigUpdate): Promise<GrokChatConfig> {
  const existing = await getGrokChatConfig();
  const mergedPersonaPrompts: PersonaPrompts = { ...(existing.personaPrompts ?? {}) };
  const updates = config.personaPrompts ?? {};
  for (const [k, v] of Object.entries(updates)) {
    if (v == null) delete mergedPersonaPrompts[k];
    else mergedPersonaPrompts[k] = v;
  }
  const merged: GrokChatConfig = {
    tools: {
      ...existing.tools,
      ...(config.tools ?? {}),
    },
    context: {
      ...existing.context,
      ...(config.context ?? {}),
    },
    personaPrompts: Object.keys(mergedPersonaPrompts).length > 0 ? mergedPersonaPrompts : undefined,
    updatedAt: new Date().toISOString(),
  };

  const db = await getDb();
  const value: Record<string, unknown> = {
    tools: merged.tools,
    context: merged.context,
  };
  if (merged.personaPrompts) value.personaPrompts = merged.personaPrompts;

  await db.collection(COLLECTION).updateOne(
    { key: KEY },
    {
      $set: {
        key: KEY,
        value,
        updatedAt: merged.updatedAt,
      },
    },
    { upsert: true }
  );
  return merged;
}
