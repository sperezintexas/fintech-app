import { NextRequest, NextResponse } from "next/server";
import {
  getGrokChatConfig,
  setGrokChatConfig,
  getEffectivePersonaPrompts,
  type GrokChatConfigUpdate,
  type GrokChatToolsConfig,
  type GrokChatContextConfig,
  type PersonaPromptsUpdate,
} from "@/lib/grok-chat-config";
import { PERSONAS } from "@/lib/chat-personas";
import { XAI_MODEL } from "@/lib/xai-grok";

const PERSONA_KEY_REGEX = /^[a-zA-Z0-9_-]+$/;
const PERSONA_KEY_MAX = 50;
const PERSONA_PROMPT_MAX = 8000;

export const dynamic = "force-dynamic";

/** GET - Return Grok chat config (tools, context, model, effective persona prompts for UI) */
export async function GET() {
  try {
    const config = await getGrokChatConfig();
    const personaPromptTexts = getEffectivePersonaPrompts(config.personaPrompts);
    return NextResponse.json({
      ...config,
      model: XAI_MODEL,
      personaPromptTexts,
    });
  } catch (error) {
    console.error("Failed to fetch Grok chat config:", error);
    return NextResponse.json(
      { error: "Failed to fetch Grok chat config" },
      { status: 500 }
    );
  }
}

const VALID_RISK_PROFILES = ["low", "medium", "high", "aggressive"] as const;

/** PUT - Update Grok chat config */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const tools = body?.tools as Partial<GrokChatToolsConfig> | undefined;
    const context = body?.context as Partial<GrokChatContextConfig> | undefined;
    const personaPrompts = body?.personaPrompts as PersonaPromptsUpdate | undefined;

    const config: GrokChatConfigUpdate = {};
    if (personaPrompts && typeof personaPrompts === "object") {
      const sanitized: PersonaPromptsUpdate = {};
      for (const key of Object.keys(personaPrompts)) {
        if (key.length > PERSONA_KEY_MAX || !PERSONA_KEY_REGEX.test(key)) continue;
        const v = personaPrompts[key];
        if (v === null) {
          sanitized[key] = null;
        } else if (typeof v === "string") {
          sanitized[key] = v.slice(0, PERSONA_PROMPT_MAX);
        }
      }
      if (Object.keys(sanitized).length > 0) config.personaPrompts = sanitized;
    }
    if (tools && typeof tools === "object") {
      const t: Partial<GrokChatToolsConfig> = {};
      if (typeof tools.webSearch === "boolean") t.webSearch = tools.webSearch;
      if (typeof tools.marketData === "boolean") t.marketData = tools.marketData;
      if (typeof tools.portfolio === "boolean") t.portfolio = tools.portfolio;
      if (typeof tools.coveredCallRecs === "boolean") t.coveredCallRecs = tools.coveredCallRecs;
      if (Object.keys(t).length > 0) config.tools = t;
    }
    if (context && typeof context === "object") {
      const ctx: Partial<GrokChatContextConfig> = {};
      if (
        typeof context.riskProfile === "string" &&
        VALID_RISK_PROFILES.includes(context.riskProfile as (typeof VALID_RISK_PROFILES)[number])
      ) {
        ctx.riskProfile = context.riskProfile as (typeof VALID_RISK_PROFILES)[number];
      }
      if (typeof context.strategyGoals === "string") {
        ctx.strategyGoals = context.strategyGoals.slice(0, 2000);
      }
      if (typeof context.systemPromptOverride === "string") {
        ctx.systemPromptOverride = context.systemPromptOverride.slice(0, 4000);
      }
      if (typeof context.persona === "string") {
        const p = context.persona.slice(0, PERSONA_KEY_MAX).trim();
        if (p && (PERSONAS[p as keyof typeof PERSONAS] !== undefined || PERSONA_KEY_REGEX.test(p))) {
          ctx.persona = p;
        }
      }
      if (Object.keys(ctx).length > 0) config.context = ctx;
    }

    const updated = await setGrokChatConfig(config);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to save Grok chat config:", error);
    return NextResponse.json(
      { error: "Failed to save Grok chat config" },
      { status: 500 }
    );
  }
}
