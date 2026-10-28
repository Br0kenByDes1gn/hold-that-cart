import { describe, expect, it } from "vitest";
import app from "../src/server/index";

describe("health", () => {
  it("GET /api/health returns ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
