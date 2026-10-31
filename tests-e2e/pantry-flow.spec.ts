import { expect, test } from "@playwright/test";
import { useDevice } from "./helpers";

test.describe("seeded pantry flow", () => {
  test("briefing shows Hold That Cart banner and BUY/SKIP/SWAP groups", async ({ page }) => {
    await useDevice(page, true);
    await page.goto("/briefing");
    await expect(page.getByText(/Hold That Cart! You already have/)).toBeVisible();
    await expect(page.getByRole("heading", { name: /BUY/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /SKIP/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /SWAP/ })).toBeVisible();
    await expect(page.getByText("Milk").first()).toBeVisible();
    await expect(page.getByText("Rice").first()).toBeVisible();
  });

  test("pantry sections render from API and card opens product detail", async ({ page }) => {
    await useDevice(page, true);
    await page.goto("/pantry");
    await expect(page.getByRole("heading", { name: "Buy" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Skip" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Swap" })).toBeVisible();

    const firstArt = page.locator(".pantry-card-art img").first();
    await expect(firstArt).toBeVisible();
    await expect
      .poll(() => firstArt.evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);

    await page.waitForTimeout(1000);
    await page.locator(".pantry-card").first().click();
    await expect(page).toHaveURL(/\/pantry\/[0-9a-f-]+$/);
    await expect(page.locator("h2").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Variants you've bought" })).toBeVisible();
  });

  test("pantry fits one viewport and See more opens the full section", async ({ page }) => {
    await useDevice(page, true);
    await page.goto("/pantry");
    await page.waitForSelector(".pantry-card");
    await page.waitForTimeout(800);

    const fitsViewport = await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight + 1,
    );
    expect(fitsViewport).toBe(true);

    const seeMore = page.getByRole("link", { name: /See more/ }).first();
    await expect(seeMore).toBeVisible();
    const href = await seeMore.getAttribute("href");
    expect(href).toMatch(/^\/pantry\/section\/(buy|skip|swap)$/);

    await seeMore.click();
    await expect(page).toHaveURL(/\/pantry\/section\/(buy|skip|swap)$/);
    await expect(page.locator(".pantry-card").first()).toBeVisible();
  });

  test("scanner demo receipt: correct and confirm lands in pantry", async ({ page }) => {
    await useDevice(page, true);
    await page.goto("/scanner");
    await page.getByRole("button", { name: /Use demo receipt/ }).click();
    await expect(page.getByText(/Detected \(receipt\)/)).toBeVisible();
    await expect(page.locator("input[value='Milk 1L']")).toBeVisible();
    await page.getByRole("button", { name: /Confirm/ }).click();
    await expect(page).toHaveURL(/\/pantry$/, { timeout: 10_000 });
    await expect(page.locator(".pantry-title")).toHaveText("Pantry");
  });
});
