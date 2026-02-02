import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";

export const metadata = {
  title: "Investment Strategy | myInvestments",
  description:
    "Wheel strategy, covered calls, and cash-secured puts: a practical approach to income and portfolio management.",
};

export default function StrategyDocPage() {
  return (
    <div className="min-h-screen">
      <AppHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>

        <article className="prose prose-slate max-w-none">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Investment Strategy Approach
          </h1>
          <p className="text-gray-600 mt-2 lead">
            A practical guide to the options wheel, covered calls, and
            cash-secured puts—designed to generate income while managing risk.
          </p>

          {/* How the Wheel Works */}
          <section className="mt-10">
            <h2 className="text-xl font-semibold text-gray-900 border-b border-gray-200 pb-2">
              How the Wheel Works
            </h2>
            <ol className="list-decimal list-inside space-y-2 mt-4 text-gray-700">
              <li>
                <strong>Start:</strong> Begin with cash or existing shares.
              </li>
              <li>
                <strong>Sell OTM Cash-Secured Puts (CSP):</strong> Sell puts
                below the current stock price to collect premium.
              </li>
              <li>
                <strong>If CSP expires worthless:</strong> Keep the premium and
                repeat step 2.
              </li>
              <li>
                <strong>If CSP is assigned:</strong> You acquire shares at the
                strike price.
              </li>
              <li>
                <strong>Sell OTM Covered Calls (CC):</strong> Once you have
                shares, sell calls above the current price.
              </li>
              <li>
                <strong>If CC expires worthless:</strong> Keep the premium and
                repeat step 5.
              </li>
              <li>
                <strong>If CC is assigned:</strong> Your shares are sold at the
                strike price, and you return to step 2.
              </li>
            </ol>
            <p className="mt-4 text-gray-600">
              This creates a continuous cycle of generating income while
              potentially accumulating or managing stock positions.
            </p>
          </section>

          {/* Covered Call Strategy */}
          <section className="mt-10">
            <h2 className="text-xl font-semibold text-gray-900 border-b border-gray-200 pb-2">
              Covered Call Strategy — Weekly / Bi-Weekly
            </h2>
            <p className="mt-4 text-gray-600">
              Covered calls suit investors who are bullish long-term but want
              consistent income. Weekly or bi-weekly expirations maximize premium
              collection through time decay.
            </p>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4">
                <h3 className="font-semibold text-gray-900">Weekly Approach</h3>
                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                  <li>Expiration: 5–7 days out</li>
                  <li>Strike: 3–5% OTM</li>
                  <li>Premium: Lower per trade, compounds faster</li>
                  <li>Best for: High volatility, active management</li>
                </ul>
                <p className="mt-2 text-xs text-gray-500">
                  Example: Stock at 450, sell 465 call (3.3% OTM) for $3.50 →
                  ~0.78% weekly yield.
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4">
                <h3 className="font-semibold text-gray-900">
                  Bi-Weekly (Recommended)
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                  <li>Expiration: 10–14 days out</li>
                  <li>Strike: 5–10% OTM</li>
                  <li>Premium: Better per trade</li>
                  <li>Best for: Moderate volatility, less active management</li>
                </ul>
                <p className="mt-2 text-xs text-gray-500">
                  Example: Stock at 450, sell 485 call (7.8% OTM) for $6.00 →
                  ~1.33% bi-weekly yield.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/80 p-4">
              <h3 className="font-semibold text-amber-900">
                Target: 5–10% annual return from premiums
              </h3>
              <p className="mt-2 text-sm text-amber-800">
                Sell calls 5–10% OTM with 2–4 week expirations to balance
                premium income, upside participation, and lower assignment risk.
              </p>
            </div>
          </section>

          {/* If Called Away */}
          <section className="mt-10">
            <h2 className="text-xl font-semibold text-gray-900 border-b border-gray-200 pb-2">
              If Called Away — Start the Wheel
            </h2>
            <p className="mt-4 text-gray-600">
              When your covered call is assigned and shares are sold:
            </p>
            <ul className="mt-3 space-y-2 text-gray-700">
              <li>Collect the strike price (ideally above cost basis).</li>
              <li>Keep the premium regardless.</li>
              <li>Use cash to sell cash-secured puts at a strike you&apos;d be
                happy to own.</li>
              <li>Get assigned? Sell covered calls. Expire worthless? Sell more
                puts.</li>
            </ul>
            <p className="mt-4 text-gray-600 italic">
              Being &quot;called away&quot; isn&apos;t losing—it&apos;s taking
              profits and resetting for the next opportunity. The wheel keeps
              your capital working whether you hold shares or cash.
            </p>
          </section>

          {/* Return Calculator */}
          <section className="mt-10">
            <h2 className="text-xl font-semibold text-gray-900 border-b border-gray-200 pb-2">
              Covered Call Return Calculator
            </h2>
            <p className="mt-4 text-gray-600 text-sm">
              Quick math: <strong>Premium ÷ Stock Price = Trade yield.</strong>{" "}
              Example: $5 premium on $500 stock = 1% per trade. Bi-weekly: 26
              trades × 1% ≈ 26% annualized before assignments; factor in
              rolls/assignments for ~13% actual.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border border-gray-200 rounded-lg overflow-hidden text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">
                      Target annual return
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">
                      Per trade (bi-weekly)
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">
                      Per trade (weekly)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  <tr>
                    <td className="px-4 py-2">5%</td>
                    <td className="px-4 py-2">0.19%</td>
                    <td className="px-4 py-2">0.10%</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">8%</td>
                    <td className="px-4 py-2">0.31%</td>
                    <td className="px-4 py-2">0.15%</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">10%</td>
                    <td className="px-4 py-2">0.38%</td>
                    <td className="px-4 py-2">0.19%</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">15%</td>
                    <td className="px-4 py-2">0.58%</td>
                    <td className="px-4 py-2">0.29%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Getting Started */}
          <section className="mt-10">
            <h2 className="text-xl font-semibold text-gray-900 border-b border-gray-200 pb-2">
              Getting Started in myInvestments
            </h2>
            <ul className="mt-4 space-y-2 text-gray-700">
              <li>Set up your portfolio — add positions and cash in Accounts.</li>
              <li>Add options positions — track covered calls and CSPs in
                Positions.</li>
              <li>Review market conditions — use dashboard and watchlist.</li>
              <li>Analyze opportunities — use xStrategyBuilder for income
                strategies.</li>
              <li>Monitor positions — track options and roll recommendations.</li>
            </ul>
          </section>

          {/* Pro Tips */}
          <section className="mt-10">
            <h2 className="text-xl font-semibold text-gray-900 border-b border-gray-200 pb-2">
              Pro Tips
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <h3 className="font-medium text-gray-800">Covered calls</h3>
                <ul className="mt-1 list-disc list-inside text-gray-600 text-sm space-y-1">
                  <li>Sell calls 5–10% OTM for balanced premium and upside.</li>
                  <li>Target 4–8 weeks to expiration for time decay.</li>
                  <li>Monitor delta; consider rolling if it exceeds 0.7–0.8.</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-gray-800">Cash-secured puts</h3>
                <ul className="mt-1 list-disc list-inside text-gray-600 text-sm space-y-1">
                  <li>Sell puts at prices you&apos;d be happy to own the stock.</li>
                  <li>Use RSI oversold (&lt;30) for better entry points.</li>
                  <li>Keep cash reserved for potential assignment.</li>
                </ul>
              </div>
            </div>
          </section>
        </article>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
