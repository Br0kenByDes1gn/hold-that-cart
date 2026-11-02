import { getDeviceId } from "./lib/device";

async function req(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Device-Id": getDeviceId(),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ? JSON.stringify(body.error).slice(0, 300) : `${path}: ${res.status}`);
  return body;
}

export const api = {
  ensureHousehold: () =>
    req("/api/households", { method: "POST", body: JSON.stringify({ deviceId: getDeviceId() }) }),
  briefing: (limits?: { buy?: number; swap?: number; skip?: number }) => {
    const q = new URLSearchParams();
    if (limits?.buy) q.set("buy", String(limits.buy));
    if (limits?.swap) q.set("swap", String(limits.swap));
    if (limits?.skip) q.set("skip", String(limits.skip));
    const s = q.toString();
    return req(`/api/briefing${s ? `?${s}` : ""}`);
  },
  pantry: () => req("/api/pantry"),
  pantrySections: () => req("/api/pantry/sections"),
  devPantryInsights: () => req("/api/dev/pantry-insights"),
  devLatestScan: () => req("/api/dev/scans/latest"),
  devPantrySchedule: () => req("/api/dev/pantry-schedule"),
  product: (id: string) => req(`/api/pantry/${id}`),
  patchProduct: (id: string, patch: Record<string, unknown>) =>
    req(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  correct: (id: string, type: "im_out" | "never_remind") =>
    req(`/api/products/${id}/corrections`, { method: "POST", body: JSON.stringify({ type }) }),
  enrichAI: (id: string) => req(`/api/products/${id}/enrich-ai`, { method: "POST", body: "{}" }),
  aiExtract: (image: string, kindHint?: string) =>
    req("/api/ai/extract", { method: "POST", body: JSON.stringify({ image, kindHint }) }),
  parseList: (text: string) =>
    req("/api/ai/parse-list", { method: "POST", body: JSON.stringify({ text }) }),
  createScan: (kind: string, items: unknown[]) =>
    req("/api/scans", { method: "POST", body: JSON.stringify({ kind, items }) }),
  confirmScan: (id: string, kind: string, items: unknown[], purchasedAt?: string, listId?: string) =>
    req(`/api/scans/${id}/confirm${listId ? `?listId=${listId}` : ""}`, {
      method: "POST",
      body: JSON.stringify({ kind, items, purchasedAt }),
    }),
  list: (id: string) => req(`/api/lists/${id}`),
  lists: () => req("/api/lists"),
  createList: (payload: { title?: string; source?: "auto" | "manual" | "scan" } = {}) =>
    req("/api/lists", { method: "POST", body: JSON.stringify(payload) }),
  clearList: (id: string) =>
    req(`/api/lists/${id}/items`, { method: "DELETE" }),
  pantryRefresh: () =>
    req("/api/lists/pantry-refresh", { method: "POST", body: "{}" }),
  undoAutoItems: (id: string) =>
    req(`/api/lists/${id}/auto-items`, { method: "DELETE" }),
  listSuggestions: (listId?: string | null) =>
    req(`/api/lists/suggestions${listId ? `?listId=${listId}` : ""}`),
  addListItem: (listId: string, item: Record<string, unknown>) =>
    req(`/api/lists/${listId}/items`, { method: "POST", body: JSON.stringify(item) }),
  addListItems: (listId: string, items: Array<Record<string, unknown>>) =>
    req(`/api/lists/${listId}/items/bulk`, {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  deleteListItem: (listId: string, itemId: string) =>
    req(`/api/lists/${listId}/items/${itemId}`, { method: "DELETE" }),
  evaluateList: (id: string) => req(`/api/lists/${id}/evaluate`, { method: "POST", body: "{}" }),
  patchListItem: (listId: string, itemId: string, patch: Record<string, unknown>) =>
    req(`/api/lists/${listId}/items/${itemId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  manualPurchase: (p: Record<string, unknown>) =>
    req("/api/purchases/manual", { method: "POST", body: JSON.stringify(p) }),
  seedDemo: () => req("/api/demo/seed", { method: "POST", body: "{}" }),
  resetDemo: () => req("/api/demo/reset", { method: "POST", body: "{}" }),
};

export type { };
