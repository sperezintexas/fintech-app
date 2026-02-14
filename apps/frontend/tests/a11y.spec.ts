import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility (axe-core)", () => {
  test("home page has no critical a11y violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /myInvestments/i })).toBeVisible({ timeout: 15000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(["color-contrast"]) // allow design to tune contrast separately
      .analyze();

    expect(results.violations.filter((v) => v.impact === "critical")).toEqual([]);
  });

  test("holdings page has no critical a11y violations", async ({ page }) => {
    await page.goto("/holdings");
    await expect(page.getByRole("heading", { name: /Holdings/i })).toBeVisible({ timeout: 15000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(["color-contrast"])
      .analyze();

    expect(results.violations.filter((v) => v.impact === "critical")).toEqual([]);
  });
});
