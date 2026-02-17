import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import type { ParsedOrder } from "@/types/order";
import { z } from "zod";

export const dynamic = "force-dynamic";

const confirmBodySchema = z.object({
  order: z.object({
    action: z.string(),
    ticker: z.string(),
    optionType: z.enum(["call", "put"]).optional(),
    strike: z.number().optional(),
    expiration: z.string().optional(),
    contracts: z.number().optional(),
    rollToStrike: z.number().optional(),
    rollToExpiration: z.string().optional(),
    reason: z.string().optional(),
  }),
  source: z.enum(["ui", "slack"]).optional(),
});

/** POST: Store confirmed NL order and optionally notify Slack. */
export async function POST(request: NextRequest): Promise<NextResponse<unknown>> {
  try {
    const raw = await request.json();
    const parsed = confirmBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }
    const { order, source = "ui" } = parsed.data;

    const db = await getDb();
    const doc = {
      order: order as ParsedOrder,
      source,
      createdAt: new Date().toISOString(),
    };
    const result = await db.collection("nlOrderConfirmations").insertOne(doc);

    const webhookUrl = process.env.SLACK_WEBHOOK_URL?.trim();
    if (webhookUrl) {
      const label =
        order.action === "ROLL"
          ? `Roll ${order.ticker} ${order.strike ?? "?"} → ${order.rollToStrike ?? "?"} ${order.rollToExpiration ?? ""}`
          : `${order.action} ${order.ticker} ${order.strike ?? "?"} ${order.optionType ?? "call"} ${order.expiration ?? ""} × ${order.contracts ?? 1}`;
      const text = `Order confirmed (${source}): ${label}`;
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).catch((e) => console.error("Slack webhook post failed:", e));
    }

    return NextResponse.json({ ok: true, id: result.insertedId?.toString() });
  } catch (e) {
    console.error("nl-order-confirm error:", e);
    return NextResponse.json({ error: "Confirm failed" }, { status: 500 });
  }
}
