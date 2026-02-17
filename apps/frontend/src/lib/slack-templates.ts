import type { UnifiedOptionsScannerResult } from "./unified-options-scanner";

export type AlertDeliverySummary = {
  delivered: number;
  failed: number;
  skipped: number;
};

/** Slack Block Kit block types used for unified scanner report. */
export type SlackBlock =
  | { type: "header"; text: { type: "plain_text"; text: string; emoji: true } }
  | { type: "section"; text?: { type: "mrkdwn"; text: string }; fields?: Array<{ type: "mrkdwn"; text: string }> }
  | { type: "divider" }
  | {
      type: "actions";
      elements: Array<{
        type: "button";
        text: { type: "plain_text"; text: string; emoji?: boolean };
        url: string;
        action_id: string;
        style?: "primary" | "danger";
      }>;
    }
  | { type: "context"; elements: Array<{ type: "mrkdwn"; text: string }> };

const SLACK_SECTION_TEXT_MAX = 3000;

/**
 * Format recommendationSummary lines for Slack: section headers as bold, content lines as bullets.
 */
function formatRecommendationsForSlack(summary: string): string {
  const lines = summary.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.endsWith(":")) {
      out.push(`*${trimmed}*`);
    } else {
      out.push(`• ${trimmed}`);
    }
  }
  return out.join("\n");
}

export type UnifiedOptionsScannerReport = {
  bodyText: string;
  /** When present, send as Slack attachment with color "danger" (legacy format only). */
  errorAttachment?: string;
  /** Block Kit blocks for Slack (preferred when supported). */
  slackBlocks?: SlackBlock[];
};

/**
 * Build run notes for job run history (stats + breakdown). Not sent to Slack.
 */
export function formatUnifiedOptionsScannerRunNotes(
  result: UnifiedOptionsScannerResult,
  durationSeconds?: number
): string {
  const durationStr =
    durationSeconds != null ? (durationSeconds < 1 ? "<1" : durationSeconds.toFixed(1)) + "s" : "—";
  const lines = [
    `Total scanned: ${result.totalScanned}`,
    `Stored: ${result.totalStored}`,
    `Alerts created: ${result.totalAlertsCreated}`,
    `Run duration: ${durationStr}`,
    "",
    "Breakdown:",
    `Options: ${result.optionScanner.scanned} scanned, ${result.optionScanner.stored} stored`,
    `Covered Call: ${result.coveredCallScanner.analyzed} analyzed, ${result.coveredCallScanner.stored} stored`,
    `Protective Put: ${result.protectivePutScanner.analyzed} analyzed, ${result.protectivePutScanner.stored} stored`,
    `Straddle/Strangle: ${result.straddleStrangleScanner.analyzed} analyzed, ${result.straddleStrangleScanner.stored} stored`,
  ];
  return lines.join("\n");
}

/**
 * Build Slack Block Kit blocks for Unified Options Scanner (per slack-template rule).
 * Order: header → recommendations → delivery → errors → actions → context.
 * Stats and breakdown are omitted from Slack; use formatUnifiedOptionsScannerRunNotes for job run history.
 */
