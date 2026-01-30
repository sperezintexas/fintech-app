# myInvestments

## Overview
This application manages investment portfolios, accounts and cash, an account may have one or more positions (stocks, options)

It aggregates portfolio values, supports risk profiles and strategies per account, and integrates real-time data from YahooQuery Built with Next.js, React, TypeScript, and MongoDB.

## Tech Stack
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS v4
- **Database**: MongoDB
- **Market Data**: Yahoo Finance API

## Requirements

### Functional Requirements
- **Dashboard** : Home page with market snapshot and portfolio summary
- **Portfolio Management**: Define a portfolio that aggregates values from one or more accounts. Portfolio includes total value roll-up, performance metrics (e.g., ROI, unrealized gains/losses)., and today's market snapshot

- **Account Management**: Each account has:
  - Unique ID, name, balance.
  - Risk level (e.g., low, medium, high).
  - Preferred investment strategy (e.g., growth, income, balanced; moderate/aggressive options aligned with user goals like Tesla-focused growth to 1M shares by 2030).
  - Zero or many positions.
  - Recommendations generated based on positions (e.g., buy/sell suggestions using current/mid/future earnings data for stocks like TSLA, NVDA).
- **Position Management**: Positions can be:
  - Stocks: Ticker, shares, purchase price, current value (fetched via Yahoo).
  - Options: Contract details (strike, expiration, type: call/put), quantity, premium.
  - Cash: Amount, currency.
  - Each position links to a watch list item
- **Watch List**: Per position and account, track symbols with alerts (e.g., price changes, sentiment, rational, rsi, iv
- **Recommendations**: Algorithmic suggestions per account, factoring risk/strategy. Moderate: Bull call spreads on TSLA/NVDA. Aggressive: OTM calls on volatile stocks like IONQ.
- **Real-time Updates**: Fetch stock/option prices via Yahoo API for live UI refreshes.
- **Data Persistence**: Store portfolios, accounts, positions in MongoDB.
- **UI Features**: Dashboard with views for portfolios, accounts, positions; real-time charts; input forms for adding/editing; recommendation panel.

### Non-Functional Requirements
- **Performance**: Real-time updates via WebSockets or polling (every 5-10s during market hours).
- **Security**: Environment variables for API keys. Next.js API routes for secure backend calls.
- **Scalability**: MongoDB handles datasets efficiently. Next.js supports edge deployment.
- **Deployment**: Local dev with `npm run dev`. Production via Vercel or Docker.

## Project Structure
```
src/
├── app/                    # Next.js App Router
│   ├── globals.css         # Tailwind styles
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Landing page
├── components/             # React components
│   ├── PortfolioCard.tsx   # Portfolio overview
│   └── MarketConditions.tsx # Market indices
├── lib/                    # Utilities
│   ├── mongodb.ts          # DB connection
│   └── mock-data.ts        # Sample data
└── types/                  # TypeScript types
    └── portfolio.ts        # Domain types
```

## High-Level Design

### Components
- **Frontend**: Next.js App Router with React Server Components and Client Components for interactivity.
- **API Layer**: Next.js API routes (`/api/*`) for backend logic, Yahoo integration, and MongoDB operations.
- **Database**: MongoDB schemas:
  - Portfolio: {_id, name, accounts: [account_ids], total_value}.
  - Account: {_id, name, risk_level, strategy, positions: [position_ids], recommendations: []}.
  - Position: {_id, type (stock/option/cash), details (ticker/strike/etc.), watch_list: {symbol, alerts}}.
- **Integration**: Yahoo API for real-time data (stocks, options chains). WebSocket or polling for updates.
- **Recommendation Engine**: Rule-based logic: For moderate risk, suggest spreads on TSLA; aggressive, OTM calls.

### Data Flow
1. User adds portfolio/account/position via UI.
2. API route saves to MongoDB.
3. UI requests updates; API fetches from Yahoo, computes values/recommendations.
4. Display aggregated portfolio value, positions, suggestions.

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### Installation
```bash
npm install
```

### Environment Variables
Create `.env.local`:
```
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=myinvestments
```

### Development
```bash
npm run dev
```
Open http://localhost:3000

### Build
```bash
npm run build
npm start
```

## Scheduled Alert Analysis

The watchlist alert system analyzes your positions daily and generates HOLD/CLOSE/BTC recommendations.

### Built-in Scheduler
The app includes an **Agenda.js** scheduler backed by MongoDB for persistent job scheduling:

1. Go to **Watchlist → Alert Settings → Scheduled Jobs**
2. Click **"Setup Default Schedule"** to create:
   - `daily-analysis`: 4:00 PM Mon-Fri (market close)
   - `cleanup-alerts`: 2:00 AM Sunday (removes old alerts)
3. Jobs persist in MongoDB and survive app restarts

**Deployment note:** Agenda requires a **persistent process** (it polls MongoDB every minute). Report jobs and scheduled jobs will not run on Vercel/serverless—use a platform with a long-running process (Railway, Render, Fly.io, Docker, VPS) and run `npm run start`.

**API Endpoints:**
```bash
# Get scheduler status
GET /api/scheduler

# Setup default jobs
POST /api/scheduler
{ "action": "setup-defaults" }

# Run job immediately
POST /api/scheduler
{ "action": "run", "jobName": "daily-analysis" }

# Schedule custom job
POST /api/scheduler
{ "action": "schedule", "jobName": "daily-analysis", "schedule": "0 16 * * 1-5" }

# Cancel job
POST /api/scheduler
{ "action": "cancel", "jobName": "daily-analysis" }
```


### Alert Configuration
In Watchlist → Alert Settings:
- **Delivery Channels**: Slack, Push, twitter
- **Message Templates**: Concise, Detailed, Actionable, Risk-Aware
- **Thresholds**: Profit %, Loss %, DTE warnings
- **Quiet Hours**: Don't alert during specified times

## Version
1.0.0
