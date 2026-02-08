import { getAccountsServer, getAlertsServer } from "@/lib/data-server";
import { AlertsClient } from "./AlertsClient";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const [initialAccounts, initialAlerts] = await Promise.all([
    getAccountsServer(),
    getAlertsServer({ unacknowledged: true, limit: 100 }),
  ]);

  return (
    <AlertsClient
      initialAccounts={initialAccounts}
      initialAlerts={initialAlerts}
    />
  );
}