export function buildUnifiedOptionsScannerBlocks(
  result: UnifiedOptionsScannerResult,
  delivery?: AlertDeliverySummary,
  _durationSeconds?: number,
  appBaseUrl?: string
): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  blocks.push({
    type: "header",
    text: { type: "plain_text", text: "Daily Options Scanner Alert", emoji: true },
  });

  if (result.recommendationSummary?.trim()) {
    const recText = `*🔥 Key Recommendations*\n${formatRecommendationsForSlack(result.recommendationSummary)}`;
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: recText.length > SLACK_SECTION_TEXT_MAX ? recText.slice(0, SLACK_SECTION_TEXT_MAX - 1) + "…" : recText,
      },
    });
  }

  if (result.errors.length > 0) {
    const errorLines = result.errors.map((e) => `• *${e.scanner}:* ${e.message}`).join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🔴 *Scanner errors:*\n${errorLines}`,
      },
    });
  }

  if (appBaseUrl && appBaseUrl.trim()) {
    const dashboardUrl = appBaseUrl.replace(/\/$/, "") + "/automation/scheduler";
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View Dashboard", emoji: true },
          url: dashboardUrl,
          action_id: "unified_scanner_view_dashboard",
        },
      ],
    });
  }

  return blocks;
}

/**
 * Format Unified Options Scanner result for Slack (daily options scanner alert).
 * Returns bodyText (fallback + X/UI), optional errorAttachment (legacy Slack), and slackBlocks (Block Kit).
 * Prefer sending slackBlocks to Slack when supported.
 */
export function formatUnifiedOptionsScannerReport(
  result: UnifiedOptionsScannerResult,
  delivery?: AlertDeliverySummary,
  durationSeconds?: number,
  appBaseUrl?: string
): UnifiedOptionsScannerReport {
  const recSection =
    result.recommendationSummary?.trim() ?
      `\n*🔥 Key Recommendations:*\n${formatRecommendationsForSlack(result.recommendationSummary)}`
    : "";

  const errorLines =
    result.errors.length > 0
      ? result.errors.map((e) => `• *${e.scanner}:* ${e.message}`).join("\n")
      : "";
  const errorsSection = errorLines ? `\n\n🔴 *Scanner errors:*\n${errorLines}` : "";
  const errorAttachment =
    errorLines
      ? `*⚠️ Scanner errors:*\n${errorLines}`
      : undefined;

  const bodyText = `
*🚨 Daily Options Scanner Alert 🚨*

*Unified Options Scanner Complete*
${recSection}${errorsSection}
`.trim();

  const slackBlocks = buildUnifiedOptionsScannerBlocks(result, delivery, durationSeconds, appBaseUrl);

  return { bodyText, errorAttachment, slackBlocks };
}

/** Minimal position summary for Slack (e.g. covered call pairs). */
export type PositionSummaryForSlack = {
  symbol: string;
  strike?: number;
  expiration?: string;
  optionType?: "call" | "put";
  contracts?: number;
  premium?: number;
  accountName?: string;
};

/**
 * Build Block Kit blocks for portfolio positions (e.g. "Show my TSLA covered calls").
 */
export function buildPortfolioPositionsBlocks(
  positions: PositionSummaryForSlack[],
  title: string,
  appBaseUrl?: string
): SlackBlock[] {
  const blocks: SlackBlock[] = [];
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: title, emoji: true },
  });
  if (positions.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "No matching positions." },
    });
  } else {
    const lines = positions.map(
      (p) =>
        `• *${p.symbol}* ${p.strike != null ? `$${p.strike} ` : ""}${p.optionType ?? "call"} ` +
        `${p.expiration ?? ""} ${p.contracts != null ? `× ${p.contracts}` : ""} ${p.premium != null ? `| $${p.premium} prem` : ""}`
    );
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: lines.join("\n") },
    });
  }
  if (appBaseUrl?.trim()) {
    const url = appBaseUrl.replace(/\/$/, "") + "/holdings";
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View Holdings", emoji: true },
          url,
          action_id: "slack_bot_view_holdings",
        },
      ],
    });
  }
  return blocks;
}

/** Build Block Kit blocks for an order preview (NL parse result). */
export function buildOrderPreviewBlocks(
  order: import("@/types/order").ParsedOrder,
  appBaseUrl?: string
): SlackBlock[] {
  const blocks: SlackBlock[] = [];
  const actionLabel =
    order.action === "ROLL"
      ? `Roll ${order.ticker} ${order.strike ?? "?"} ${order.optionType ?? "call"} → ${order.rollToStrike ?? "?"} ${order.rollToExpiration ?? "?"}`
      : `${order.action} ${order.ticker} ${order.strike ?? "?"} ${order.optionType ?? "call"} ${order.expiration ?? ""} × ${order.contracts ?? 1}`;
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: `Order preview: ${actionLabel}`, emoji: true },
  });
  const fields: Array<{ type: "mrkdwn"; text: string }> = [
    { type: "mrkdwn", text: `*Action*\n${order.action}` },
    { type: "mrkdwn", text: `*Symbol*\n${order.ticker}` },
  ];
  if (order.strike != null) fields.push({ type: "mrkdwn", text: `*Strike*\n$${order.strike}` });
  if (order.expiration) fields.push({ type: "mrkdwn", text: `*Expiration*\n${order.expiration}` });
  if (order.contracts != null) fields.push({ type: "mrkdwn", text: `*Contracts*\n${order.contracts}` });
  if (order.reason) fields.push({ type: "mrkdwn", text: `*Reason*\n${order.reason}` });
  blocks.push({ type: "section", fields });
  if (appBaseUrl?.trim()) {
    const builderUrl = appBaseUrl.replace(/\/$/, "") + "/xstrategybuilder?symbol=" + encodeURIComponent(order.ticker);
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open in Builder", emoji: true },
          url: builderUrl,
          action_id: "slack_bot_open_builder",
        },
      ],
    });
  }
  return blocks;
}
