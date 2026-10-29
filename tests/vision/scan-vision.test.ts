import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MetaProvider } from "../../src/server/ai/meta.js";
import { VISION_CASES } from "./cases.js";
import {
  canonicalTokens,
  compareNames,
  namesOf,
  stableDigestOf,
  type DigestItem,
} from "./helpers/digest.js";
import { prepareImage } from "./helpers/prepare.js";
import { renderPreview } from "./helpers/render.js";

/**
 * LIVE vision tests — these call Muse and cost credits.
 *
 * They only run when VISION_TESTS=1, so `pnpm test` stays offline and free.
 *
 *   pnpm test:vision              # verify against committed goldens
 *   pnpm test:vision -u           # accept current output (then review the HTML!)
 *   VISION_FILTER=aldi pnpm test:vision
 *
 * Two goldens per fixture, both under tests/vision/__snapshots__/:
 *   <id>.json   strict: kind, item count, total qty, price multiset
 *   <id>.names  tolerant: canonical names (≥80% must match, ≥0.6 token overlap)
 *   <id>.html   human preview, rewritten on -u (open this before committing)
 *
 * Names are compared tolerantly because the model legitimately reads an
 * ambiguous abbreviation two ways on different runs. Prices, counts and total
 * quantity are stable and asserted strictly. Per-run detail (raw names, qty,
 * pack, confidence) goes to tests/vision/__artifacts__/ and is never asserted.
 */
const ENABLED = process.env.VISION_TESTS === "1";
const FILTER = (process.env.VISION_FILTER ?? "").trim();

const SNAPSHOTS_DIR = path.resolve(__dirname, "__snapshots__");
const ARTIFACTS_DIR = path.resolve(__dirname, "__artifacts__");

const MIN_NAME_SIMILARITY = 0.6;

const selected = VISION_CASES.filter((c) => !FILTER || c.id.includes(FILTER));

const provider = new MetaProvider();
const hasKey = !!process.env.MODEL_API_KEY;

/**
 * Are snapshots being rewritten? Vitest consumes its own CLI flags, so ask its
 * snapshot state instead of looking at process.argv.
 */
function isUpdateMode(): boolean {
  const state: any = (expect as any).getState?.().snapshotState;
  return state?._updateSnapshot === "all";
}

describe.skipIf(!ENABLED)("vision extraction (live model)", () => {
  it("has an API key configured", () => {
    expect(hasKey, "MODEL_API_KEY is required for live vision tests").toBe(true);
  });

  for (const c of selected) {
    it(`${c.id}: ${c.note}`, async () => {
      await mkdir(SNAPSHOTS_DIR, { recursive: true });
      await mkdir(ARTIFACTS_DIR, { recursive: true });

      const image = await prepareImage(c.file);
      const result: any = await provider.extractItems(
        Buffer.from(image.base64, "base64"),
        image.mimeType,
        c.kindHint,
      );

      const kind = String(result.kind ?? "unknown");
      const items = result.items ?? [];

      // 1. Detection kind must be right for this fixture.
      expect(kind).toBe(c.kindHint);

      // 2. Curated expectations — order-insensitive token-subset match.
      const itemTokens = items.map((it: any) => canonicalTokens(it.normalizedName || it.rawName));
      for (const needle of c.mustInclude) {
        const need = canonicalTokens(needle);
        const found = itemTokens.some((tokens: string[]) => need.every((n) => tokens.includes(n)));
        expect(
          found,
          `expected an item matching "${needle}" — got: ${itemTokens.map((t: string[]) => t.join(" ")).join(", ")}`,
        ).toBe(true);
      }

      // 3. Digit sanity — a collapsed or hallucinated extraction fails here.
      expect(items.length).toBeGreaterThanOrEqual(3);
      for (const it of items) {
        expect(it.qty).toBeGreaterThan(0);
        if (it.price != null) expect(it.price).toBeGreaterThanOrEqual(0);
      }

      // 4. Strict golden: structure and money (stable across runs).
      const stable = stableDigestOf(c.id, c.kindHint, kind, items);
      await expect(`${JSON.stringify(stable, null, 2)}\n`).toMatchFileSnapshot(
        `./__snapshots__/${c.id}.json`,
      );

      const images = { width: image.width, height: image.height, bytes: image.bytes };

      // 5. Tolerant golden: canonical names.
      const names = namesOf(items, c.aliases);
      const namesPath = path.join(SNAPSHOTS_DIR, `${c.id}.names.json`);
      const update = isUpdateMode();
      if (update) {
        await writeFile(namesPath, `${JSON.stringify(names, null, 2)}\n`);
      } else {
        const goldenRaw = await readFile(namesPath, "utf8").catch(() => null);
        expect(goldenRaw, `no name golden for ${c.id} — run with -u`).toBeTruthy();
        const golden = JSON.parse(goldenRaw!) as DigestItem[];
        const cmp = compareNames(golden, names);
        // Small fixtures: one drifted name out of three is 67%, which is fine
        // when the model legitimately reads an abbreviation differently. Allow
        // one miss on small sets, and never more than 20% overall.
        const allowedMissing = Math.max(1, Math.floor(golden.length * 0.2));
        expect(
          cmp.missing.length,
          `name drift for ${cmp.missing.length}/${golden.length} items in ${c.id}\n` +
            `missing: ${cmp.missing.join(", ") || "—"}\n` +
            `extra:   ${cmp.extra.join(", ") || "—"}`,
        ).toBeLessThanOrEqual(allowedMissing);
        expect(cmp.similarity, `name similarity for ${c.id}`).toBeGreaterThanOrEqual(
          MIN_NAME_SIMILARITY,
        );
      }

      // 6. Human preview. Committed on -u; otherwise written as a run artifact
      //    so reviewers can always look at the latest result.
      const html = renderPreview(
        c,
        {
          digest: stable,
          names,
          items,
        },
        images,
      );
      const htmlTarget = update
        ? path.join(SNAPSHOTS_DIR, `${c.id}.html`)
        : path.join(ARTIFACTS_DIR, `${c.id}.html`);
      await writeFile(htmlTarget, html);

      await writeFile(
        path.join(ARTIFACTS_DIR, `${c.id}.raw.json`),
        `${JSON.stringify({ kind, items }, null, 2)}\n`,
      );
    }, 180_000);
  }
});
