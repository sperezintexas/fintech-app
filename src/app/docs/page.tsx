import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Documentation | myInvestments",
  description:
    "Learn how to use myInvestments: dashboard, accounts, options strategies, automation, scanners, and configuration.",
};

const SECTIONS = [
  {
    id: "getting-started",
    title: "Getting started",
    description: "Set up your portfolio and start using the app.",
    cards: [
      {
        title: "Accounts & holdings",
        body: "Add your brokerage accounts and sync positions (stocks, options, cash). The app uses real-time data from Yahoo Finance for market values and P/L.",
        links: [{ label: "Go to Accounts", href: "/accounts" }, { label: "Holdings", href: "/holdings" }],
      },
      {
        title: "First steps",
        body: "After signing in, add at least one account with positions. Use the Dashboard for a portfolio summary and the $1M by 2030 goal probability (updated when the risk scanner runs).",
        links: [{ label: "Dashboard", href: "/" }],
      },
    ],
  },
  {
    id: "using-the-app",
    title: "Using the app",
    description: "Core features for daily use.",
    cards: [
      {
        title: "Dashboard",
        body: "Market snapshot, portfolio summary, and goal progress. The probability of reaching $1M by 2030 is shown after the greeting when the risk scanner has run.",
        links: [{ label: "Open Dashboard", href: "/" }],
      },
      {
        title: "xStrategyBuilder",
        body: "Options strategy wizard: pick a symbol, outlook, strategy (Covered Call, Cash-Secured Put, etc.), then choose expiration and strike. Defaults to ATM strike, mid limit price, and ~2 weeks out. Review order and add to watchlist or run a scan.",
        links: [{ label: "Open xStrategyBuilder", href: "/xstrategybuilder" }],
      },
      {
        title: "Watchlist",
        body: "Track symbols and option ideas. Sort by column, remove duplicates. Watchlist items can be included in reports and scanner runs.",
        links: [{ label: "Watchlist", href: "/watchlist" }],
      },
      {
        title: "Alerts",
        body: "View alerts from daily analysis and option scanners (BTC, roll, close recommendations). Filter by account and type; acknowledge from the Alerts page.",
        links: [{ label: "Alerts", href: "/alerts" }],
      },
      {
        title: "Smart Grok Chat",
        body: "AI chat for investment advice. Uses web search, market data, portfolio, and covered-call recommendations. Enable tools in chat config (market data, portfolio, risk, covered call recs).",
        links: [{ label: "Chat", href: "/chat" }],
      },
    ],
  },
  {
    id: "strategies-and-scanners",
    title: "Strategies & scanners",
    description: "How option analysis and recommendations work.",
    cards: [
      {
        title: "Investment strategy guide",
        body: "Wheel strategy, covered calls, cash-secured puts, return targets, and risk disclaimers. TSLA-centric guidance with moderate and aggressive approaches.",
        links: [{ label: "Read strategy guide", href: "/docs/strategy" }],
      },
      {
        title: "Unified Options Scanner",
        body: "Runs four scanners in one job: Option Scanner, Covered Call, Protective Put, and Straddle/Strangle. Produces recommendations (HOLD, BUY_TO_CLOSE, SELL_NEW_CALL, ROLL, etc.) and creates alerts for delivery to Slack or X.",
        links: [],
      },
      {
        title: "Covered Call Scanner",
        body: "Evaluates covered call positions and opportunities. Rule-based logic plus optional Grok refinement for edge cases. Recommendations: HOLD, BUY_TO_CLOSE, SELL_NEW_CALL, ROLL.",
        links: [],
      },
      {
        title: "Protective Put Scanner",
        body: "Identifies protective put positions and stock-without-put opportunities. Recommendations: HOLD, SELL_TO_CLOSE, ROLL, BUY_NEW_PUT.",
        links: [],
      },
      {
        title: "Goal progress ($1M by 2030)",
        body: "The dashboard shows a 0–100% probability of reaching $1M by 2030. Updated when the risk scanner runs (daily analysis or manually). Uses Grok when configured, otherwise a simple heuristic.",
        links: [],
      },
    ],
  },
  {
    id: "automation-and-jobs",
    title: "Automation & jobs",
    description: "Scheduled jobs, alerts, and delivery.",
    cards: [
      {
        title: "Setup (Automation)",
        body: "Single place for Auth Users (X sign-in), Alert Settings (Slack, X, Push), Strategy settings (option chain filters), and Scheduled Jobs. Use the Scheduler to create and run jobs.",
        links: [{ label: "Setup", href: "/automation" }],
      },
      {
        title: "Job types",
        body: "SmartXAI Report, Portfolio Summary, Watchlist Report, Daily Analysis, Option Scanner, Covered Call Scanner, Protective Put Scanner, Unified Options Scanner, Deliver Alerts, Data Cleanup. Create jobs in Setup → Scheduled Jobs; configure per job type.",
        links: [{ label: "Job types", href: "/job-types" }, { label: "Scheduler", href: "/automation/scheduler" }],
      },
      {
        title: "Alert delivery",
        body: "Configure Slack webhook, X target, and push notifications in Setup → Alert Settings. Test each channel. Alerts are sent when jobs run (e.g. Unified Options Scanner + Deliver Alerts).",
        links: [{ label: "Alert Settings", href: "/automation?tab=settings" }],
      },
      {
        title: "Scheduling (cron)",
        body: "On App Runner or EC2, Agenda runs inside the app and fires scheduled jobs from MongoDB—no GitHub or external cron needed. Create jobs in Setup → Scheduled Jobs; they run automatically. The cron API routes are only for serverless or optional manual triggers.",
        links: [],
      },
    ],
  },
  {
    id: "configuration",
    title: "Configuration",
    description: "Settings and environment.",
    cards: [
      {
        title: "Setup tabs",
        body: "Auth Users: manage X allowed usernames for sign-in. Alert Settings: delivery channels and templates. Strategy: option chain filters (min OI, volume) for xStrategyBuilder. Scheduled Jobs: create and manage jobs.",
        links: [{ label: "Setup", href: "/automation" }],
      },
      {
        title: "Auth Users (X sign-in)",
        body: "Only usernames in the Auth Users list can sign in with X. Add or remove usernames in Setup → Auth Users. Seed from env ALLOWED_X_USERNAMES (comma-separated) if needed.",
        links: [{ label: "Setup → Auth Users", href: "/automation?tab=auth-users" }],
      },
      {
        title: "Access keys",
        body: "Create API-style keys for sign-in without X. Useful for automation or when X is unavailable. Create and revoke in Settings → Access keys.",
        links: [{ label: "Access keys", href: "/settings/access-keys" }],
      },
    ],
  },
] as const;

