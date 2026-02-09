---
name: test-ui
version: "1.0.0"
description: Run and extend Playwright e2e UI tests to validate pages and flows. Use when validating the app in the browser, adding or fixing e2e tests, or when the user asks to test the UI, run Playwright, or validate pages.
---

# Test UI (Playwright E2E)

Run and maintain end-to-end UI tests with Playwright. Validates that each page loads and key flows work.

## Quick: Run All E2E Tests

```bash
pnpm test:e2e
```

Playwright starts the dev server (with `SKIP_AUTH=true`) if needed and runs all specs in `tests/`. For interactive UI:

```bash
pnpm test:e2e:ui
```

## Project Layout

- **Tests:** `tests/*.spec.ts` (e.g. `tests/smoke.spec.ts`)
- **Config:** `playwright.config.ts` — baseURL `http://localhost:3000`, webServer runs `npm run dev` with `SKIP_AUTH: "true"`, reuseExistingServer: true
- **Scripts:** `package.json` — `test:e2e` (run tests), `test:e2e:ui` (Playwright UI mode)

## What’s Covered (Smoke)

- Home, Dashboard, Watchlist, Holdings, xStrategyBuilder, Automation, Job Types, Smart Grok (Chat)
- Navigation links and top-nav page content
- Automation tabs: Alert Settings, Strategy, Scheduled Jobs
- Alerts page: heading, account filter, Clear All
- xStrategyBuilder: wizard steps, symbol search (e.g. TSLA), Covered Call flow to Review order
- Watchlist: Export/Delete when a list is selected
- Chat: config panel (Tools, Web Search, Risk profile)

## Writing and Fixing Tests

1. **Selectors:** Prefer `getByRole`, `getByPlaceholder`, `getByText`, or `data-testid`. Avoid brittle CSS or XPath.
2. **Structure:** Group with `test.describe()`; use `test()` for each scenario. Setup → act → assert.
3. **Async:** Use `await expect(...).toBeVisible({ timeout: 5000 })` or `page.waitForResponse()` where needed. Avoid raw `waitForTimeout` except when necessary.
4. **Auth:** E2E runs with `SKIP_AUTH=true` via webServer env. If running against an already-running dev server, start it with `SKIP_AUTH=true` or tests may hit login redirects and fail.
5. **Failure:** Use `pnpm test:e2e:ui` to run one test and inspect; or `pnpm exec playwright test --debug` for step-through. Screenshots and traces are on first retry (see config).

## Adding a New Page Test

1. Open `tests/smoke.spec.ts` (or add `tests/<feature>.spec.ts`).
2. Add a `test("description", async ({ page }) => { ... })`:
   - `await page.goto("/your-path");`
   - Assert title or heading: `await expect(page).toHaveTitle(/.../);` or `await expect(page.getByRole("heading", { name: /.../ })).toBeVisible();`
3. Run `pnpm test:e2e` and fix any failures.

## When Tests Fail

- **Redirect to /contact or login:** Dev server likely running without SKIP_AUTH. Stop it and run `pnpm test:e2e` so Playwright starts the server with SKIP_AUTH, or start dev with `SKIP_AUTH=true npm run dev`.
- **Element not found / timeout:** Selector or copy may have changed; align with current UI (roles, text, testids). Increase timeout only if the app is slow.
- **Flake:** Prefer waiting for a specific response or visible state instead of fixed sleeps.

## CI

Playwright runs in CI (e.g. GitHub Actions) with `reporter: "github"`, `retries: 2`, `workers: 1`. Ensure the CI job starts the app with SKIP_AUTH (or equivalent) so e2e tests don’t hit auth.
