import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./tests-e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["iPhone 13"],
    // iPhone 13 device descriptor defaults to WebKit; Chromium keeps one engine.
    browserName: "chromium",
  },
  webServer: {
    command: `pnpm build && PORT=${PORT} PGLITE_DIR=.data/e2e node dist-server/index.js`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
