import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "tests-e2e/**"],
    // Pantry classification is model-backed. Keep tests deterministic and
    // avoid spending Meta credits by exercising the fallback path instead.
    env: { PANTRY_CLASSIFY: "off" },
  },
});
