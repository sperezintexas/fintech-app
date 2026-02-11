/**
 * Alert Delivery Service
 * Delivers scanner-generated alerts to Slack and X per AlertConfig.
 */

import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { postToXTweet, truncateForX } from "@/lib/x";
import { getTemplate } from "@/lib/alert-formatter";
import { getAlertTemplates } from "@/lib/templates-store";
import type {
  AlertConfig,
  AlertConfigJobType,
  AlertDeliveryRecord,
  AlertDeliveryStatus,
  AlertTemplate,
  AlertTemplateId,
} from "@/types/portfolio";

export type StoredAlert = {
  _id: ObjectId;
  accountId?: string;
  /** Display name for the account (set when alert is created by scanners). */
  accountName?: string;
  symbol: string;
  type?: string;
  recommendation: string;
  reason: string;
  severity?: string;
  metrics?: {
    stockPrice?: number;
    callBid?: number;
    callAsk?: number;
    putBid?: number;
    putAsk?: number;
    dte?: number;
    daysToExpiration?: number;
    pl?: number;
    plPercent?: number;
    netPremium?: number;
    netProtectionCost?: number;
    effectiveFloor?: number;
    /** Unit/cost per share at purchase (option premium or entry); shown in alerts. */
    unitCost?: number;
    /** Probability of assignment (0–100) for short calls; shown in alerts. */
    assignmentProbability?: number;
  };
  details?: {
    currentPrice?: number;
    entryPrice?: number;
    priceChangePercent?: number;
    daysToExpiration?: number;
  };
  deliveryStatus?: Record<string, AlertDeliveryRecord>;
  createdAt: string;
};

function formatCurrency(v: number | undefined): string {
  if (v === undefined) return "—";
  return `$${v.toFixed(2)}`;
}

