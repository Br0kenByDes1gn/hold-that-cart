import { expect, test } from "@playwright/test";
import { useDevice } from "./helpers";

test.describe("app shell", () => {
  test("entry lands on Mode with the three cards, no dev menu in prod", async ({ page }) => {
    await useDevice(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Shopping Mode" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pantry Mode" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Grocery List" })).toBeVisible();
    await expect(page.locator(".devmenu")).toHaveCount(0);
  });

  test("tab navigation reaches Scanner, Pantry and Analyse stub", async ({ page }) => {
    await useDevice(page);
    await page.goto("/");

    await page.getByLabel("Scanner").click();
    await expect(page).toHaveURL(/\/scanner$/);
    await expect(page.getByText("Cart Radar")).toBeVisible();

    await page.getByLabel("Pantry").click();
    await expect(page).toHaveURL(/\/pantry$/);
    await expect(page.locator(".pantry-title")).toHaveText("Pantry");

    await page.getByLabel("Analyse").click();
    await expect(page).toHaveURL(/\/analyse$/);
    await expect(page.getByText("No insights yet")).toBeVisible();
  });
});
