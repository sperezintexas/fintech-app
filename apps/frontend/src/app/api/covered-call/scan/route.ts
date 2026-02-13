import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { analyzeCoveredCallForOption, storeCoveredCallRecommendations } from "@/lib/covered-call-analyzer";
import { postToXThread } from "@/lib/x";
import type { AlertDeliveryChannel } from "@/types/portfolio";

export const dynamic = "force-dynamic";

const DEFAULT_DELIVERY_CHANNELS: AlertDeliveryChannel[] = ["slack", "twitter"];

/**
 * POST /api/covered-call/scan
 * Run Covered Call Scanner for a single option (e.g. from xStrategyBuilder Review Order).
 * Uses unifiedOptionsScanner defaults (config.coveredCall, delivery channels).
 * Posts results to Slack/X.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      symbol?: string;
      strike?: number;
      expiration?: string;
      entryPremium?: number;
      quantity?: number;
      stockPurchasePrice?: number;
      accountId?: string | null;
    };

    const symbol = body.symbol?.trim().toUpperCase();
    const strike = typeof body.strike === "number" ? body.strike : undefined;
    const expiration = body.expiration?.trim();
    const entryPremium = typeof body.entryPremium === "number" ? body.entryPremium : undefined;
    const quantity = typeof body.quantity === "number" ? body.quantity : 1;
    const stockPurchasePrice =
      typeof body.stockPurchasePrice === "number" ? body.stockPurchasePrice : undefined;
    const accountId = body.accountId === undefined || body.accountId === "" ? undefined : String(body.accountId);

    if (!symbol || strike == null || !expiration) {
      return NextResponse.json(
        { error: "Missing required fields: symbol, strike, expiration" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const reportTypeDoc = await db.collection("reportTypes").findOne({ id: "unifiedOptionsScanner" });
    const unifiedConfig = (reportTypeDoc as { defaultConfig?: { coveredCall?: Record<string, unknown> } } | null)?.defaultConfig;
    const defaultChannels = (reportTypeDoc as { defaultDeliveryChannels?: AlertDeliveryChannel[] } | null)
      ?.defaultDeliveryChannels;
    const defaultConfig = unifiedConfig?.coveredCall;

    const channels =
      defaultChannels?.length && defaultChannels.every((c) => DEFAULT_DELIVERY_CHANNELS.includes(c))
        ? defaultChannels
        : (["slack"] as AlertDeliveryChannel[]);

    const recommendations = await analyzeCoveredCallForOption(
      {
        symbol,
        strike,
        expiration,
        entryPremium,
        quantity,
        stockPurchasePrice,
        accountId,
      },
      defaultConfig
    );

    const { stored, alertsCreated } = await storeCoveredCallRecommendations(recommendations, {
      createAlerts: true,
    });

    const recLines =
      recommendations.length > 0
        ? recommendations.map((r) => `• ${r.symbol} (${r.source}): ${r.recommendation} — ${r.reason}`)
        : ["• No actionable recommendation for this option."];

    const title = "Covered Call Scanner";
    const bodyText = [
      `Covered Call Scanner (single option)`,
      `• Analyzed: ${recommendations.length}`,
      `• Stored: ${stored}`,
      `• Alerts created: ${alertsCreated}`,
      "",
      ...recLines,
    ].join("\n");

    const deliveredChannels: string[] = [];
    const failedChannels: { channel: string; error: string }[] = [];

    let prefs = await db.collection("alertPreferences").findOne({ accountId: accountId ?? null });
    if (!prefs) {
      const firstAcc = await db.collection("accounts").findOne({});
      if (firstAcc) {
        prefs = await db.collection("alertPreferences").findOne({
          accountId: (firstAcc as { _id: ObjectId })._id.toString(),
        });
      }
    }

    const slackConfig = (prefs?.channels || []).find(
      (c: { channel: AlertDeliveryChannel; target: string }) => c.channel === "slack"
    );
    const twitterConfig = (prefs?.channels || []).find(
      (c: { channel: AlertDeliveryChannel; target: string }) => c.channel === "twitter"
    );

    if (channels.includes("slack")) {
      if (!slackConfig?.target) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Slack not configured. Go to Automation → Settings → Alert Settings and add a Slack webhook URL.",
          },
          { status: 400 }
        );
      }
      try {
        const slackText = `*${title}*\n${bodyText}`;
        const slackRes = await fetch(slackConfig.target, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: slackText }),
        });
        if (!slackRes.ok) {
          const errBody = await slackRes.text();
          return NextResponse.json(
            { success: false, error: `Slack webhook failed (${slackRes.status}): ${errBody.slice(0, 200)}` },
            { status: 400 }
          );
        }
        deliveredChannels.push("Slack");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
          { success: false, error: `Slack delivery failed: ${msg}` },
          { status: 500 }
        );
      }
    }

    if (channels.includes("twitter") && twitterConfig?.target) {
      try {
        const fullText = `${title}\n\n${bodyText}`;
        await postToXThread(fullText);
        deliveredChannels.push("X");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failedChannels.push({ channel: "X", error: msg });
      }
    }

    const channelsStr = deliveredChannels.length
      ? deliveredChannels.join(", ")
      : failedChannels.length
        ? "delivery failed"
        : "no channels configured";

    return NextResponse.json({
      success: true,
      message: `Covered Call Scanner complete. Results sent to ${channelsStr}.`,
      deliveredChannels,
      failedChannels: failedChannels.length ? failedChannels : undefined,
      recommendations: recommendations.map((r) => ({
        symbol: r.symbol,
        recommendation: r.recommendation,
        reason: r.reason,
      })),
    });
  } catch (error) {
    console.error("Covered Call scan failed:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
