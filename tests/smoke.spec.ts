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

    await page.getByRole("link", { name: /xStrategyBuilder/i }).click();
    await expect(page).toHaveURL(/\/xstrategybuilder/);

    await page.getByRole("link", { name: /Job Types/i }).click();
    await expect(page).toHaveURL(/\/job-types/);
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
});
