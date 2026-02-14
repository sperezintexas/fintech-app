# Smart Grok Chat

AI chat for investment advice and general expertise, powered by xAI Grok. Combines configurable tools (web search, market data, portfolio, covered call recommendations, schedule tasks) with selectable personas and optional system-prompt override. Aligns with `.cursor/rules/grokchat/` (core, api-config, monitor-position).

## Overview

- **Page**: `/chat` — Smart Grok Chat
- **API**: `POST /api/chat` — chat with conversation history, persona, and optional order context
- **History**: `GET /api/chat/history?persona=` — load saved messages per user and persona
- **Config**: `GET /api/chat/config`, `PUT /api/chat/config` — tools, context, persona, model
- **Storage**: Config in MongoDB `appUtil` collection (`key: grokChatConfig`); chat history in `chatHistory` collection (keyed by `userId` + `persona`)

## Chat UI (current)

- **Layout**: Gray page background (`bg-gray-50`), `AppHeader`, main content `max-w-4xl` with a single card: white, rounded-2xl, shadow, border. Card height `calc(100vh-12rem)` (min 400px). Title above card: “Smart Grok Chat” (h2), subtitle: “Ask about stocks, market outlook, portfolio, or investment strategies. Powered by yahooFinance data and xAI {model}.” (model from config, e.g. grok-4).

- **Card header**: “Chat” label and a **gear icon** button that toggles the config panel.

- **Config panel** (collapsible, below header):
  - **Tools**: Checkboxes — Web Search, Market Data, Portfolio, Covered Call Recs. (Schedule tools “jobs” are backend-only, default on; no UI toggle.)
  - **Grok Context**: Risk profile (Low / Medium / High / Aggressive), Strategy goals (text), and **Advanced**: “System prompt override” (textarea, optional).
  - **Save config** button.

- **Empty state** (no messages): “Smart Grok Chat” + short blurb + “Powered by xAI {model}”. A “Try:” list (e.g. What’s the price of TSLA?, market outlook, Show my portfolio, watchlist, market news, scheduled tasks, Run scan now). Link to `/chat`. A collapsible **“Tool keywords — what triggers data”** with the same keyword list as in the Tool Keywords Reference below.

- **Messages**: User messages on the right (blue bubble); assistant on the left (gray bubble). Assistant content is lightly formatted (bold lines, list items). Auto-scroll to bottom on new messages.

- **Loading**: Three bouncing dots in a gray bubble while waiting for Grok.

- **Errors**: Red banner with message if the request fails.

- **Persona** (above input): Dropdown — “Finance Expert (default)”, “Medical Expert”, “Legal Expert”, “Tax Expert”, “Trusted Advisor”, any custom personas from config, and “Custom only (override in config)”. Changing persona reloads history for that persona.

- **Input row**: Text input (placeholder: “Smart Grok Chat — Ask about anything but focus on stocks, market outlook, portfolio, or investment strategies. Powered by xAI {model}”, max length 2000), **Send** button, **Stats** button. Stats toggles a panel showing last response’s model and token usage (prompt, completion, total).

- **Example prompts**: Collapsible “▶ Example prompts” below the input. Content is **per persona**: groups like “News & research”, “Quotes & market”, “Portfolio”, “Watchlist”, “Covered calls & options”, “Tasks & scan” for finance-expert; different groups for medical/legal/tax/trusted-advisor. Each group has clickable chips that **fill the input** (user can edit before sending).

- **Deep link from xStrategyBuilder**: The chat page accepts query params `symbol`, `strike`, `expiration`, `credit`, `quantity`, `probOtm`. When present, the page passes `initialMessage` and `initialOrderContext` into `ChatInterface` so the user lands with a pre-filled prompt (e.g. find covered call alternatives) and Grok can use the `covered_call_alternatives` tool with that order.

## Tools

### 1. LLM tool: Web Search

Defined in `src/lib/xai-grok.ts` as `WEB_SEARCH_TOOL` (OpenAI-compatible function tool):

- **name**: `web_search`
- **description**: Search the web for current information (weather, news, earnings, analyst views). Use when not in provided context.
- **parameters**: `query` (string), `num_results?` (number)

Enabled when `tools.webSearch` is true. Executor uses SerpAPI (`WEB_SEARCH_API_KEY` or `SERPAPI_API_KEY`). Grok may call it during the completion loop (up to 3 rounds).

