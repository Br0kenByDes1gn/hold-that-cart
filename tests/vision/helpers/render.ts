import type { DigestItem } from "./digest.js";
import type { VisionCase } from "../cases.js";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface PreviewInput {
  digest: { kind: string; expectedKind: string; itemCount: number; totalQty: number; prices: number[] };
  names: DigestItem[];
  /** Latest run only (not committed): confidence + qty/pack detail. */
  detail: DigestItemDetail[];
}

export interface DigestItemDetail {
  rawName: string;
  qty: number;
  pack: string | null;
  price: number | null;
  confidence: number;
}

/**
 * Human-reviewable preview. Deterministic for the committed part (kind, count,
 * qty, prices, canonical names, must-include checklist) so it can be diffed in
 * git; the per-run detail table is the part reviewers need when something
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

  const detailRows = input.detail
    .map(
      (it) => `<tr>
      <td>${esc(it.rawName)}</td>
      <td class="num">${esc(it.qty)}</td>
      <td class="num">${it.pack ?? '<span class="dim">—</span>'}</td>
      <td class="num">${it.price == null ? '<span class="dim">—</span>' : it.price.toFixed(2)}</td>
      <td class="num">${it.confidence.toFixed(2)}</td>
    </tr>`,
    )
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
  .wrap { display: grid; grid-template-columns: minmax(260px, 380px) 1fr; gap: 24px; align-items: start; }
  @media (max-width: 900px) { .wrap { grid-template-columns: 1fr; } }
  img { width: 100%; border: 1px solid #1c3a54; border-radius: 8px; background: #fff; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: #8aa4c0; font-weight: 600; border-bottom: 1px solid #1c3a54;
       padding: 6px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
  td { padding: 6px 8px; border-bottom: 1px solid #10283d; }
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

      <h2>Last run detail (not asserted)</h2>
      <table>
        <thead><tr><th>Raw name</th><th class="num">Qty</th><th class="num">Pack</th><th class="num">Price</th><th class="num">Conf.</th></tr></thead>
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
