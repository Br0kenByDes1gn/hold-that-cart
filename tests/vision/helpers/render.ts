import type { DigestItem } from "./digest.js";
import { canonicalName } from "./digest.js";
import type { VisionCase } from "../cases.js";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Any model-returned item, in whatever shape it arrived. */
export type RawItem = Record<string, unknown>;

export interface PreviewInput {
  digest: { kind: string; expectedKind: string; itemCount: number; totalQty: number; prices: number[] };
  names: DigestItem[];
  /** Everything the model returned for this run (never projected/pruned). */
  items: RawItem[];
}

/** Column order: the schema's own fields first, then anything unexpected. */
const PREFERRED_KEYS = [
  "rawName",
  "normalizedName",
  "brand",
  "qty",
  "packQty",
  "packUnit",
  "unit",
  "price",
  "store",
  "confidence",
];

const NUMERIC_KEYS = new Set(["qty", "packQty", "price", "confidence"]);

/**
 * Union of keys across all items, so a field added to the schema later shows
 * up for review automatically instead of being silently invisible.
 */
function collectKeys(items: RawItem[]): string[] {
  const seen = new Set<string>();
  for (const it of items) for (const k of Object.keys(it)) seen.add(k);
  const preferred = PREFERRED_KEYS.filter((k) => seen.has(k));
  const extra = [...seen].filter((k) => !PREFERRED_KEYS.includes(k)).sort();
  return [...preferred, ...extra];
}

function cell(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return '<span class="dim">—</span>';
  if (typeof value === "number") {
    return NUMERIC_KEYS.has(key) ? value.toString() : esc(String(value));
  }
  if (typeof value === "object") return `<code>${esc(JSON.stringify(value))}</code>`;
  return esc(String(value));
}

function sortForReview(items: RawItem[]): RawItem[] {
  return [...items].sort((a, b) => {
    const na = canonicalName(String(a.normalizedName ?? a.rawName ?? ""));
    const nb = canonicalName(String(b.normalizedName ?? b.rawName ?? ""));
    if (na !== nb) return na.localeCompare(nb);
    return Number(a.price ?? 0) - Number(b.price ?? 0);
  });
}

/**
 * Human-reviewable preview. Deterministic for the committed part (kind, count,
 * qty, prices, canonical names, must-include checklist) so it can be diffed in
 * git; the per-run detail section is the part reviewers need when something
 * looks wrong.
 */
export function renderPreview(
  c: VisionCase,
  input: PreviewInput,
  meta: { width: number; height: number; bytes: number },
): string {
  const nameRows = input.names
    .map(
      (it) => `<tr>
      <td>${esc(it.name)}</td>
      <td class="num">${it.price == null ? '<span class="dim">—</span>' : it.price.toFixed(2)}</td>
    </tr>`,
    )
    .join("\n");

  const keys = collectKeys(input.items);
  const rows = sortForReview(input.items);
  const headCells = keys.map((k) => `<th class="${NUMERIC_KEYS.has(k) ? "num" : ""}">${esc(k)}</th>`).join("");
  const detailRows = rows
    .map((it) => {
      const cells = keys
        .map((k) => `<td class="${NUMERIC_KEYS.has(k) ? "num" : ""}">${cell(k, it[k])}</td>`)
        .join("");
      const json = JSON.stringify(it, null, 2);
      return `<tr>${cells}</tr>
      <tr class="json-row"><td colspan="${keys.length}">
        <details><summary>raw JSON</summary><pre>${esc(json)}</pre></details>
      </td></tr>`;
    })
    .join("\n");

  const expectRows = c.mustInclude
    .map((needle) => {
      const present = input.names.some((it) => it.name.includes(needle));
      return `<li class="${present ? "ok" : "bad"}">${present ? "✓" : "✗"} ${esc(needle)}</li>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Vision check · ${esc(c.id)}</title>
<style>
  body { margin: 0; padding: 24px; background: #071a29; color: #e6f1ff;
         font: 14px/1.5 Inter, system-ui, sans-serif; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  h2 { margin: 24px 0 8px; font-size: 12px; text-transform: uppercase;
       letter-spacing: 1px; color: #8aa4c0; }
  .meta { color: #8aa4c0; font-size: 12px; }
  .wrap { display: grid; grid-template-columns: minmax(260px, 340px) 1fr; gap: 24px; align-items: start; }
  @media (max-width: 1100px) { .wrap { grid-template-columns: 1fr; } }
  img { width: 100%; border: 1px solid #1c3a54; border-radius: 8px; background: #fff; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; color: #8aa4c0; font-weight: 600; border-bottom: 1px solid #1c3a54;
       padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: .5px;
       white-space: nowrap; }
  td { padding: 6px 8px; border-bottom: 1px solid #10283d; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .dim { color: #8aa4c0; }
  .stats { display: flex; gap: 20px; font-size: 13px; color: #8aa4c0; margin-top: 8px; flex-wrap: wrap; }
  .stats b { color: #e6f1ff; }
  .note { background: #05141f; border: 1px solid #1c3a54; border-radius: 8px;
          padding: 10px 12px; font-size: 13px; }
  ul { list-style: none; padding: 0; margin: 0; font-size: 13px; }
  li { padding: 2px 0; }
  li.ok { color: #22c55e; }
  li.bad { color: #ff3b5c; }
  tr.json-row td { border-bottom: 1px solid #10283d; padding-bottom: 8px; }
  details summary { cursor: pointer; color: #8aa4c0; font-size: 11px; }
  pre { background: #05141f; border: 1px solid #1c3a54; border-radius: 8px;
        padding: 10px; overflow: auto; font-size: 11px; margin: 6px 0 0; }
  code { font-size: 11px; color: #8aa4c0; }
</style>
</head>
<body>
  <h1>${esc(c.id)}</h1>
  <div class="meta">${esc(c.file)} · ${meta.width}×${meta.height} · ${Math.round(meta.bytes / 1024)} KB sent to model</div>

  <div class="wrap">
    <div>
      <img src="../../fixtures/receipts/${esc(c.file)}" alt="${esc(c.id)} source image">
      <p class="note"><strong>What to check:</strong> ${esc(c.note)}</p>
      <div class="stats">
        <span>kind <b>${esc(input.digest.kind)}</b> (expected ${esc(input.digest.expectedKind)})</span>
        <span>items <b>${input.digest.itemCount}</b></span>
        <span>total qty <b>${input.digest.totalQty}</b></span>
      </div>

      <h2>Must include</h2>
      <ul>
${expectRows}
      </ul>
    </div>

    <div>
      <h2>Items (canonical name · price) — this is what the golden asserts</h2>
      <table>
        <thead><tr><th>Item</th><th class="num">Price</th></tr></thead>
        <tbody>
${nameRows}
        </tbody>
      </table>

      <h2>All extracted properties (last run — not asserted)</h2>
      <table>
        <thead><tr>${headCells}</tr></thead>
        <tbody>
${detailRows}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>
`;
}