export default function DocsLandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <AppHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-indigo-700 px-6 py-10 sm:px-8 sm:py-12 text-white shadow-xl">
          <div className="relative z-10">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-indigo-100 hover:text-white transition-colors mb-6"
            >
              <span aria-hidden>←</span> Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Documentation
            </h1>
            <p className="mt-3 text-lg text-indigo-100 max-w-2xl">
              How to use myInvestments: portfolio, options strategies, automation, scanners, and configuration.
            </p>
          </div>
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-white/10 to-transparent pointer-events-none" aria-hidden />
        </div>

        {/* Quick links */}
        <nav className="mt-8 flex flex-wrap gap-2" aria-label="Documentation sections">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              {s.title}
            </a>
          ))}
          <Link
            href="/docs/strategy"
            className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            Investment strategy →
          </Link>
        </nav>

        {/* Sections */}
        {SECTIONS.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="mt-12 scroll-mt-8"
          >
            <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">
              {section.title}
            </h2>
            <p className="mt-2 text-gray-600">
              {section.description}
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
              {section.cards.map((card) => (
                <div
                  key={card.title}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-gray-300 transition-colors"
                >
                  <h3 className="font-semibold text-gray-900">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                    {card.body}
                  </p>
                  {card.links.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {card.links.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        <div className="mt-12 pt-8 border-t border-gray-200 flex flex-wrap items-center gap-4">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Back to Dashboard
          </Link>
          <Link
            href="/docs/strategy"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Investment strategy guide →
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
