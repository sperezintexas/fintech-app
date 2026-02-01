# Cursor Rules for myInvestments App

## Core Mission
Build and maintain a personal investment tracking & automation app focused on maximizing long-term portfolio growth:
- Merrill account: Grow 525 TSLA shares (Jan 2026) toward a balanced ~$1M portfolio by 2030
- Fidelity account: Aggressively grow $25k with high-risk options strategies targeting maximum returns by end of 2026
- Primary focus: Sound options strategies centered on TSLA, SpaceX proxies (BA, defense), xAI/Grok proxies (NVDA, emerging AI), defense (LMT, RTX, NOC)

## Architecture & Tech Rules
- Next.js 16+ (App Router), React 19, TypeScript
- Styling: Tailwind CSS v4
- Database: MongoDB (schemas: Portfolio, Account, Position, WatchlistItem)
- Market data: Yahoo Finance via algotrader repo integration or yahooquery wrapper
- Backend automation: Leverage algotrader (Node.js) for portfolio logic, scheduling, order simulation
- Real-time: Polling (5–10s during market hours) or WebSockets
- Scheduler: Agenda.js (MongoDB-backed) for daily analysis, alerts

## Key Domain Rules
1. Portfolio
   - Aggregates multiple Accounts
   - Tracks total value, unrealized/realized P&L, ROI, performance vs benchmarks
   - Goal tracking: Merrill → $1M balanced by 2030; Fidelity → aggressive max by 2026

2. Account
   - Fields: name, broker (Merrill/Fidelity), risk_level ("moderate" | "aggressive"), strategy ("growth" | "income" | "balanced")
   - Recommendations generated per risk/strategy and tied to TSLA/xAI

3. Position Types
   - Stock: ticker, shares, avg_cost, current_value
   - Option: contract (symbol/strike/exp/call-put), quantity, premium_paid, greeks if available
   - Cash: amount, currency

4. Watchlist
   - Per position/account: symbol, price thresholds, RSI, IV rank, DTE alerts, sentiment triggers
   - Delivery: Slack, Twitter/X (via API), in-app notifications.
5. Alerts
   - ability to define alerts based on either position or watchlist items
   - provide UI preview and test to help validate configuration
   - alerts will provide configure or trigger rules on when to send notification to supported delivery channels, slack, x(twiiter) and push.

5. Options Strategy Guidelines
   Moderate (Merrill):
   - Covered calls on TSLA holdings
   - Bull call/put spreads on TSLA/NVDA dips
   - Cash-secured puts below support for entry
   - Wheel strategy when assigned

   Aggressive (Fidelity):
   - OTM/LEAP calls on TSLA, NVDA, IONQ during momentum
   - Straddles/strangles around earnings or events
   - Naked puts on high-IV defense names (RTX, LMT) for premium
   - High-delta directional bets on SpaceX proxies

6. Recommendation Engine
   - Rule-based + current/mid/future earnings outlook
   - TSLA bias: Robotaxi, FSD, energy, Optimus growth drivers
   - Always factor IV, DTE, delta, theta decay
   - Include risk disclaimer referencing OCC "Characteristics and Risks of Standardized Options"
   - provide anlysis using grok xAi api's using keys from env.local
8x Automation
 - xStrategyBuilder from accounts or watchlist item or position, provide user ability to choose strategy

7. Scheduled Jobs (Agenda.js)
   - daily-analysis: 4:00 PM Mon–Fri → evaluate positions, generate HOLD/CLOSE/BTC
   - cleanup-alerts: Sunday 2:00 AM → prune old alerts
   - earnings-check: pre/post earnings for TSLA/NVDA proxies

8. UI/UX Rules
   - Dashboard: market snapshot + portfolio summary + charts (Recharts)
   - No images in tables/lists; use sparingly for charts/position visuals
   - Forms validated; secure API routes for all DB/market actions

9. Risk & Disclaimer
   - Every recommendation UI must include:
     "Options involve substantial risk and are not suitable for all investors. Review the OCC booklet 'Characteristics and Risks of Standardized Options' before trading."
   - Never suggest undefined-risk strategies without clear warnings

10. Development Style
    - Prefer composition over inheritance
    - Use Server Components where possible, Client Components only for interactivity
    - Keep API routes lean and protected
    - Comment complex options logic clearly
    - Test algotrader integrations and scheduler jobs

Last updated: January 2026
Primary tickers to bias: TSLA, NVDA, BA, LMT, RTX, NOC
