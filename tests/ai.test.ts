import { describe, expect, it, vi } from "vitest";
import { MetaProvider, assertNoPrices } from "../src/server/ai/meta";
import { getAIProvider, StubAIProvider } from "../src/server/ai/provider";

function chatResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => content,
  };
}

describe("meta provider (mocked fetch, no network)", () => {
  it("extractItems validates model JSON into items", async () => {
    const fetchFn = vi.fn(async () =>
      chatResponse(
        JSON.stringify({
          kind: "receipt",
          items: [
            { rawName: "Milk 1L", normalizedName: "milk", qty: 1, packQty: 1, packUnit: "L", price: 1.4, confidence: 0.9 },
          ],
        }),
      ),
    );
    const p = new MetaProvider({ apiKey: "test", fetchFn: fetchFn as any });
    const res = (await p.extractItems(Buffer.from("fake"), "image/jpeg")) as any;
    expect(res.kind).toBe("receipt");
    expect(res.items).toHaveLength(1);
    expect(res.items[0].normalizedName).toBe("milk");
    expect(res.items[0].price).toBe(1.4);
    // request went to chat completions with an image payload
    const init = (fetchFn.mock.calls[0] as unknown[])[1] as any;
    const body = JSON.parse((init as any).body);
    expect(body.model).toBe("muse-spark-1.3");
    expect(JSON.stringify(body.messages)).toContain("image_url");
  });

  it("extractItems rejects invented-shape output", async () => {
    const fetchFn = vi.fn(async () => chatResponse(JSON.stringify({ kind: "receipt", items: [{ nope: 1 }] })));
    const p = new MetaProvider({ apiKey: "test", fetchFn: fetchFn as any });
    await expect(p.extractItems(Buffer.from("fake"))).rejects.toThrow();
  });

  it("enrichProduct validates and stamps provenance", async () => {
    const fetchFn = vi.fn(async () =>
      chatResponse(
        JSON.stringify({
          category: "oils",
          shelfLifeClass: "staple",
          typicalIntervalDays: 35,
          health: { score: 4, confidence: 0.8, basis: ["x"] },
          sustainability: { score: 3, confidence: 0.7, factors: [] },
          alternatives: [],
        }),
      ),
    );
    const p = new MetaProvider({ apiKey: "test", model: "muse-spark-1.3", fetchFn: fetchFn as any });
    const e = await p.enrichProduct({ name: "Olive oil" });
    expect(e.shelfLifeClass).toBe("staple");
    expect((e as any).modelName).toBe("muse-spark-1.3");
    expect((e as any).promptVersion).toBe("v1");
  });

  it("enrichment containing prices fails validation", () => {
    expect(() =>
      assertNoPrices({ category: "x", price: 5, alternatives: [{ title: "y", savings: "€2" }] }),
    ).toThrow(/must not contain prices/);
    expect(() => assertNoPrices({ category: "x", alternatives: [] })).not.toThrow();
  });

  it("API errors surface with status", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 401, text: async () => "bad key" }));
    const p = new MetaProvider({ apiKey: "bad", fetchFn: fetchFn as any });
    await expect(p.enrichProduct({ name: "x" })).rejects.toThrow(/401/);
  });
});

describe("getAIProvider", () => {
  it("stub without key, meta with key", () => {
    const OLD = process.env.MODEL_API_KEY;
    delete process.env.MODEL_API_KEY;
    expect(getAIProvider()).toBeInstanceOf(StubAIProvider);
    process.env.MODEL_API_KEY = "abc";
    expect(getAIProvider()).toBeInstanceOf(MetaProvider);
    if (OLD === undefined) delete process.env.MODEL_API_KEY;
    else process.env.MODEL_API_KEY = OLD;
  });
});