### 2. LLM tools: Schedule (jobs)

When `tools.jobs` is true (default; not exposed in chat config UI):

| Tool | Description |
|------|-------------|
| **list_tasks** | List scheduled tasks (Unified Options Scanner, Watchlist, etc.), cron schedules, status, next run |
| **trigger_portfolio_scan** | Run full portfolio options evaluation now (Unified Options Scanner + watchlist + deliver alerts) |

Keywords that help: tasks, schedules, automation, scanners, next run, run scan, evaluate positions now, check my options.

### 3. LLM tool: Covered Call Alternatives

When `tools.coveredCallRecs` is true and either the user message matches covered-call keywords or the request includes `orderContext` (e.g. from xStrategyBuilder deep link), Grok receives `COVERED_CALL_ALTERNATIVES_TOOL`. It can suggest alternatives (e.g. higher prob OTM, higher premium) using the order context (symbol, strike, expiration, credit, quantity, probOtm).

### 4. Server-side pre-fetch tools (context injection)

Run before the Grok call. Results are formatted by `buildToolContext()` and prepended to the user message as `[Context from tools - REAL-TIME DATA - USE THIS FOR PRICES]`.

| Tool | Config key | Trigger (regex/keywords) | Data source |
|------|------------|---------------------------|-------------|
| Market news | `tools.marketData` | market, news, outlook, trending, sentiment, conditions, indices | Yahoo `getMarketNewsAndOutlook()` |
| Stock prices | `tools.marketData` | price, quote, stock, option, trading, how much, current, value, or 2–5 letter tickers | Yahoo `getStockAndOptionPrices()` / batch |
| Portfolio & watchlist | `tools.portfolio` | portfolio, holdings, positions, account, balance, watchlist, watching, tracking | MongoDB accounts + watchlists + Yahoo prices |
| Risk analysis | `tools.portfolio` | risk, var, beta, sharpe, diversification, volatility, stress, analyze portfolio | `computeRiskMetricsWithPositions` + Grok `analyzeRiskWithGrok()` |
| Covered call recs | `tools.coveredCallRecs` | covered call, my calls, scanner, recommendations, btc, roll, assign, expiration, “should I btc/roll/close”, “alternatives”, “higher premium” | MongoDB `coveredCallRecommendations` (last 20 via `getRecentCoveredCallRecommendations`) |

- Portfolio and watchlist are fetched together when `tools.portfolio` is enabled and message matches; injected as `## Portfolio` and `## Watchlist` in context.
- Stock prices include options chain when the message contains option/call/put/chain. Tickers matched case-insensitively.
- When the request includes `orderContext`, it is injected as “xStrategyBuilder Order” so Grok can use it with `covered_call_alternatives`.

## Personas and system prompt

- **Personas** (from `src/lib/chat-personas.ts`): `finance-expert`, `medical-expert`, `legal-expert`, `tax-expert`, `trusted-advisor`. Each has a default system-prompt string. Custom persona keys can be stored in config and get prompt text from `personaPrompts` in DB (or fall back to code).
- **Effective prompt**: `getEffectivePersonaPrompt(config, persona)` merges DB override with code default. If `context.systemPromptOverride` is non-empty (max 4000 chars), it **replaces** the base prompt.
- **Context append**: Risk profile, strategy goals, “use real-time context for prices”, “include brief disclaimer” are appended when applicable. Model is `XAI_MODEL` (env `XAI_MODEL` or `grok-4`).

## Config schema

- **tools**: `webSearch`, `marketData`, `portfolio`, `coveredCallRecs` (all boolean; `jobs` is boolean in backend, default true, no UI toggle).
- **context**: `riskProfile` (low | medium | high | aggressive), `strategyGoals` (string, max 2000), `systemPromptOverride` (string, max 4000), `persona` (string, e.g. finance-expert).
- **personaPrompts**: Optional per-persona prompt overrides in DB (PUT accepts `personaPrompts`).

GET `/api/chat/config` also returns `model` (e.g. grok-4) and `personaPromptTexts` (effective prompts for UI).

## Chat history

