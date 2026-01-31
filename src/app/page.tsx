import Link from "next/link";
import { Dashboard } from "@/components/Dashboard";
import { Footer } from "@/components/Footer";
import { AppHeader } from "@/components/AppHeader";

export default function Home() {
  return (
    <div className="min-h-screen">
      <AppHeader />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900">
            Good afternoon, Sam
          </h2>
          <p className="text-gray-600 mt-1">
            Here&apos;s how your portfolio is performing today.
          </p>
          <Link
            href="/xstrategybuilder"
            className="inline-block mt-4 px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
          >
            → xStrategyBuilder
          </Link>
        </div>

        {/* Dashboard Component with Live Data */}
        <Dashboard />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
