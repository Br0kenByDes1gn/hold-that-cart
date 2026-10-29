import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";

/**
 * Plant a deterministic device id before the app boots, then (optionally)
 * seed the demo household for that same device via the API.
 */
export async function useDevice(page: Page, seed = false): Promise<string> {
  const deviceId = `e2e-${randomUUID()}`;
  await page.addInitScript((id) => {
    localStorage.setItem("htc-device-id", id);
  }, deviceId);
  if (seed) {
    const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
    const headers = { "Content-Type": "application/json", "X-Device-Id": deviceId };
    const hh = await fetch(`${base}/api/households`, {
      method: "POST",
      headers,
      body: JSON.stringify({ deviceId }),
    });
    if (!hh.ok) throw new Error(`household create failed: ${hh.status}`);
    const s = await fetch(`${base}/api/demo/seed`, { method: "POST", headers });
    if (!s.ok) throw new Error(`demo seed failed: ${s.status}`);
  }
  return deviceId;
}
