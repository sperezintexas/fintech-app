import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { handleSlashCommand } from "@/lib/slack-bot";

export const dynamic = "force-dynamic";

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET?.trim();

function verifySlackSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null
): boolean {
  if (!SLACK_SIGNING_SECRET || !signature || !timestamp) return false;
  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto
    .createHmac("sha256", SLACK_SIGNING_SECRET)
    .update(sigBasestring)
    .digest("hex");
  return `v0=${hmac}` === signature;
}

/** POST: Slack Events API (url_verification, event_callback) or slash command (form body). */
export async function POST(request: NextRequest): Promise<NextResponse<unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  const rawBody = await request.text();
  const signature = request.headers.get("x-slack-signature");
  const timestamp = request.headers.get("x-slack-request-timestamp");

  if (!verifySlackSignature(rawBody, signature, timestamp)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);
    const command = params.get("command");
    const text = params.get("text")?.trim() ?? "";
    const responseUrl = params.get("response_url");
    if (command === "/invest" || command === "invest") {
      const { blocks, text: fallbackText } = await handleSlashCommand(text);
      if (responseUrl && blocks.length > 0) {
        try {
          await fetch(responseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              response_type: "ephemeral",
              text: fallbackText,
              blocks,
            }),
          });
        } catch (e) {
          console.error("Slack response_url post failed:", e);
        }
      }
      return NextResponse.json({
        response_type: "ephemeral",
        text: fallbackText,
        ...(blocks.length > 0 ? { blocks } : {}),
      });
    }
    return NextResponse.json({ text: "Unknown command" });
  }

  let body: { type?: string; challenge?: string };
  try {
    body = JSON.parse(rawBody) as { type?: string; challenge?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.type === "url_verification" && typeof body.challenge === "string") {
    return NextResponse.json({ challenge: body.challenge });
  }

  if (body.type === "event_callback") {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
