import { Suspense } from "react";
import { AccountsContent } from "./AccountsContent";

function AccountsFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-gray-500">Loading accounts...</p>
      </div>
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<AccountsFallback />}>
      <AccountsContent />
    </Suspense>
  );
}
