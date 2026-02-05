import { AppHeader } from "@/components/AppHeader";
import { ChatInterface } from "@/components/ChatInterface";

export const metadata = {
  title: "Smart Grok Chat | myInvestments",
  description: "Real-time investment advice and portfolio analysis powered by Grok-style reasoning",
};

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams> | SearchParams;
}) {
  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const symbol = typeof params?.symbol === "string" ? params.symbol : undefined;
  const strike = typeof params?.strike === "string" ? parseFloat(params.strike) : undefined;
  const expiration = typeof params?.expiration === "string" ? params.expiration : undefined;
  const credit = typeof params?.credit === "string" ? parseFloat(params.credit) : undefined;
  const quantity = typeof params?.quantity === "string" ? parseInt(params.quantity, 10) : undefined;
  const probOtm = typeof params?.probOtm === "string" ? parseInt(params.probOtm, 10) : undefined;

  const orderContext =
    symbol && strike != null && expiration && credit != null
      ? {
          symbol,
          strike,
          expiration,
          credit,
          quantity: quantity ?? 1,
          probOtm: probOtm ?? undefined,
        }
      : undefined;

  const initialMessage =
    orderContext &&
    "Find covered call alternatives with higher probability OTM (around 70%) and higher premium for the same or next week.";

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900">Smart Grok Chat</h2>
          <p className="text-gray-600 mt-1">
            Ask about stocks, market outlook, portfolio, or investment strategies. Powered by Yahoo Finance data.
          </p>
        </div>
        <ChatInterface initialMessage={initialMessage} initialOrderContext={orderContext} />
      </main>
    </div>
  );
}
