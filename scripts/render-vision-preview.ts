/**
 * Rebuild the committed HTML previews from the last run's raw artifacts,
 * without calling the vision model. Free to run as often as you like.
 *
 *   pnpm vision:render                 # all fixtures with an artifact
 *   pnpm vision:render -- walmart      # subset
 *
 * Inputs:  tests/vision/__artifacts__/<id>.raw.json
 * Outputs: tests/vision/__snapshots__/<id>.html
 *          (strict .json / .names.json goldens are untouched)
 */
import "dotenv/config";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { VISION_CASES } from "../tests/vision/cases.js";
import { namesOf, stableDigestOf } from "../tests/vision/helpers/digest.js";
import { renderPreview } from "../tests/vision/helpers/render.js";
import { prepareImage } from "../tests/vision/helpers/prepare.js";

const ARTIFACTS_DIR = path.resolve("tests/vision/__artifacts__");
const SNAPSHOTS_DIR = path.resolve("tests/vision/__snapshots__");

async function main() {
  const filter = process.argv.slice(2).join(" ").trim();
  const selected = VISION_CASES.filter((c) => !filter || c.id.includes(filter));
  await mkdir(SNAPSHOTS_DIR, { recursive: true });

  let rendered = 0;
  const skipped: string[] = [];

  for (const c of selected) {
    const artifactPath = path.join(ARTIFACTS_DIR, `${c.id}.raw.json`);
    const raw = await readFile(artifactPath, "utf8").catch(() => null);
    if (!raw) {
      skipped.push(c.id);
      continue;
    }
    const { kind, items } = JSON.parse(raw) as { kind: string; items: any[] };

    // Image dimensions come from the same preprocessing the test uses (no API).
    const image = await prepareImage(c.file);

    const stable = stableDigestOf(c.id, c.kindHint, kind, items);
    const names = namesOf(items, c.aliases);
    const html = renderPreview(
      c,
      { digest: stable, names, items },
      { width: image.width, height: image.height, bytes: image.bytes },
    );
    await writeFile(path.join(SNAPSHOTS_DIR, `${c.id}.html`), html);
    rendered++;
    console.log(`  rendered ${c.id}`);
  }

  console.log(`\n${rendered} preview(s) rebuilt from artifacts.`);
  if (skipped.length) {
    console.log(`Skipped (no artifact — run \`pnpm test:vision -u\` first): ${skipped.join(", ")}`);
  }
  const artifacts = await readdir(ARTIFACTS_DIR).catch(() => [] as string[]);
  const known = new Set(VISION_CASES.map((c) => `${c.id}.raw.json`));
  const orphans = artifacts.filter((f) => f.endsWith(".raw.json") && !known.has(f));
  if (orphans.length) {
    console.log(`Note: artifacts with no matching case (stale?): ${orphans.join(", ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
