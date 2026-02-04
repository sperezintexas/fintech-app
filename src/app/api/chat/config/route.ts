import { NextRequest, NextResponse } from "next/server";
import {
  getGrokChatConfig,
  setGrokChatConfig,
  type GrokChatConfigUpdate,
  type GrokChatToolsConfig,
  type GrokChatContextConfig,
} from "@/lib/grok-chat-config";

export const dynamic = "force-dynamic";

/** GET - Return Grok chat config (tools, context) */
export async function GET() {
  try {
    const config = await getGrokChatConfig();
    return NextResponse.json(config);
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

    const config: GrokChatConfigUpdate = {};
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
