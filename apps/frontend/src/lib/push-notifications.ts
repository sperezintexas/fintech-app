import type { ScheduledAlert, WatchlistAlert } from "@/types/portfolio";
import { formatAlert, getTemplate } from "./alert-formatter";
import type { WatchlistItem, RiskLevel } from "@/types/portfolio";
import { getAlertTemplates } from "./templates-store";

// Send push notification to a subscription
export async function sendPushNotification(
  subscription: PushSubscription,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  try {
    const response = await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription,
        title,
        body,
        data,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error("Failed to send push notification:", error);
    return false;
  }
}

// Send alert as push notification
export async function sendAlertAsPush(
  subscription: PushSubscription,
  scheduledAlert: ScheduledAlert,
  item: WatchlistItem,
  riskLevel: RiskLevel,
  accountName?: string
): Promise<boolean> {
  const alertTemplates = await getAlertTemplates();
  const template = getTemplate(scheduledAlert.templateId, alertTemplates);
  const formatted = formatAlert({
    alert: scheduledAlert.alert as WatchlistAlert,
    item,
    riskLevel,
    template,
    accountName,
  });

  return sendPushNotification(
    subscription,
    formatted.subject,
    formatted.sms, // Use SMS format for push body (shorter)
    {
      url: "/watchlist",
      symbol: scheduledAlert.alert.symbol,
      recommendation: scheduledAlert.alert.recommendation,
      severity: scheduledAlert.alert.severity,
    }
  );
}
