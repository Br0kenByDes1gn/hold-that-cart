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

  test("clears the current list in place after confirmation", async ({ page }) => {
    await useDevice(page);
    await page.goto("/quick-view");

    const input = page.getByLabel("Add an item");
    await input.fill("Milk");
    await input.press("Enter");
    await expect(
      page.getByRole("button", { name: "Milk", exact: true }),
    ).toBeVisible();

    await input.fill("Eggs");
    await input.press("Enter");
    await expect(page.locator(".grocery-card")).toHaveCount(2);

    await page.getByRole("button", { name: "Clear list" }).click();
    await expect(
      page.getByRole("heading", { name: "Clear this list?" }),
    ).toBeVisible();
    await expect(
      page.getByText("Removes every item from this list.", { exact: false }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText("Your grocery list is empty.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear list" })).toHaveCount(0);

    // Same list, cleared in place — survives a reload.
    await page.reload();
    await expect(
      page.getByText("Your grocery list is empty.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByText("Nothing on the list yet")).toBeVisible();
  });

  test("groups identical camera products into one line with quantity", async ({ page }) => {
    await useDevice(page);
    await page.route("**/api/ai/extract", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "product",
          items: [
            { rawName: "Heineken 330ml", normalizedName: "beer", brand: "Heineken", qty: 1, confidence: 0.9 },
            { rawName: "Heineken 330ml", normalizedName: "beer", brand: "Heineken", qty: 1, confidence: 0.9 },
            { rawName: "Heineken 330ml", normalizedName: "beer", brand: "Heineken", qty: 1, confidence: 0.9 },
            { rawName: "Heineken 330ml", normalizedName: "beer", brand: "Heineken", qty: 1, confidence: 0.9 },
          ],
        }),
      }),
    );

    await page.goto("/quick-view");
    await page.getByLabel("Add by photo").click();
    await expect(page.getByText("Take a product photo")).toBeVisible();

    await page
      .locator('input[type="file"]')
      .setInputFiles("tests/fixtures/receipts/marketfresh.jpeg");

    await expect(page.getByLabel("Detected item 1 name")).toHaveValue("Beer");
    await expect(page.getByLabel("Detected item 1 brand")).toHaveValue("Heineken");
    await expect(page.getByText("Qty 4")).toBeVisible();

    await page.getByRole("button", { name: "Add 1 item" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Beer", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".grocery-item-brand", { hasText: "Heineken" }),
    ).toBeVisible();
    await expect(page.getByText("Qty 4")).toBeVisible();
  });

  test("auto-adds due pantry items and undoes the batch", async ({ page }) => {
    await useDevice(page, true);
    await page.goto("/quick-view");

    const strip = page.locator(".grocery-auto");
    await expect(strip).toBeVisible();
    await expect(strip).toContainText("added from your pantry");
    await expect(strip).toContainText("Refreshes every 3 days");

    // Due items arrive under their normalized generic names.
    await expect(page.getByRole("button", { name: "milk", exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "olive oil", exact: true }),
    ).toBeVisible();

    await strip.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".grocery-auto")).toHaveCount(0);
    await expect(
      page.getByText("Your grocery list is empty.", { exact: false }),
    ).toBeVisible();
  });

  test("reviews model-split voice items with pantry matches and brand", async ({ page }) => {
    await useDevice(page, true);
    await page.route("**/api/ai/parse-list", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "model",
          items: [
            {
              name: "Milk",
              brand: null,
              qty: 1,
              confidence: 0.7,
              match: {
                productId: null,
                productName: "Milk",
                confidence: 1,
                inPantry: true,
              },
            },
            {
              name: "Olive oil",
              brand: "Borges",
              qty: 1,
              confidence: 0.7,
              match: {
                productId: null,
                productName: "Olive oil",
                confidence: 1,
                inPantry: true,
              },
            },
          ],
        }),
      }),
    );

    await page.goto("/quick-view");
    await page.getByLabel("Add by voice").click();
    await page
      .getByLabel("Your items")
      .fill("milk and Borges olive oil");
    await page.getByRole("button", { name: "Split items" }).click();

    await expect(page.getByLabel("Item 1 name")).toHaveValue("Milk");
    await expect(page.getByText("In pantry: Milk", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Item 2 brand")).toHaveValue("Borges");
    await expect(page.getByText("In pantry: Olive oil", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Add 2 items" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Olive oil", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".grocery-item-brand", { hasText: "Borges" })).toBeVisible();
  });
});
