import { expect, test } from "@playwright/test";
import { useDevice } from "./helpers";

test.describe("optional signup (no gating)", () => {
  test("fresh visitor can open Pantry without logging in", async ({ page }) => {
    await useDevice(page);
    await page.goto("/");
    await page.getByLabel("Pantry").click();
    await expect(page).toHaveURL(/\/pantry$/);
    await expect(page.locator(".pantry-title")).toHaveText("Pantry");
  });

  test("signup validation shows inline errors and does not navigate", async ({ page }) => {
    await useDevice(page);
    await page.goto("/signup");
    await page.getByTestId("signup-email").fill("not-an-email");
    await page.getByTestId("signup-password").fill("123");
    await page.getByTestId("signup-verify").fill("different");
    await page.getByTestId("signup-submit").click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Password must be at least 6 characters.")).toBeVisible();
    await expect(page.getByText("Passwords do not match.")).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("signup attaches to the SAME anonymous household (device id unchanged)", async ({ page }) => {
    const deviceId = await useDevice(page);
    await page.goto("/signup");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("htc-device-id")))
      .toBe(deviceId);

    await page.getByTestId("signup-email").fill("user@example.com");
    await page.getByTestId("signup-password").fill("secret1");
    await page.getByTestId("signup-verify").fill("secret1");
    await page.getByTestId("signup-submit").click();

    await expect(page.getByText("Account created! Redirecting…")).toBeVisible();
    await expect(page).toHaveURL(/\/mode$/, { timeout: 5_000 });
    const after = await page.evaluate(() => ({
      device: localStorage.getItem("htc-device-id"),
      auth: localStorage.getItem("htc-auth"),
    }));
    expect(after.device).toBe(deviceId);
    expect(after.auth).toBe("1");
  });

  test("login happy path and signup/login cross-links", async ({ page }) => {
    await useDevice(page);
    await page.goto("/signup");
    await page.getByRole("link", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByTestId("login-email").fill("user@example.com");
    await page.getByTestId("login-password").fill("secret1");
    await page.getByTestId("login-submit").click();
    await expect(page.getByText("Welcome back! Redirecting…")).toBeVisible();
    await expect(page).toHaveURL(/\/mode$/, { timeout: 5_000 });

    await page.goto("/login");
    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/signup$/);
  });
});