- **Storage**: MongoDB `chatHistory` collection. Documents keyed by `userId` and `persona`. Each exchange (user + assistant) is appended; trimmed to last 50 messages per user/persona.
- **Load**: On opening the chat page, the client calls `GET /api/chat/history?persona={currentPersona}` and restores messages. Changing the persona dropdown refetches history for that persona.
- **Send**: Client sends last N messages as `history` in `POST /api/chat` (API uses last 10). Response is saved to history for the request’s persona.

## Request validation and rate limit

- **POST /api/chat** body is validated with Zod `chatPostBodySchema` (`src/lib/api-request-schemas.ts`): `message` (1–2000 chars), `history` (optional, max 50 items), `persona` (optional, max 200), `orderContext` (optional).
- **Rate limit**: 20 requests per 60 seconds per client (IP or x-forwarded-for). 429 with `Retry-After` when exceeded. Implemented in `src/lib/rate-limit.ts` (Upstash Redis if configured, else in-memory).

## Flow

1. User opens `/chat` (optionally with `?symbol=…&strike=…&expiration=…&credit=…&quantity=…&probOtm=…` for xStrategyBuilder).
2. Page renders `ChatInterface` with `initialMessage` and `initialOrderContext` when query params present.
3. Client fetches `GET /api/chat/config` (tools, context, model, personaPromptTexts) and `GET /api/chat/history?persona=…`.
4. User sends message → `POST /api/chat` with `{ message, history, persona?, orderContext? }`.
5. Server: auth check, rate limit, load `getGrokChatConfig()`, intent detection, run enabled pre-fetch tools, build system prompt (persona + override + risk + goals), build user content with `[Context from tools]` + history + message.
6. Assemble LLM tools: `web_search` (if tools.webSearch), `covered_call_alternatives` (if tools.coveredCallRecs and orderContext or covered-call keywords), `list_tasks` + `trigger_portfolio_scan` (if tools.jobs).
7. `callGrokWithTools(systemPrompt, userContent, { tools })`; Grok may call web_search or other tools; executor runs and appends results.
8. Save user + assistant to `appendChatHistory(userId, persona, …)`.
9. Return `{ response, toolResults?, usage?, model? }`. Client shows response and optionally stats.

## Fallback

If Grok returns empty, hits tool loop limit, or throws: `buildFallbackResponse(toolResults)` returns formatted tool context plus disclaimer, or a generic “try asking about…” message.

## Tool keywords reference

| Tool | Keywords |
|------|----------|
| Market news | market, news, outlook, trending, sentiment, conditions, indices |
| Stock prices | price, quote, stock, option, trading, how much, current, value — or ticker (e.g. TSLA) |
| Portfolio & watchlist | portfolio, holdings, positions, account, balance, watchlist, watching, tracking |
| Risk analysis | risk, var, beta, sharpe, diversification, volatility, stress, analyze portfolio |
| Covered call recs | covered call, my calls, scanner, recommendations, btc, roll, assign, expiration, should I btc/roll/close, alternatives, higher premium |
| Schedule (list) | tasks, schedules, automation, scanners, next run |
| Schedule (run) | run scan, evaluate positions now, check my options |

## Example prompts (by persona)

The “Example prompts” panel in the UI is populated from `getPersonaExamplePrompts(currentPersona)` in `src/lib/chat-personas.ts`. For **finance-expert** the groups are:

- **News & research**: TSLA news today, NVDA earnings date, Fed rate decision, Defense sector outlook, S&P 500 outlook this week
- **Quotes & market**: TSLA price, AAPL quote, Market outlook, VIX level, SPY and QQQ today
- **Portfolio**: Show my portfolio, My holdings, Account balance, Top movers today, Portfolio allocation
- **Watchlist**: My watchlist, What am I watching?, Watchlist performance, Add TSLA to watchlist
- **Covered calls & options**: Covered call ideas, Should I BTC my call?, Roll my TSLA call, CC recommendations, Wheel strategy on NVDA
- **Tasks & scan**: Scheduled tasks, Run scanner now, When does scanner run?, Options positions check, Covered call scan results

Other personas (medical, legal, tax, trusted-advisor) have different groups and prompts; see `PERSONA_EXAMPLE_PROMPTS` in `chat-personas.ts`.

## Environment

- `XAI_API_KEY` — required for Grok
- `XAI_MODEL` — optional; default `grok-4`
- `WEB_SEARCH_API_KEY` or `SERPAPI_API_KEY` — optional, for web search tool
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — optional, for chat rate limiting across instances
