# Smart Grok Chat

AI chat for investment advice, powered by xAI Grok. Combines configurable tools (web search, market data, portfolio, covered call recommendations) with a customizable system prompt. Aligns with `.cursor/rules/grokchat/` (core, api-config, monitor-position).

## Overview

- **Page**: `/chat` — Smart Grok Chat
- **API**: `POST /api/chat` — chat with conversation history
- **History**: `GET /api/chat/history` — load saved messages (per user)
- **Config**: `GET/PUT /api/chat/config` — tools and context
- **Storage**: Config in MongoDB `appUtil` collection (`key: grokChatConfig`); chat history in `chatHistory` collection (per user)

## Tools

Two kinds of tools:

### 1. LLM Tool (Web Search)

Defined in `src/lib/xai-grok.ts` as `WEB_SEARCH_TOOL` (OpenAI-compatible function tool):

```ts
{
  name: "web_search",
  description: "Search the web for current information: weather, news, earnings dates, analyst views, real-time data. Use for company/news (e.g. 'TSLA earnings', 'Tesla FSD news') when not in provided context.",
  parameters: { query: string, num_results?: number }
}
```

- **When**: Grok decides to call it during the chat completion loop (up to 3 rounds).
- **Executor**: `executeWebSearch()` → `searchWeb()` in `web-search.ts` (SerpAPI).
- **Config**: `tools.webSearch` (default: true). Requires `WEB_SEARCH_API_KEY` or `SERPAPI_API_KEY`.
- **Examples for Grok**: `TSLA earnings date 2026`, `Tesla stock news today`, `BA defense sector outlook`, `current weather Austin TX`.

### 2. LLM Tools (Schedule Jobs)

When `tools.jobs` is enabled (default: true), Grok can call:

| Tool | Description | When Grok uses it |
|------|--------------|-------------------|
| **list_jobs** | List scheduled report jobs (Unified Options Scanner, Watchlist, etc.), cron schedules, status, next run times | User asks about jobs, schedules, automation, scanners, next run |
| **trigger_portfolio_scan** | Run full portfolio options evaluation now (Unified Options Scanner + watchlist + deliver alerts) | User explicitly asks to run scan, evaluate positions now, check my options |

- **Config**: `tools.jobs` in Grok Chat config (Setup → Chat config or `/api/chat/config`).
- **Keywords that help trigger**: jobs, schedules, automation, scanners, next run, run scan, evaluate positions now, check my options.

### 3. Server-Side Pre-Fetch Tools (Market Data, Portfolio, Watchlist)

Run before the Grok call. Results are injected into the user message as `[Context from tools]`.

| Tool       | Config Key       | Trigger (regex/keywords)                                                                 | Data Source                          |
|-----------|------------------|------------------------------------------------------------------------------------------|--------------------------------------|
| Market News | `tools.marketData` | `market`, `news`, `outlook`, `trending`, `sentiment`, `conditions`, `indices`             | Yahoo `getMarketNewsAndOutlook()`     |
| Stock Prices | `tools.marketData` | `price`, `quote`, `stock`, `option`, `trading`, `how much`, `current`, `value`, or ticker symbols (2–5 chars) | Yahoo `getStockAndOptionPrices()`     |
| Portfolio & Watchlist | `tools.portfolio`  | `portfolio`, `holdings`, `positions`, `account`, `balance`, `watchlist`, `watching`, `tracking` | MongoDB `accounts` + `watchlists` + `watchlist` + Yahoo prices |
| Risk Analysis | `tools.portfolio`  | `risk`, `var`, `beta`, `sharpe`, `diversification`, `volatility`, `stress`, `analyze portfolio` | `computeRiskMetricsWithPositions` + Grok `analyzeRiskWithGrok()` |
| Covered Call Recommendations | `tools.coveredCallRecs`  | `covered call`, `my calls`, `scanner`, `recommendations`, `btc`, `roll`, `assign`, `expiration`, `should I btc/roll/close` | MongoDB `coveredCallRecommendations` (last 20 via `getRecentCoveredCallRecommendations`; see [Covered Call Scanner](coveredcallscanner.md)) |

**Notes:**
- Portfolio and Watchlist are fetched together when `tools.portfolio` is enabled and the message matches portfolio keywords. Both are injected as separate `## Portfolio` and `## Watchlist` sections.
- Stock prices include options chain when the message contains `option`, `call`, `put`, or `chain`. **Symbol normalization:** tickers are matched case-insensitively (e.g. "tsla" or "TSLA" both trigger the stock price tool).
- Ticker symbols (2–5 letters, e.g. TSLA, tsla, AAPL) trigger the stock price tool when combined with price-related keywords or options phrasing.

Context is formatted via `buildToolContext()` and prepended to the user message.

## Default System Prompt

Built in `POST /api/chat`:

```
You are Grok, a leading financial expert for myInvestments. You advise on maximizing profits using current, mid, and future potential earnings for valuable companies like TESLA. Provide brief, direct answers with no leading intro; offer more details when asked. Focus on moderate and aggressive suggestions, sound options strategies around TSLA, SpaceX proxies, xAI/Grok proxies, and defense investments. When options/positions context shows price near or above strike, advise buy-to-close (BTC) to avoid assignment when appropriate.
```

