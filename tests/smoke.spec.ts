import { test, expect } from "@playwright/test";

test.describe("Smoke tests", () => {
  test("home page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/myInvestments/);
    await expect(page.getByRole("heading", { name: /myInvestments/i })).toBeVisible();
  });

  test("navigation links work", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Dashboard/i }).click();
    await expect(page).toHaveURL(/\//);

    await page.getByRole("link", { name: /Watchlist/i }).click();
    await expect(page).toHaveURL(/\/watchlist/);

    await page.getByRole("link", { name: /Holdings/i }).click();
    await expect(page).toHaveURL(/\/holdings/);

    await page.getByRole("link", { name: /xStrategyBuilder/i }).click();
    await expect(page).toHaveURL(/\/xstrategybuilder/);

    await page.getByRole("link", { name: /Automation/i }).click();
    await expect(page).toHaveURL(/\/automation/);

    await page.getByRole("link", { name: /Job Types/i }).click();
    await expect(page).toHaveURL(/\/job-types/);

    await page.getByRole("link", { name: /Smart Grok/i }).click();
    await expect(page).toHaveURL(/\/chat/);
  });

  test("all top-nav pages load with expected content", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /myInvestments/i })).toBeVisible();

    await page.getByRole("link", { name: /Watchlist/i }).click();
    await expect(page).toHaveURL(/\/watchlist/);
    await expect(page.getByText(/Watchlists|Select a watchlist|create one to get started/i).first()).toBeVisible();

    await page.getByRole("link", { name: /Holdings/i }).click();
    await expect(page).toHaveURL(/\/holdings/);
    await expect(page.getByRole("heading", { name: /Holdings/i })).toBeVisible();

    await page.getByRole("link", { name: /xStrategyBuilder/i }).click();
    await expect(page).toHaveURL(/\/xstrategybuilder/);
    await expect(page.getByRole("heading", { name: /xStrategyBuilder/i })).toBeVisible();

    await page.getByRole("link", { name: /Automation/i }).click();
    await expect(page).toHaveURL(/\/automation/);
    await expect(page.getByText(/Alerts|Alert Settings|Strategy|Scheduled Jobs/i).first()).toBeVisible();

    await page.getByRole("link", { name: /Job Types/i }).click();
    await expect(page).toHaveURL(/\/job-types/);
    await expect(page.getByRole("heading", { name: /Job Types/i })).toBeVisible();
  });

  test("Automation page loads and shows tabs", async ({ page }) => {
    await page.goto("/automation");
    await expect(page).toHaveTitle(/myInvestments/);
    await expect(page.getByText("Alert Settings").first()).toBeVisible();
    await expect(page.getByText("Strategy").first()).toBeVisible();
    await expect(page.getByText("Scheduled Jobs").first()).toBeVisible();
    await expect(page.getByText(/Setup|Manage Jobs|Manage job types/i).first()).toBeVisible();
  });

  test("Automation page: Alert Settings tab shows delivery channels", async ({ page }) => {
    await page.goto("/automation");
    await page.getByText("Alert Settings").first().click();
    await expect(page.getByText(/Slack|Twitter|Push|Delivery Channels/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("Automation page: Strategy tab shows strategy settings", async ({ page }) => {
    await page.goto("/automation");
    await page.getByRole("button", { name: "Strategy", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Strategy Settings" })).toBeVisible({ timeout: 5000 });
  });

  test("Automation page: Scheduled Jobs tab shows create job form", async ({ page }) => {
    await page.goto("/automation");
    await page.getByText("Scheduled Jobs").first().click();
    await expect(page.getByRole("heading", { name: "Manage Jobs" })).toBeVisible();
    await expect(page.getByText("Manage job types")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create Job" })).toBeVisible();
    await expect(page.getByPlaceholder(/e\.g\. Daily close report/i)).toBeVisible();
  });

  test("Alerts page loads", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByRole("heading", { name: /Alerts/i })).toBeVisible();
    await expect(page.getByText("View alerts from daily analysis")).toBeVisible();
  });

  test("Alerts page: account selector defaults to All accounts", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByRole("heading", { name: /Alerts/i })).toBeVisible();
    const accountSelect = page.getByRole("combobox", { name: /Filter by account/i });
    await expect(accountSelect).toBeVisible();
    await expect(accountSelect).toHaveValue("");
  });

  test("Alerts page: Clear All button is visible", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByRole("heading", { name: /Alerts/i })).toBeVisible();
    const clearBtn = page.getByRole("button", { name: /Clear All/i });
    await expect(clearBtn).toBeVisible();
  });

  test("Holdings page loads", async ({ page }) => {
    await page.goto("/holdings");
    await expect(page.getByRole("heading", { name: /Holdings/i })).toBeVisible();
  });

  test("xStrategyBuilder page loads and shows wizard", async ({ page }) => {
    await page.goto("/xstrategybuilder");
    await expect(page.getByRole("heading", { name: /xStrategyBuilder/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Step 1: Select a symbol/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Search symbol/i)).toBeVisible();
  });

  test("xStrategyBuilder: symbol search and Covered Call flow", async ({ page }) => {
    await page.goto("/xstrategybuilder");
    await page.getByPlaceholder(/Search symbol/i).fill("TSLA");
    await page.waitForTimeout(500);

    const tslaOption = page.getByRole("button", { name: /TSLA Tesla/i });
    await expect(tslaOption).toBeVisible({ timeout: 5000 });
    await tslaOption.click();

    await page.waitForTimeout(2000);

    const nextBtn = page.getByRole("button", { name: /^Next$/i });
    await expect(nextBtn).toBeEnabled({ timeout: 5000 });
    await nextBtn.click();

    await expect(page.getByRole("heading", { name: /Step 2: Market outlook/i })).toBeVisible();
    await page.getByRole("button", { name: /Bullish/i }).click();
    await nextBtn.click();

    await expect(page.getByRole("heading", { name: /Step 3: Choose strategy/i })).toBeVisible();
    await page.getByRole("button", { name: /Covered Call/i }).click();
    await nextBtn.click();

    await expect(page.getByRole("heading", { name: /Step 4: Choose contract/i })).toBeVisible();
    await page.waitForTimeout(3000);

    const reviewBtn = page.locator("main").getByRole("button", { name: /^Review order$/i }).nth(1);
    await expect(reviewBtn).toBeEnabled({ timeout: 10000 });
    await reviewBtn.click();

    await expect(page.getByRole("heading", { name: /Step 5: Review order/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Review: Covered Call/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Covered Call Scanner/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add to Watchlist/i })).toBeVisible();
  });

  test("Job Types page loads", async ({ page }) => {
    await page.goto("/job-types");
    await expect(page.getByRole("heading", { name: /Job Types/i })).toBeVisible();
  });

  test("Watchlist page loads", async ({ page }) => {
    await page.goto("/watchlist");
    await expect(page.getByText(/Watchlists|Select a watchlist|create one to get started/i).first()).toBeVisible();
  });

  test("Chat page loads and shows config", async ({ page }) => {
    await page.goto("/chat");
    await expect(page.getByRole("heading", { name: /Smart Grok Chat/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Ask about stocks/i)).toBeVisible();
    await page.getByTitle(/Configure tools and Grok context/i).click();
    await expect(page.getByText(/Tools/i)).toBeVisible();
    await expect(page.getByText(/Web Search/i)).toBeVisible();
    await expect(page.getByText(/Risk profile/i)).toBeVisible();
  });
});
