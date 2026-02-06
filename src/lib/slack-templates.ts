import type { UnifiedOptionsScannerResult } from "./unified-options-scanner";

export type AlertDeliverySummary = {
  delivered: number;
  failed: number;
  skipped: number;
};

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
  /** When present, send as Slack attachment with color "danger" (red bar) for error visibility. */
  errorAttachment?: string;
};

/**
 * Format Unified Options Scanner result for Slack (daily options scanner alert).
 * Returns bodyText and optional errorAttachment (for Slack red attachment when errors exist).
 */
export function formatUnifiedOptionsScannerReport(
  result: UnifiedOptionsScannerResult,
  delivery?: AlertDeliverySummary,
  durationSeconds?: number
): UnifiedOptionsScannerReport {
  const recSection =
    result.recommendationSummary?.trim() ?
      `\n*Key Recommendations:*\n${formatRecommendationsForSlack(result.recommendationSummary)}`
    : "";

  const durationSection =
    durationSeconds != null ?
      `\n⏱ *Run duration:* ${durationSeconds < 1 ? "<1" : durationSeconds.toFixed(1)}s`
    : "";

  const errorLines =
    result.errors.length > 0
      ? result.errors.map((e) => `• *${e.scanner}:* ${e.message}`).join("\n")
      : "";
  const errorsSection = errorLines ? `\n\n*⚠️ Scanner errors:*\n${errorLines}` : "";
  const errorAttachment =
    errorLines
      ? `*⚠️ Scanner errors:*\n${errorLines}`
      : undefined;

  const deliverySection = delivery
    ? `\n\n*Alerts Delivery:*\n📤 Sent: ${delivery.delivered} | ❌ Failed: ${delivery.failed} | ⏩ Skipped: ${delivery.skipped}`
    : "";

  const bodyText = `
*🚨 Daily Options Scanner Alert 🚨*

*Unified Options Scanner Complete*
✅ Total scanned: ${result.totalScanned}
💾 Stored: ${result.totalStored}
🔔 Alerts created: ${result.totalAlertsCreated}
${durationSection}

*Breakdown by Strategy:*
- *Options:* ${result.optionScanner.scanned} scanned, ${result.optionScanner.stored} stored
- *Covered Call:* ${result.coveredCallScanner.analyzed} analyzed, ${result.coveredCallScanner.stored} stored
- *Protective Put:* ${result.protectivePutScanner.analyzed} analyzed, ${result.protectivePutScanner.stored} stored
- *Straddle/Strangle:* ${result.straddleStrangleScanner.analyzed} analyzed, ${result.straddleStrangleScanner.stored} stored
${recSection}${errorsSection}${deliverySection}

_Review full details in the app dashboard. Stay profitable! 📈_
`.trim();

  return { bodyText, errorAttachment };
}
