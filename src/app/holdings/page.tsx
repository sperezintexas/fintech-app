import { Suspense } from "react";
import { getAccountsServer } from "@/lib/data-server";
import { HoldingsClient } from "./HoldingsClient";

type PageProps = {
  searchParams: Promise<{ accountId?: string | string[] }>;
};

export default async function HoldingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const urlAccountId =
    typeof params.accountId === "string"
      ? params.accountId
      : Array.isArray(params.accountId)
        ? params.accountId[0] ?? null
        : null;
  const initialAccounts = await getAccountsServer();

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600" />
        </div>
      }
    >
      <HoldingsClient initialAccounts={initialAccounts} urlAccountId={urlAccountId} />
    </Suspense>
  );
}
