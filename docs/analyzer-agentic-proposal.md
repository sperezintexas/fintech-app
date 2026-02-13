# Proposal: Agentic / Multi-Step Reasoning for Analyzers

## Current State

- **Unified Options Scanner**: Runs four scanners in parallel (option, covered call, protective put, straddle/strangle). Each scanner:
  1. Rule-based stage (metrics, thresholds) → list of recommendations/candidates
  2. Optional **one-shot Grok** per “candidate” (filtered by P/L, DTE, IV, etc.) with a single prompt → `{ recommendation, confidence, explanation }`
- **Risk Scanner**: Compute VaR, beta, volatility, etc. → **one** `analyzeRiskWithGrok` call with full context → structured risk level + explanation + recommendations.
- **Watchlist / ad-hoc**: Same pattern — rules first, then optional single Grok call per item.

So today: **rules → optional single LLM call per item**, no iterative reasoning, no tool use inside analyzers (chat already has `callGrokWithTools` + web search).

---

## Goals for Agentic Flow

- **Multi-step reasoning**: Explicit steps (e.g. “consider DTE → consider P/L → consider IV → synthesize”) instead of one black-box answer.
- **Tool use where useful**: Fetch news, IV history, or extra market data when the model decides it’s needed.
- **Auditability**: Expose “reasoning trace” (steps + tool calls) for compliance and debugging.
- **Optional cross-position synthesis**: E.g. “Given all covered calls, which one should we act on first?” without rebuilding the whole stack.

---

## Option A: Lightweight — Staged Chain-of-Thought (Fastest Win)

Keep the same pipeline (rules → filter candidates → LLM), but replace the **single** Grok call with **two** calls (or one structured prompt that forces steps):

1. **Step 1 — Reason**:
   “For this position, list 3–5 key factors (DTE, P/L, IV, assignment risk, etc.) and one main uncertainty. Output JSON: `{ factors: string[], mainUncertainty: string }`.”
2. **Step 2 — Decide**:
   “Given these factors and uncertainty: [from step 1], give your recommendation (HOLD | BUY_TO_CLOSE), confidence 0–1, and a short explanation.”
   Optionally pass step 1 output as structured context so the model doesn’t “forget.”

**Pros**: Small code change (new helper in `xai-grok.ts`, analyzers pass “staged: true” or use new function). Better reasoning and audit trail (factors + uncertainty in DB/logs).
**Cons**: 2x LLM calls per candidate (cost/latency); no new tools.

**Implementation sketch**:
- Add `callOptionDecisionStaged(context)` in `xai-grok.ts` that returns `{ factors, mainUncertainty, recommendation, confidence, explanation }` (either 2 API calls or 1 prompt with “first output JSON for factors, then output JSON for decision” and parse both).
- In `option-scanner.ts` / `covered-call-analyzer.ts`, when `config.grokStagedReasoning === true`, call the staged helper and store `factors` / `mainUncertainty` on the recommendation or in a new `reasoningTrace` field.

---

## Option B: Analyzer Agent with Tools (Medium Effort)

Turn “one Grok call per candidate” into a **per-candidate agent loop** (ReAct-style):

1. **System prompt**: “You are an options analyst. For the given position and market data, you may call tools to gather more information, then recommend HOLD or BUY_TO_CLOSE. Reason step by step.”
2. **Tools**: e.g. `get_news(symbol)`, `get_iv_history(symbol, days)`, `get_earnings_date(symbol)` (if you have or can add these).
3. **Loop**: Model outputs `thought` + `action` → execute tool → append `observation` → repeat until model outputs `final_answer` with recommendation and explanation.
4. **Output**: Same shape as today (recommendation, confidence, explanation) plus a `reasoningSteps: { thought, action, observation }[]` for audit.

**Pros**: Model can pull in news or IV when it deems necessary; reasoning is explicit and auditable.
**Cons**: More latency and tokens per candidate; need to define and implement tools; need a small agent loop (similar to `callGrokWithTools` but with “reasoning + tool” schema).

**Implementation sketch**:
- Reuse/extend the tool-calling loop from `callGrokWithTools` in `xai-grok.ts`.
- Define tools: `get_news`, `get_iv_history` (and optionally `compute_assignment_probability` if you want to keep it deterministic). Implement them in a new `analyzer-tools.ts` (or existing yahoo/news modules).
- New function `callOptionDecisionWithTools(context, tools)` that runs until the model returns a final recommendation (e.g. via a “final_answer” tool or a special content block). Persist `reasoningSteps` on the recommendation or in a separate collection for audit.

---

## Option C: Unified Portfolio Analyst Agent (Largest Change)

Introduce a **single** agent that orchestrates the whole run:

1. **Input**: Account id (or “all”), high-level goal (e.g. “weekly options review” or “find covered calls to close”).
2. **Tools**: `get_holdings`, `get_option_chain(symbol)`, `get_covered_call_positions`, `run_rule_scan(scannerName)`, `get_news(symbol)`, `get_risk_metrics`, and optionally `run_grok_on_position(positionId)` for sub-calls.
3. **Flow**: Agent plans (“I’ll get holdings → run covered call rules → for borderline cases I’ll fetch news and re-evaluate”), executes tools, reasons over results, may iterate (e.g. “run risk scanner next”), then produces a **summary** (prioritized list of actions + brief rationale) and optionally per-position recommendations.
4. **Output**: Same alerts/recommendations as today (written via existing store functions) plus a “run report” (what the agent did and why).

**Pros**: Cross-position and cross-scanner reasoning; can prioritize “which one to act on first”; one place to add new tools or data sources.
**Cons**: Significant refactor; need to map agent “actions” back into existing `reportJobs` / alerts; cost and latency can be high if the agent makes many steps.

**Implementation sketch**:
- New module `portfolio-analyst-agent.ts`: system prompt + tool definitions; loop: chat completion with tools → execute tools (call existing getters and scanners) → append results → repeat until “submit_report” or max steps.
- Tools wrap: `getDb()`, `getCoveredCallPositions`, `analyzeCoveredCalls`, `getMultipleTickerPrices`, `runRiskScanner`, etc. Return concise, token-safe summaries to the model.
- Scheduler: New job type “portfolioAnalyst” or extend “unifiedOptionsScanner” to optionally run this agent instead of (or after) the fixed pipeline; agent’s final step calls existing `storeCoveredCallRecommendations` etc. so alerts and UI stay the same.

---

## Recommended Path

- **Short term**: **Option A (Staged CoT)**. Low risk, clear improvement in reasoning quality and auditability, minimal change to unified scanner or risk scanner.
- **Next**: **Option B** for one scanner (e.g. covered call) as a pilot: add `get_news` and optionally `get_iv_history`, run the agent loop only when `config.analyzerAgent === true`, and compare outcomes vs. current one-shot Grok.
- **Later**: If you want cross-position prioritization and a single “weekly review” narrative, invest in **Option C** and optionally run it after the existing unified scanner (agent summarizes and optionally adds a “priority order” or run report).

---

## Summary Table

| Option | Effort | Latency/cost | New capabilities | Audit |
|--------|--------|--------------|------------------|--------|
| A — Staged CoT | Low | +1 call per candidate | Explicit factors + uncertainty | factors + decision in output |
| B — Analyzer tools | Medium | +N tool rounds per candidate | News, IV history on demand | Full step trace |
| C — Portfolio agent | High | Variable (many steps) | Cross-position, prioritization, single narrative | Full plan + tool trace |

If you tell me which option you want to implement first (A, B, or C), I can outline concrete code changes (files + function signatures) next.
