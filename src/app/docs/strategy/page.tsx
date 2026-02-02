import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Investment Strategy | myInvestments",
  description:
    "Wheel strategy, covered calls, and cash-secured puts: maximize TSLA-centric income and portfolio growth.",
};

const RETURN_TABLE = [
  { annual: "5%", biWeekly: "0.19%", weekly: "0.10%" },
  { annual: "8%", biWeekly: "0.31%", weekly: "0.15%" },
  { annual: "10%", biWeekly: "0.38%", weekly: "0.19%" },
  { annual: "15%", biWeekly: "0.58%", weekly: "0.29%" },
];

export default function StrategyDocPage() {
  return (
    <div className="min-h-screen">
      <AppHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 px-6 py-10 sm:px-8 sm:py-12 text-white shadow-xl">
          <div className="relative z-10">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-blue-100 hover:text-white transition-colors mb-6"
            >
              <span aria-hidden>←</span> Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Investment Strategy
            </h1>
            <p className="mt-3 text-lg text-blue-100 max-w-2xl">
              TSLA-centric wheel strategy: compound premiums into shares, target 5–15%+ annualized yields atop EV/AI growth. Merrill path to ~1M by 2030; Fidelity aggressive track to 50%+ by 2026.
            </p>
          </div>
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-white/10 to-transparent pointer-events-none" aria-hidden />
        </div>

        {/* App Purpose */}
        <section className="mt-10">
          <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">App Purpose</h2>
          <p className="mt-3 text-gray-700 leading-relaxed">
            Leverage the wheel on TSLA (typical range ~$400–442) to compound premiums into shares—targeting Merrill&apos;s 525 TSLA toward 1M by 2030 via 5–15% annualized yields. For Fidelity&apos;s $25K, aggressive puts/calls aim 50%+ by 2026, with xAI/Grok integration and exposure to SpaceX defense themes (via TSLA) amid 2026 robotaxi and defense catalysts.
          </p>
        </section>

        {/* Wheel Overview */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Wheel Strategy Overview</h2>
          <p className="mt-3 text-gray-700 leading-relaxed">
            Sell OTM cash-secured puts (CSPs) for premium; if assigned, acquire discounted shares; then sell OTM covered calls (CCs) on holdings. Expires worthless? Repeat. Assigned? Reset with puts. Generates income in neutral/bullish markets and reduces cost basis.
          </p>
          <div className="mt-6 rounded-xl border border-gray-200 bg-gray-100/80 overflow-hidden">
            <video
              src="/grok-video.mp4"
              controls
              className="w-full aspect-video"
              preload="metadata"
              aria-label="Wheel strategy illustration"
            >
              Your browser does not support the video tag.
            </video>
            <p className="px-4 py-2 text-sm text-gray-500 text-center">
              Illustration: wheel strategy overview
            </p>
          </div>
          <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50/50 p-5 sm:p-6">
            <h3 className="font-medium text-gray-900 mb-4">Steps</h3>
            <ol className="space-y-3 text-gray-700">
              {[
                "Start with cash or existing shares.",
                "Sell OTM CSP (e.g., 5–10% below spot, bi-weekly, premium ~1–2%).",
                "Expires worthless: Keep premium, repeat step 2.",
                "Assigned: Buy shares at strike.",
                "Sell OTM CC (e.g., 5–10% above spot).",
                "Expires worthless: Keep premium, repeat step 5.",
                "Assigned: Sell shares at strike, return to CSPs.",
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Covered Calls */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Covered Calls: Weekly / Bi-Weekly</h2>
          <p className="mt-3 text-gray-700 leading-relaxed">
            Bullish income on TSLA holdings. Weekly: 5–7 days, 3–5% OTM (e.g., TSLA $420 → sell $435 call for $3.50, ~0.8% yield). Bi-weekly (recommended): 10–14 days, 5–10% OTM (e.g., sell $450 call for $6, ~1.3% yield). Annualized potential 35–40% from premiums. If called: profit at strike + premium; wheel to CSPs at desired re-entry.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900">Weekly</h3>
              <ul className="mt-2 space-y-1 text-sm text-gray-600">
                <li>5–7 days, 3–5% OTM</li>
                <li>Lower per trade, compounds faster</li>
                <li>Best for high volatility, active management</li>
              </ul>
            </div>
            <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900">Bi-Weekly (Recommended)</h3>
              <ul className="mt-2 space-y-1 text-sm text-gray-600">
                <li>10–14 days, 5–10% OTM</li>
                <li>Better premium per trade</li>
                <li>Moderate volatility, less active</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/80 p-5">
            <h3 className="font-semibold text-amber-900">Return calculator</h3>
            <p className="mt-1 text-sm text-amber-800">
              Premium ÷ Stock price = trade yield. Bi-weekly: ~26 trades × yield ≈ annualized before assignments.
            </p>
            <div className="mt-4 overflow-x-auto rounded-lg border border-amber-200 bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-amber-200 bg-amber-50/50">
                    <th className="px-4 py-2.5 text-left font-semibold text-amber-900">Target annual</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-amber-900">Bi-weekly per trade</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-amber-900">Weekly per trade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {RETURN_TABLE.map((row, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 font-medium text-gray-800">{row.annual}</td>
                      <td className="px-4 py-2.5 text-gray-700">{row.biWeekly}</td>
                      <td className="px-4 py-2.5 text-gray-700">{row.weekly}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 80% Rule */}
        <section className="mt-12">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-emerald-900 sm:text-xl">80% Rule</h2>
            <p className="mt-2 text-gray-700 leading-relaxed">
              Capture 80% of premium profit early (e.g., sold $1/contract, buy back at $0.20). Applies to sold options; buy back when decayed for CSPs/CCs. This is premium capture, not ROI. Set alarms; if losses mount, consider buying back at your risk level.
            </p>
          </div>
        </section>

        {/* Strategy Approaches */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Strategy Approaches</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-1 lg:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold uppercase tracking-wide text-blue-600">Moderate Merrill (20–30%)</div>
              <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                Allocate 30% of holdings: sell bi-weekly CCs on 20–30% of shares (5–10% OTM, e.g. $450–470 strikes). Reinvest premiums into TSLA shares/LEAPs. Use RSI &lt;30 for CSP entries. Compounds toward ~750K shares by 2030 with TSLA&apos;s AI/defense earnings (projected $50B+ revenue).
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Aggressive Merrill (30–50%)</div>
              <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                50%+ allocation: weekly tighter strikes (2–5% OTM). Roll if delta &gt;0.7. Target 15% premium yields; reinvest all into TSLA for 1M+ shares by 2030, leveraging xAI/Grok synergies.
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-5 shadow-sm">
              <div className="text-sm font-semibold uppercase tracking-wide text-amber-800">Aggressive Fidelity ($25K → 50%+ by 2026)</div>
              <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                Full allocation to weekly CSPs (-10% strikes) for premiums/assignments; after assignment, tight CCs (2–5% OTM). Margin borrow 7–9% for LEAPs (2027–2028 OTM). High volatility suits TSLA 2026; cap margin to avoid liquidation. Potential 100%+ if defense/xAI catalysts hit.
              </p>
            </div>
          </div>
        </section>

        {/* Pro Tips */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Pro Tips</h2>
          <ul className="mt-4 space-y-2 text-gray-700">
            <li className="flex gap-2">
              <span className="text-blue-500 shrink-0" aria-hidden>•</span>
              <span><strong>CSPs:</strong> Sell at oversold RSI; reserve cash for assignment.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-500 shrink-0" aria-hidden>•</span>
              <span><strong>CCs:</strong> 4–8 weeks expiration; roll if ITM.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-500 shrink-0" aria-hidden>•</span>
              <span>Monitor via app dashboard; use strategy builder for TSLA wheels.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-500 shrink-0" aria-hidden>•</span>
              <span>Wheel TSLA as SpaceX proxy; xAI/Grok boosts earnings narrative.</span>
            </li>
          </ul>
        </section>

        {/* Benefits */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Benefits</h2>
          <p className="mt-3 text-gray-700 leading-relaxed">
            Income generation (premiums reduce basis). Cost reduction on assignments. Time decay advantage. Risk management in stable names like TSLA. Controlled volatility exposure.
          </p>
        </section>

        {/* Risks / Disclaimers */}
        <section className="mt-12">
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-red-900 sm:text-xl">Risks &amp; Disclaimers</h2>
            <p className="mt-3 text-sm text-gray-700 leading-relaxed">
              Large losses if bearish (e.g., assigned CSP in a downturn). Not suitable for everyone; read the OCC&apos;s &quot;Characteristics and Risks of Standardized Options.&quot; Options involve risk—potential full capital loss; no guarantees. Consult an advisor; past performance is not indicative of future results. Strategy is profitable in neutral/bullish markets and can lose in sustained bears. Zero DTE has no overnight risk but carries high overall risk.
            </p>
          </div>
        </section>

        {/* Getting Started */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Getting Started</h2>
          <ul className="mt-4 space-y-2 text-gray-700">
            <li>Add TSLA positions and cash in <Link href="/accounts" className="text-blue-600 hover:underline">Accounts</Link>.</li>
            <li>Track options in <Link href="/holdings" className="text-blue-600 hover:underline">Holdings</Link> and <Link href="/positions" className="text-blue-600 hover:underline">Positions</Link>.</li>
            <li>Use <Link href="/xstrategybuilder" className="text-blue-600 hover:underline">xStrategyBuilder</Link> for TSLA wheels.</li>
            <li>Monitor rolls and recommendations on the <Link href="/" className="text-blue-600 hover:underline">dashboard</Link>.</li>
          </ul>
        </section>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
