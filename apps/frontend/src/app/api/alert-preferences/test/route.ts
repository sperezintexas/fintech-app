import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import type { AlertDeliveryChannel } from "@/types/portfolio";
import { postToXTweet, truncateForX } from "@/lib/x";

export const dynamic = "force-dynamic";

type TestChannel = Extract<AlertDeliveryChannel, "slack" | "twitter" | "push">;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      accountId?: string;
      channel?: TestChannel;
      message?: string;
    };

    const accountId = body.accountId?.trim();
    const channel = body.channel;
    const message = (body.message?.trim() || "Hello world from myInvestments").slice(
      0,
      2000
    );

    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }
    if (!channel) {
      return NextResponse.json({ error: "channel is required" }, { status: 400 });
    }

    const db = await getDb();
    const prefs = await db.collection("alertPreferences").findOne({ accountId });

    const entry = (prefs?.channels || []).find(
      (c: { channel: AlertDeliveryChannel; target: string }) => c.channel === channel
    );

    if (channel === "slack") {
      const webhook = entry?.target?.trim();
      if (!webhook) {
        return NextResponse.json(
          { error: "Slack webhook not configured" },
          { status: 400 }
        );
      }

      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return NextResponse.json(
          { error: `Slack webhook failed (${res.status})`, details: text.slice(0, 500) },
          { status: 502 }
        );
      }

      return NextResponse.json({ success: true, message: "Sent test message to Slack" });
    }

    if (channel === "twitter") {
      const handle = entry?.target?.trim();
      if (!handle) {
        return NextResponse.json(
          { error: "X target not configured" },
          { status: 400 }
        );
      }

      const stamped = `${message}\n\n(test • ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })})`;
      const tweet = await postToXTweet(stamped);
      return NextResponse.json({
        success: true,
        message: `Posted to X as ${handle}: ${truncateForX(tweet.text)}`,
        tweetId: tweet.id,
      });
    }

    if (channel === "push") {
      // Push preview is client-side (Notification API / Service Worker).
      return NextResponse.json({
        success: true,
        message: "Use the in-browser Preview button to validate push.",
      });
    }

    return NextResponse.json(
      { error: `Unsupported channel: ${String(channel)}` },
      { status: 400 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const details = error instanceof Error ? error.stack : undefined;
    console.error("Failed to test alert delivery channel:", error);
    return NextResponse.json(
      { error: "Failed to test alert delivery channel", details: msg, ...(process.env.NODE_ENV === "development" && { stack: details }) },
      { status: 500 }
    );
  }
}
