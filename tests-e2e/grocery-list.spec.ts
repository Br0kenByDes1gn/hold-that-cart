import { expect, test } from "@playwright/test";
import { useDevice } from "./helpers";

test.describe("grocery list editing", () => {
  test("adds, renames, checks and removes a typed item", async ({ page }) => {
    await useDevice(page);
    await page.goto("/quick-view");

    await expect(
      page.getByText("Your grocery list is empty.", { exact: false }),
    ).toBeVisible();

    const input = page.getByLabel("Add an item");
    await input.fill("Milk");
    await input.press("Enter");

    await expect(page.getByRole("button", { name: "Milk", exact: true })).toBeVisible();

    await page.getByLabel("One more Milk").click();
    await expect(page.getByText("Qty 2")).toBeVisible();

    await page.getByRole("button", { name: "Milk", exact: true }).click();
    const rename = page.getByLabel("Item name");
    await rename.fill("Oat milk");
    await rename.press("Enter");
    await expect(page.getByRole("button", { name: "Oat milk", exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "Oat milk", exact: true })).toBeVisible();
    await expect(page.getByText("Qty 2")).toBeVisible();

    await page.getByLabel("Mark Oat milk as bought").click();
    await expect(page.getByLabel("Mark Oat milk as not bought")).toBeVisible();

    await page.getByLabel("Remove Oat milk from the list").click();
    await expect(
      page.getByText("Your grocery list is empty.", { exact: false }),
    ).toBeVisible();
  });

  test("accepts pantry suggestions with the preview label", async ({ page }) => {
    await useDevice(page, true);
    await page.goto("/quick-view");

    const strip = page.locator(".grocery-suggest");
    await expect(strip).toBeVisible();
    await expect(strip).toContainText("from your pantry");
    await expect(strip).toContainText("Preview");

    await strip.click();
    await expect(page.getByRole("heading", { name: "From your pantry" })).toBeVisible();
    await expect(page.getByText("Temporary rhythm-based suggestions")).toBeVisible();

    await page.getByRole("button", { name: /^Add \d+ item/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".grocery-card").first()).toBeVisible();
  });
});
