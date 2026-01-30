import { AppHeader } from "@/components/AppHeader";
import { ChatInterface } from "@/components/ChatInterface";

export const metadata = {
  title: "Smart Grok Chat | myInvestments",
  description: "Real-time investment advice and portfolio analysis powered by Grok-style reasoning",
};

export default function ChatPage() {
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
        <ChatInterface />
      </main>
    </div>
  );
}
