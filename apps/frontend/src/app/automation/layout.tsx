import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AutomationNav } from "./AutomationNav";

export default function AutomationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900">Setup</h2>
          <p className="text-gray-600 mt-1">Manage portfolio, default account & broker, goals, users, tasks, and alerts</p>
        </div>
        <Suspense fallback={<div className="h-12 border-b border-gray-200 mb-6" />}>
          <AutomationNav />
        </Suspense>
        {children}
      </main>
    </div>
  );
}
