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

    await page.getByRole("link", { name: /Rice/ }).first().click();
    await expect(page).toHaveURL(/\/pantry\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "Rice" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Variants you've bought" })).toBeVisible();
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