Appended dynamically:

- `User risk profile: {riskProfile}` — when `context.riskProfile` is set
- `User strategy goals: {strategyGoals}` — when `context.strategyGoals` is set
- When `tools.webSearch` is true: for current prices use the pre-injected [Context from tools] data first; use web_search only for earnings, news, sentiment, or facts not in context.
- **Data freshness:** Grok is instructed to use ONLY the REAL-TIME (LIVE/CURRENT) data in the context for prices; training data is treated as outdated.
- `Use the provided market/portfolio context when available...`
- `Always include a brief disclaimer that this is not financial advice.`

**Override**: `context.systemPromptOverride` (max 4000 chars) replaces the base prompt when non-empty.

## Config Schema

```ts
{
  tools: {
    webSearch: boolean;      // default true — LLM tool (SerpAPI)
    marketData: boolean;     // default true
    portfolio: boolean;      // default true — portfolio, watchlist, risk analysis
    coveredCallRecs: boolean; // default true — recent Covered Call Scanner recommendations
    jobs: boolean;           // default true — LLM tools list_jobs, trigger_portfolio_scan (schedules, run scan)
  };
  context: {
    riskProfile?: "low" | "medium" | "high" | "aggressive";  // default "medium"
    strategyGoals?: string;   // max 2000 chars
    systemPromptOverride?: string;  // max 4000 chars
    persona?: string;        // default "finance-expert" — finance-expert | medical-expert | legal-expert | tax-expert | trusted-advisor
  };
}
```

## Chat History

- **Where to find it**: Visit the [Chat](/chat) page — your last conversation restores automatically when you open it.
- **Persistence**: Each exchange (user message + assistant response) is saved to MongoDB `chatHistory` collection, keyed by user ID.
- **Resume**: On load, the chat page fetches `GET /api/chat/history` and restores the last conversation.
- **Multi-turn context**: When sending a message, the client passes the last 10 messages as `history`. The API prepends this to the user content so Grok has conversation context.
- **Limit**: History is trimmed to the last 50 messages per user.

## Flow

1. User opens chat → `GET /api/chat/history` loads saved messages
2. User sends message → `POST /api/chat` with `{ message, history }`
3. Rate limit check (20 req/min per client)
4. Load `getGrokChatConfig()`
5. Intent detection → run enabled pre-fetch tools (portfolio, market news, stock prices, covered call recommendations when applicable)
6. Build system prompt (default or override + risk + goals + tools hint)
7. Build user content: `{history}\n[Context from tools]\n{context}\n\n[User question]\n{message}` (history = last 10 messages when provided)
8. Call `callGrokWithTools(systemPrompt, userContent, { tools: webSearch ? [WEB_SEARCH_TOOL] : [] })`
9. Grok may call `web_search`; executor runs SerpAPI and appends results to messages
10. Save user message + response to chat history (when user is authenticated)
11. Return `{ response, toolResults? }`

## Fallback

If Grok returns empty, hits tool loop limit, or throws: `buildFallbackResponse()` returns formatted tool context plus disclaimer, or a generic “try asking about…” message.

## Tool Keywords Reference

Use these keywords in your message to trigger pre-fetch tools or help Grok choose LLM tools:

| Tool | Keywords |
|------|----------|
| **Market News** | market, news, outlook, trending, sentiment, conditions, indices |
| **Stock Prices** | price, quote, stock, option, trading, how much, current, value — or mention a ticker (e.g. TSLA) |
| **Portfolio & Watchlist** | portfolio, holdings, positions, account, balance, watchlist, watching, tracking |
| **Risk Analysis** | risk, var, beta, sharpe, diversification, volatility, stress, analyze portfolio |
| **Covered Call Recommendations** | covered call, my calls, scanner, recommendations, btc, roll, assign, expiration, should I btc/roll/close |
| **Schedule Jobs (list)** | jobs, schedules, automation, scanners, next run, when does X run |
| **Schedule Jobs (run scan)** | run scan, evaluate positions now, check my options, run options scanner |

## Example Prompts

- *What's the price of TSLA?* — Stock price
- *What's the market outlook?* — Market news
- *Show my portfolio* — Portfolio + watchlist
- *What am I watching?* — Watchlist
- *Market news and sentiment* — Market news
- *How is my watchlist doing?* — Portfolio + watchlist with live prices
- *Should I BTC my TSLA call?* / *Covered call recommendations?* / *Any roll suggestions?* — Triggers Covered Call Recommendations (last 20 from scanner). Combine with “TSLA” for stock + options context. Grok uses pre-injected prices and advises BTC when strike neared (per core.mdc).
- *What’s my portfolio risk?* — Risk analysis (VaR, beta, diversification, Grok recommendations).
- *What jobs are scheduled?* / *When does the options scanner run?* — Grok can use list_jobs (when tools.jobs is on).
- *Run scan now* / *Evaluate my options positions* — Grok can use trigger_portfolio_scan to run the full scan immediately.
- *TSLA earnings date* / *Tesla FSD news* — Grok can use web_search when context doesn’t include it.

## Environment

- `XAI_API_KEY` — required for Grok
- `WEB_SEARCH_API_KEY` or `SERPAPI_API_KEY` — optional, for web search tool
