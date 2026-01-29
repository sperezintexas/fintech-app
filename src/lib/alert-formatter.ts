import type {
  WatchlistAlert,
  WatchlistItem,
  AlertTemplate,
  AlertTemplateId,
  AlertDeliveryChannel,
  RiskLevel,
} from "@/types/portfolio";
import { ALERT_TEMPLATES, ALERT_CHANNEL_COSTS } from "@/types/portfolio";

// Re-export templates for convenience
export { ALERT_TEMPLATES, ALERT_CHANNEL_COSTS };

export type AlertContext = {
  alert: WatchlistAlert;
  item: WatchlistItem;
  riskLevel: RiskLevel;
  template: AlertTemplate;
  /** Account name for template placeholder {account} */
  accountName?: string;
};

export type FormattedAlert = {
  subject: string;
  body: string;
  sms: string;
  slack: string;
  /** X/Twitter format (no account) */
  x: string;
};

// Variable replacements for templates
type TemplateVariables = {
  account: string;
  symbol: string;
  action: string;
  reason: string;
  severity: string;
  strategy: string;
  currentPrice: string;
  entryPrice: string;
  profitPercent: string;
  profitDollars: string;
  dte: string;
  riskLevel: string;
  riskWarning: string;
  actions: string;
  disclosure: string;
};

function getTemplateVariables(context: AlertContext): TemplateVariables {
  const { alert, item, riskLevel, accountName } = context;

  // Calculate profit/loss
  const profitDollars = alert.details.priceChange * (item.quantity * 100);
  const profitPercent = alert.details.priceChangePercent;

  // Calculate DTE
  let dte = "N/A";
  if (item.expirationDate) {
    const expDate = new Date(item.expirationDate);
    const today = new Date();
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    dte = diffDays.toString();
  }

  // Format actions as list
  const actionsFormatted = alert.suggestedActions.join("\n• ");

  // Strategy display name
  const strategyNames: Record<string, string> = {
    "covered-call": "Covered Call",
    "cash-secured-put": "Cash-Secured Put",
    "wheel": "Wheel Strategy",
    "long-stock": "Long Stock",
    "leap-call": "LEAP Call",
    "collar": "Collar",
  };

  return {
    account: accountName ?? "Account",
    symbol: alert.symbol,
    action: alert.recommendation,
    reason: alert.reason,
    severity: alert.severity.toUpperCase(),
    strategy: strategyNames[item.strategy] || item.strategy,
    currentPrice: `$${alert.details.currentPrice.toFixed(2)}`,
    entryPrice: `$${alert.details.entryPrice.toFixed(2)}`,
    profitPercent: `${profitPercent >= 0 ? "+" : ""}${profitPercent.toFixed(1)}`,
    profitDollars: `${profitDollars >= 0 ? "+" : ""}$${profitDollars.toFixed(2)}`,
    dte,
    riskLevel: riskLevel.toUpperCase(),
    riskWarning: alert.riskWarning || "",
    actions: actionsFormatted ? `• ${actionsFormatted}` : "No specific actions",
    disclosure: item.riskDisclosure || "Options involve risk. Not suitable for all investors.",
  };
}

function replaceVariables(template: string, variables: TemplateVariables): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}

export function formatAlert(context: AlertContext): FormattedAlert {
  const variables = getTemplateVariables(context);
  const { template } = context;
  const xTemplate = "xTemplate" in template && typeof template.xTemplate === "string" ? template.xTemplate : template.slackTemplate.replace(/\*?\[?\{account\}\]?\*?\s*/g, "");

  return {
    subject: replaceVariables(template.subjectTemplate, variables),
    body: replaceVariables(template.bodyTemplate, variables),
    sms: truncateSms(replaceVariables(template.smsTemplate, variables)),
    slack: replaceVariables(template.slackTemplate, variables),
    x: replaceVariables(xTemplate, variables),
  };
}

// Truncate SMS to 160 characters
function truncateSms(message: string): string {
  if (message.length <= 160) return message;
  return message.substring(0, 157) + "...";
}

// Get template by ID
export function getTemplate(templateId: AlertTemplateId): AlertTemplate {
  return ALERT_TEMPLATES.find((t) => t.id === templateId) || ALERT_TEMPLATES[0];
}

// Preview how an alert would look with a given template
export function previewAlertFormat(
  templateId: AlertTemplateId,
  channel: AlertDeliveryChannel
): string {
  const template = getTemplate(templateId);

  // Sample data for preview
  const sampleVariables: TemplateVariables = {
    account: "Merrill",
    symbol: "TSLA260227P00380000",
    action: "BTC",
    reason: "85% profit captured, consider closing",
    severity: "WARNING",
    strategy: "Cash-Secured Put",
    currentPrice: "$2.50",
    entryPrice: "$8.50",
    profitPercent: "+70.6",
    profitDollars: "+$600.00",
    dte: "14",
    riskLevel: "MEDIUM",
    riskWarning: "Assignment risk increases as expiration approaches",
    actions: "• Buy to close for $250\n• Roll to next month for credit",
    disclosure: "Options involve risk and are not suitable for all investors.",
  };

  const xTemplate = "xTemplate" in template && typeof template.xTemplate === "string" ? template.xTemplate : template.slackTemplate.replace(/\*?\[?\{account\}\]?\*?\s*/g, "");

  switch (channel) {
    case "email":
      return `Subject: ${replaceVariables(template.subjectTemplate, sampleVariables)}\n\n${replaceVariables(template.bodyTemplate, sampleVariables)}`;
    case "sms":
      return truncateSms(replaceVariables(template.smsTemplate, sampleVariables));
    case "slack":
      return replaceVariables(template.slackTemplate, sampleVariables);
    case "twitter":
      return replaceVariables(xTemplate, sampleVariables);
    case "push":
      return replaceVariables(template.subjectTemplate, sampleVariables);
    default:
      return replaceVariables(template.bodyTemplate, sampleVariables);
  }
}

// Estimate monthly cost based on preferences and expected alerts
export function estimateMonthlyCost(
  channels: { channel: AlertDeliveryChannel; enabled: boolean }[],
  expectedAlertsPerMonth: number = 30
): { total: number; breakdown: { channel: AlertDeliveryChannel; cost: number }[] } {
  const breakdown = channels
    .filter((c) => c.enabled)
    .map((c) => ({
      channel: c.channel,
      cost: (ALERT_CHANNEL_COSTS[c.channel]?.perMessage || 0) * expectedAlertsPerMonth,
    }));

  const total = breakdown.reduce((sum, item) => sum + item.cost, 0);

  return { total, breakdown };
}
