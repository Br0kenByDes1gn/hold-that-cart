#!/usr/bin/env node
// Copy assets/item/*.png -> public/icons/products/<slug>.png + icons.json registry.
// Manifest filenames use underscores; on-disk files have " Background Removed" suffix.
import { readdirSync, copyFileSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "assets", "item");
const outDir = join(root, "public", "icons", "products");
mkdirSync(outDir, { recursive: true });

const manifestPath = join(root, "assets", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function slug(name) {
  return name
    .toLowerCase()
    .replace(/ background removed/gi, "")
    .replace(/\.png$/i, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const files = readdirSync(srcDir).filter((f) => f.toLowerCase().endsWith(".png"));
const bySlug = new Map();
for (const f of files) {
  const s = slug(f);
  bySlug.set(s, f);
  copyFileSync(join(srcDir, f), join(outDir, `${s}.png`));
}

const registry = manifest.map((m) => {
  const s = slug(m.filename);
  return {
    slug: s,
    file: `icons/products/${s}.png`,
    category: m.category,
    label: s.replace(/-/g, " "),
    exists: bySlug.has(s),
  };
});
const missing = registry.filter((r) => !r.exists);
writeFileSync(join(outDir, "icons.json"), JSON.stringify(registry, null, 2));
console.log(`copied ${files.length} icons, registry ${registry.length}, missing ${missing.length}`);
if (missing.length) console.log("missing:", missing.map((m) => m.slug).join(", "));
if (!existsSync(join(root, "public", "icons", "icon-192.png"))) {
  console.log("NOTE: PWA icons icon-192/512.png not yet generated — add later.");
}