function formatPercent(v: number | undefined): string {
  if (v === undefined) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

type MetricsLike = {
  stockPrice?: number;
  currentPrice?: number;
  plPercent?: number;
  priceChangePercent?: number;
  dte?: number;
  daysToExpiration?: number;
  entryPrice?: number;
  unitCost?: number;
  pl?: number;
  netPremium?: number;
  netProtectionCost?: number;
  assignmentProbability?: number;
};

/** Build Slack/X message from scanner alert using template. */
export function formatScannerAlert(
  alert: StoredAlert,
  templateId: AlertTemplateId,
  accountName?: string,
  templates?: AlertTemplate[]
): { slack: string; x: string } {
  const template = templates ? getTemplate(templateId, templates) : getTemplate(templateId);
  const metrics = (alert.metrics ?? alert.details ?? {}) as MetricsLike;
  const stockPrice = metrics.stockPrice ?? metrics.currentPrice;
  const plPercent = metrics.plPercent ?? metrics.priceChangePercent;
  const dte = metrics.dte ?? metrics.daysToExpiration;
  const entryOrUnitCost = metrics.unitCost ?? metrics.entryPrice;

  const assignmentProb =
    metrics.assignmentProbability != null ? `${metrics.assignmentProbability}%` : "N/A";

  const displayAccount = alert.accountName ?? accountName ?? "Account";

  const variables: Record<string, string> = {
    account: displayAccount,
    symbol: alert.symbol,
    action: alert.recommendation,
    reason: alert.reason,
    severity: (alert.severity ?? "warning").toUpperCase(),
    strategy: mapTypeToStrategy(alert.type),
    currentPrice: formatCurrency(stockPrice),
    entryPrice: formatCurrency(entryOrUnitCost ?? metrics.entryPrice),
    profitPercent: formatPercent(plPercent),
    profitDollars: formatCurrency(metrics.pl ?? metrics.netPremium ?? metrics.netProtectionCost),
    dte: dte != null ? String(dte) : "N/A",
    assignmentProb,
    riskLevel: "MEDIUM",
    riskWarning: "",
    actions: "",
    disclosure: "Options involve risk. Not suitable for all investors.",
  };

  const replaceVars = (t: string) => {
    let r = t;
    for (const [k, v] of Object.entries(variables)) {
      r = r.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
    return r;
  };

  const slack = replaceVars(template.slackTemplate);
  const xTemplate =
    "xTemplate" in template && typeof template.xTemplate === "string"
      ? template.xTemplate
      : template.slackTemplate.replace(/\*?\[?\{account\}\]?\*?\s*/g, "");
  const x = truncateForX(replaceVars(xTemplate), 280);

  return { slack, x };
}

function mapTypeToStrategy(type?: string): string {
  if (!type) return "Alert";
  const map: Record<string, string> = {
    "option-scanner": "Option Scanner",
    "covered-call": "Covered Call",
    "protective-put": "Protective Put",
    "daily-analysis": "Daily Analysis",
    "risk-scanner": "Risk Scanner",
    "straddle-strangle": "Straddle/Strangle",
  };
  return map[type] ?? type;
}

/** Check if current time is within quiet hours. */
export function isWithinQuietHours(quietHours?: AlertConfig["quietHours"]): boolean {
  if (!quietHours?.start || !quietHours?.end) return false;

  const tz = quietHours.timezone ?? "America/New_York";
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const currentMinutes = hour * 60 + minute;

  const [startH, startM] = quietHours.start.split(":").map(Number);
  const [endH, endM] = quietHours.end.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

/** Check if alert passes config thresholds. */
export function passesThresholds(
  alert: StoredAlert,
  thresholds: AlertConfig["thresholds"]
): boolean {
  if (!thresholds) return true;

  const metrics = (alert.metrics ?? alert.details ?? {}) as MetricsLike;
  const plPercent = metrics.plPercent ?? metrics.priceChangePercent;
  const dte = metrics.dte ?? metrics.daysToExpiration;

  if (thresholds.minPlPercent != null && plPercent != null) {
    if (Math.abs(plPercent) < thresholds.minPlPercent) return false;
  }
  if (thresholds.maxDte != null && dte != null) {
    if (dte > thresholds.maxDte) return false;
  }
  return true;
}

/** Deliver alert to Slack. */
async function deliverToSlack(
  message: string,
  webhookUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { success: false, error: `Slack ${res.status}: ${text.slice(0, 200)}` };
    }
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Deliver alert to X. */
async function deliverToX(message: string): Promise<{ success: boolean; error?: string }> {
  try {
    await postToXTweet(message);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Deliver a single alert to a channel. */
export async function deliverAlert(
  alert: StoredAlert,
  channel: "slack" | "twitter",
  config: { webhookUrl?: string; templateId: AlertTemplateId; accountName?: string }
): Promise<{ success: boolean; error?: string }> {
  const alertTemplates = await getAlertTemplates();
  const { slack, x } = formatScannerAlert(
    alert,
    config.templateId,
    config.accountName,
    alertTemplates
  );
  const message = channel === "slack" ? slack : x;

  if (channel === "slack") {
    if (!config.webhookUrl?.trim()) {
      return { success: false, error: "Slack webhook not configured" };
    }
    return deliverToSlack(message, config.webhookUrl);
  }

  if (channel === "twitter") {
    return deliverToX(message);
  }

  return { success: false, error: `Unknown channel: ${channel}` };
}

/** Get AlertConfig for job type (account-specific or global default). */
export async function getAlertConfig(
  jobType: AlertConfigJobType,
  accountId?: string
): Promise<AlertConfig | null> {
  const db = await getDb();

  if (accountId) {
    const accountConfig = await db.collection<AlertConfig>("alertConfigs").findOne({
      jobType,
      accountId,
      enabled: true,
    });
    if (accountConfig) return accountConfig;
  }

  const globalConfig = await db.collection<AlertConfig>("alertConfigs").findOne({
    jobType,
    accountId: { $exists: false },
    enabled: true,
  });
  return globalConfig;
}

/** Get account display name for alert (which account to take action on). */
async function getAccountNameForAlert(
  db: Awaited<ReturnType<typeof getDb>>,
  accountId: string
): Promise<string | undefined> {
  try {
    const acc = await db
      .collection("accounts")
      .findOne(
        { _id: new ObjectId(accountId) },
        { projection: { name: 1, broker: 1 } }
      );
    if (!acc) return undefined;
    const a = acc as { name?: string; broker?: string };
    return a.broker ?? a.name;
  } catch {
    return undefined;
  }
}

/** Get webhook/target for channel from alertPreferences. */
async function getChannelTarget(
  accountId: string | undefined,
  channel: "slack" | "twitter"
): Promise<string | null> {
  if (!accountId) return null;
  const db = await getDb();
  const prefs = await db.collection("alertPreferences").findOne({ accountId });
  const entry = (prefs?.channels || []).find(
    (c: { channel: string; target: string }) => c.channel === channel
  );
  return entry?.target?.trim() ?? null;
}

/** Main entry: process undelivered alerts and deliver to configured channels. */
export async function processAlertDelivery(accountId?: string): Promise<{
  processed: number;
  delivered: number;
  failed: number;
  skipped: number;
}> {
  const db = await getDb();
  let processed = 0;
  let delivered = 0;
  let failed = 0;
  let skipped = 0;

  const jobTypes: AlertConfigJobType[] = [
    "daily-analysis",
    "option-scanner",
    "covered-call",
    "protective-put",
    "straddle-strangle",
    "risk-scanner",
  ];

  for (const jobType of jobTypes) {
    const config = await getAlertConfig(jobType, accountId);
    if (!config || config.channels.length === 0) continue;

    if (isWithinQuietHours(config.quietHours)) {
      continue;
    }

    const typeQuery: Record<string, unknown> =
      jobType === "daily-analysis"
        ? { $or: [{ type: "daily-analysis" }, { watchlistItemId: { $exists: true }, type: { $exists: false } }] }
        : jobType === "risk-scanner"
          ? { type: "risk-scanner" }
          : { type: jobType };

    const query: Record<string, unknown> = {
      ...typeQuery,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
    };
    if (accountId) query.accountId = accountId;

    const alerts = (await db
      .collection<StoredAlert>("alerts")
      .find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray()) as (StoredAlert & { _id: ObjectId })[];

    let accountName: string | undefined;
    if (accountId) {
      const acc = await db.collection("accounts").findOne({ _id: new ObjectId(accountId) });
      accountName = (acc as { name?: string })?.name;
    }

    for (const alert of alerts) {
      processed++;

      if (!passesThresholds(alert, config.thresholds)) {
        skipped++;
        continue;
      }

      const deliveryStatus = (alert.deliveryStatus ?? {}) as Record<string, AlertDeliveryRecord>;

      const displayAccountName =
        accountName ??
        (alert.accountId ? await getAccountNameForAlert(db, alert.accountId) : undefined);

      for (const ch of config.channels) {
        const existing = deliveryStatus[ch];
        if (existing?.status === "sent") continue;

        let webhookUrl: string | null = null;
        if (ch === "slack") {
          webhookUrl = await getChannelTarget(alert.accountId ?? accountId ?? undefined, "slack");
        }

        const result = await deliverAlert(alert, ch, {
          webhookUrl: webhookUrl ?? undefined,
          templateId: config.templateId,
          accountName: displayAccountName,
        });

        const record: AlertDeliveryRecord = {
          channel: ch,
          status: result.success ? ("sent" as AlertDeliveryStatus) : ("failed" as AlertDeliveryStatus),
          sentAt: result.success ? new Date().toISOString() : undefined,
          error: result.error,
        };

        deliveryStatus[ch] = record;

        if (result.success) {
          delivered++;
        } else {
          failed++;
        }
      }

      await db.collection("alerts").updateOne(
        { _id: alert._id },
        { $set: { deliveryStatus, updatedAt: new Date().toISOString() } }
      );
    }
  }

  return { processed, delivered, failed, skipped };
}
