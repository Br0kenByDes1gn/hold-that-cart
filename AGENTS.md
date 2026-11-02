# AGENTS.md — Hold That Cart

Guide for AI agents and developers working in this repo. Read this first.

## What this is

A PWA that builds a household pantry from receipts, then uses purchase rhythm
to intervene at the right moment: **"Hold that cart — you already have this."**
Optimised for a hackathon demo (Meta global.ai, Oct 2026), not production.
Key product docs: `meetings/26-10-2026-summary.md`,
`meetings/27-10-2026-summary.md`, `meetings/Hold That Cart-types.md`
(types of goods, grounding, rhythm math — the unfinished ideas at the end of
that file are explicitly **out of scope**, see "Not built yet").

## Non-negotiable product rules

1. **AI extracts and informs; code decides.** The vision model turns photos
   into items; a second model call supplies product knowledge. All behaviour
   (BUY/SKIP/SWAP, hold alerts, money math, tag gating) is deterministic
   TypeScript in `src/server/domain/`. Never move decisions into a prompt.
2. **Grounding:** the model must never invent products, prices, or savings.
   The enrichment schema has *no price fields*; `assertNoPrices`
   (`src/server/ai/meta.ts`) rejects model output containing them.
   Alternatives are product *types/forms* (loose, refill, store brand, larger
   pack), never brands/SKUs. Prefer failing validation over storing a guess.
3. **Money tags only from the user's own receipts** — median unit prices,
   ≥10% difference, same base unit (€/kg, €/L, €/each, €/wash).
   Unverified model swaps never display a € figure or light the money tag.
   **Pantry exception:** the Pantry section view may use the pantry
   classification prompt's `savesMoney` / `healthy` / `sustainable` / `swap`
   fields as **AI estimates**. Code still validates the swap
   and decides SWAP/BUY/SKIP. These estimates never drive € figures or the
   receipt-derived money evidence used by the briefing.
4. **Shelf-life policy** (class comes from enrichment, user-editable):
   perishables never SKIP; staples soft-SKIP; household SKIP; durables get
   the strongest hold alert and never auto-BUY in the briefing. The grocery
   list has its own auto-add clock: perishable 3 days, staple 14 days,
   household 60 days, durable 365 days from the latest purchase (see
   `/quick-view`). Unknown items get no rhythm claims. Only flags with enough
   history; label estimates "probably".
5. **Only tags that apply light up** (money/health/planet); the rest stay
   grey. Health/planet tags need model confidence ≥0.5 and a ≥1-point delta.
6. **Canonical product identity = generic type.** `normalizedName`
   ("peanut oil") is the product; brand, pack size, and the raw receipt line
   are purchase-level *variants* (`purchases.brand`, `purchases.variant`).
   Brand A / Brand B of the same type always pool into one product — pooled
   rhythm, variant comparison for money suggestions. Never key a product by
   raw receipt text.
7. **Optional signup, never gating.** The app starts on an anonymous device
   household (`X-Device-Id`). Auth screens are visuals only for now; nothing
   may gate access on login state. When accounts are built, signup attaches
   the *existing* device household to the account (email via
   `PATCH /api/households/me`) — never generate a fresh household or clear
   the device ID on signup.

## Stack

TypeScript everywhere · Vite + React 18 SPA · TanStack Router + Query ·
`vite-plugin-pwa` · Hono on Node · Drizzle ORM with **Postgres dialect in
both environments** (PGlite file DB for dev, real Postgres via `DATABASE_URL`
later — one schema, `src/server/db/schema.ts`) · Muse via Meta Model API
(`https://api.meta.ai/v1`, OpenAI-compatible Chat Completions) · Vitest ·
Zod schemas in `src/shared/schemas.ts` are the single API/AI contract.

## Run it

```bash
pnpm install
pnpm run dev        # Hono API :3001 + Vite :5173 (Vite proxies /api), Ctrl-C stops both
pnpm test           # 80+ Vitest tests, must stay green
pnpm run test:e2e   # 10 Playwright tests (prod bundle, Chromium mobile) — UI, auth, pantry flow
pnpm test:vision    # LIVE vision goldens (costs credits; needs MODEL_API_KEY)
pnpm vision:render  # rebuild HTML previews from the last run (free, no model calls)
pnpm run typecheck  # tsc --noEmit, must stay clean
pnpm run build && pnpm start   # production: Hono serves API + built SPA on :3001
```

Copy `.env.example` → `.env`. `MODEL_API_KEY` (real key already in local
`.env`) enables photo extraction + AI enrichment; everything else works
without it. **Never commit, print, or paste `.env` values.**

Gotchas:

- Run the server with `tsx` (`src/server/dev.ts` is the listener;
  `src/server/index.ts` only builds the app). Plain `node` cannot resolve
  the `.js` import specifiers used for TS files.
- `pnpm run db:migrate` is a dead script (`scripts/migrate.ts` does not
  exist). Dev schema is applied as DDL inside `getDb()`
  (`src/server/db/client.ts`), which also creates the PGlite data dir.
- Do not remove `--external:@electric-sql/pglite` from
  `build:server` — esbuild bundling breaks PGlite's WASM asset loading.

## Repo map

```
src/shared/schemas.ts        Zod enums + contracts (ExtractedItem, ProductEnrichment, Suggestion, API payloads)
src/shared/itemCategories.ts Fixed category pool + display labels for scan items
src/server/index.ts          Hono app: household routes, static SPA serving (prod)
src/server/dev.ts            server entry point (listens on PORT, default 3001)
src/server/routes.ts         all /api routes (scans, pantry, briefing, lists, AI, demo)
src/server/db/schema.ts      Drizzle pg tables
src/server/db/client.ts      PGlite/Postgres driver selection + dev DDL
src/server/db/repo.ts        product/purchase loading, SuggestionProduct assembly
src/server/domain/           PURE deterministic core — no I/O except demo.ts fixtures
  normalize.ts  match.ts     name normalisation, knowledge keys, product matching
  units.ts                   unit normalisation, median
  rhythm.ts                  T/d stock-state engine (see below)
  money.ts                   cheaper-variant + larger-pack evidence from receipts
  tags.ts                    tag gating (evidence-only)
  suggestions.ts             BUY/SWAP/SKIP grouping, ordering, caps
  listSuggestions.ts         PREVIEW stub: rhythm BUY → grocery-list suggestion contract
  pantrySchedule.ts          pantry → list auto-add clock (3/14/60/365d) + 3-day refresh gate
  pantrySection.ts           pantry insight → SWAP/BUY/SKIP section + tag mapping
  demo.ts                    fixture enrichments, demo insights, purchase plan (dates relative to now)
src/server/ai/provider.ts    AIProvider interface; Stub until MODEL_API_KEY set
src/server/ai/meta.ts        Muse prompts, Meta API client, price guard
src/client/router.tsx        routes: / (=Mode) /mode /briefing /scanner /pantry /pantry/:id /lists/:id /quick-view /analyse (stub) /signup /login (visuals only)
src/client/api.ts            typed fetchers (sends X-Device-Id)
src/client/screens/          Home, Briefing, Scanner, Pantry (+detail), Lists
src/client/components.tsx    TagChip/Tags, ProductArt, icon registry hook
src/client/theme.css         design tokens (single source of truth for colour)
tests/                       rhythm, pantrySchedule, match, money, suggestions, api (E2E), ai (mocked fetch), smoke
tests/fixtures/              golden ExtractedItem JSON (copies served from public/fixtures/)
assets/item/                 106 transparent product PNGs (source art, do not edit)
assets/manifest.json         icon filename + category registry
scripts/normalize-assets.mjs regenerates public/icons/products/*.png + icons.json (generated, gitignored)
design_system.md             visual spec: tokens, tag design, screen names, copy rules
```

## Domain model in one paragraph

`households` (anonymous `device_id`, nullable `email` for later attach,
`household_size`, `account_type`, `currency`) own `products` (household
canonical item, `shelfLifeClass`, `muted`, `icon` slug). `purchases` are the
source of truth — inventory is **derived**, never stored as counters — with
brand, pack size, qty, and normalised `unit_price`. `product_knowledge` is
the cross-household enrichment cache keyed by name(+brand/form).
`scans` store validated extraction JSON (images are never persisted).
`shopping_lists`/`list_items` carry `checked` + `decision`
(buy/skip/needs_it). `corrections` record `im_out` / `never_remind`;
`never_remind` also sets `products.muted`.

## Rhythm engine (`domain/rhythm.ts`)

- `T` = median gap between purchases when ≥2 gaps exist (≥3 purchases,
  "personal rhythm", high confidence); otherwise the enrichment default
  scaled by household size: `T × 2/household_size`, clamped 0.5×–2×.
- `d` = days since last purchase. `d < 0.6T` stocked · `0.6–1.0T` getting
  low · `> 1.0T` due. Durables short-circuit: any purchase = stocked/high
  unless an `im_out` correction is newer than the last purchase.
  `im_out` forces `due` until the next purchase.
- All domain functions are pure with `now` injected — keep it that way so
  tests stay deterministic. When changing thresholds or policy, update
  `tests/rhythm.test.ts` / `tests/suggestions.test.ts` boundaries.

## API surface (all require `X-Device-Id`, see `src/client/lib/device.ts`)

```
POST /api/households            device upsert (anonymous id; email attachable via PATCH /api/households/me)
GET  /api/catalog               demo catalogue + household products (autocomplete)
POST /api/scans                 store ExtractedItem[] JSON, returns product matches
POST /api/scans/:id/confirm     receipt → purchases + pantry insights; list/cart → shopping list
POST /api/purchases/manual      single-item purchase entry
GET  /api/pantry  GET /api/pantry/:id     derived state, history, enrichment, suggestions
GET  /api/pantry/sections       scanned-item pantry insights grouped BUY/SKIP/SWAP
PATCH /api/products/:id         rename, reclassify shelf-life class, mute, icon
POST /api/products/:id/corrections        { type: im_out | never_remind }
POST /api/products/:id/enrich          manual enrichment (validated, price-rejecting)
POST /api/products/:id/enrich-ai       Muse enrichment for this product
POST /api/ai/extract             photo (base64/data URL) → items; image not stored
POST /api/ai/parse-list          dictated text → grounded items + pantry matches (no prices)
POST /api/ai/enrich              { name, brand?, form? } → cached enrichment
GET  /api/briefing?buy=8&swap=3&skip=5   grouped suggestions + holdCount
POST /api/lists, GET/PATCH /api/lists/:id, POST/PATCH/DELETE list items, POST /api/lists/:id/evaluate
DELETE /api/lists/:id/items   clear the whole list in place (confirmation is client-side)
POST /api/lists/pantry-refresh   lazy 3-day pantry→list auto-add (normalized names)
DELETE /api/lists/:id/auto-items  undo the latest auto-add batch
GET  /api/lists/suggestions?listId=   PREVIEW pantry→list suggestions (rhythm stub; contract final)
GET  /api/dev/pantry-schedule   dev-only auto-add schedule, sorted perishables first
POST /api/demo/seed | /api/demo/reset    demo household (see below)
GET  /api/health
```

## AI integration (`src/server/ai/`)

- `MetaProvider` calls `POST {META_BASE_URL}/chat/completions`
  (`META_MODEL`, default `muse-spark-1.3`) with `response_format: json_object`,
  then Zod-validates. Extraction and enrichment prompts are exported
  constants in `meta.ts` — tune them there; they are the prompt-tuning surface.
- **Muse is a reasoning model: reasoning tokens count against `max_tokens`.**
  Budgets are deliberately generous (2500–4000). Small budgets return empty
  content with `finish_reason: length` — if you see "empty model response",
  raise the budget before debugging prompts.
- Enrichment is generated once per knowledge key and cached; briefings never
  call the model inline. No personal data (history, prices) is ever sent —
  name/brand/form only.
- The extraction prompt also returns a fixed `category` per item from
  `src/shared/itemCategories.ts`; the client uses it to choose the Scanner
  image. Invalid categories fall back to `other` instead of failing the scan.
- The list-parse prompt (`parseShoppingList`) turns dictated speech into product
  names only. It must preserve the speaker's words, strip brands/sizes into the
  `brand` field, and never invent items or prices. `domain/listParse.ts` grounds
  every name in the transcript afterwards; budget via
  `META_LIST_PARSE_MAX_TOKENS` (default 4000).
- The pantry classification prompt (`classifyPantryItems`) runs on confirmed
  receipt items only. The model returns AI estimates for `savesMoney`,
  `healthy`, `sustainable`, and `swap` as directional scores from 0 to 1
  (0 = definitely no, 0.5 = unknown, 1 = definitely yes). `domain/pantrySection.ts`
  counts a parameter only when its score is ≥0.6 for BUY/SWAP/SKIP, while the
  Pantry tag chips light up when the score is strictly above 0.5. Set
  `PANTRY_CLASSIFY=off` for deterministic tests.
- Every model call logs one `[ai-usage]` JSON line with request/response
  bytes, image bytes (extraction), prompt/completion/reasoning/cached/total
  tokens, duration, finish reason, item count, and tokens per item. The same
  line overwrites `log.txt` in the project root for the most recent request.
- Tests mock `fetch` (`tests/ai.test.ts`). Never call the live API in tests —
  it costs credits and is non-deterministic.

## Vision (scan) tests

Real photos in `tests/fixtures/receipts/` go through the **actual Muse model**;
results are frozen in `tests/vision/__snapshots__/`. The suite is skipped unless
`VISION_TESTS=1` (`pnpm test:vision`), so `pnpm test` stays offline and free.

- `<id>.json` — strict golden: kind, item count, total qty, price multiset.
- `<id>.names.json` — tolerant golden: canonical names (one miss allowed on
  small receipts; the model legitimately reads ambiguous abbreviations two ways).
- `<id>.html` — human preview. Lists every property the model returned per item
  (schema order plus any unexpected columns) with per-item raw JSON, the source
  image, and the must-include checklist. **Open before committing an accepted
  run.** `pnpm vision:render` rebuilds these from the last artifacts, free.
- `tests/vision/__artifacts__/` — per-run raw output; gitignored, never asserted.

Adding a receipt: drop the file in `tests/fixtures/receipts/`, add a case to
`tests/vision/cases.ts` (`id`, `file`, `kindHint`, `note`), run
`pnpm test:vision -u`, review the HTML, then fill `mustInclude` with 3–6 items
you'd notice missing. Use `VISION_FILTER=<id>` while tuning prompts. Fixtures
are real receipts — check for names/addresses/card fragments before pushing.

## Frontend + design

- Visual language comes from `design_system.md` (dark navy `--bg #071a29`,
  money `#3b82f6`, health `#22c55e`, planet `#f59e0b`, alert `#ff3b5c`, glow
  pattern, tags with icon+label, "Triple Match" gold). Tokens live in
  `src/client/theme.css`. The design doc's UI/screen *crops* were never
  committed — rebuild all chrome in React/CSS, never ship cropped images.
- Screen names: Scanner = "Cart Radar", Pantry = "The Stash", briefing is the
  pre-shop BUY/SKIP/SWAP view. Copy rules: labels 1–3 words, sentences <10
  words, estimates labelled, no lecturing/shaming.
- Meetings overruled the mockups on one point: game-*like* feel, **no
  XP/levels/quests**. Do not add gamification mechanics from the design doc.
- Icons: run `pnpm run assets:normalize` after changing `assets/`. Product →
  icon by slug, then category fallback (`src/client/components.tsx`).
  `public/icons/icon-*.png` are generated placeholders, replace before launch.
- Alias caveat: manifest filenames use underscores; on-disk files carry a
  ` Background Removed` suffix. The normalize script reconciles them.

## Grocery list editing (`/quick-view`)

- Three ways in, all ending in the same item rows: typed bar, voice dictation
  (`src/client/lib/speech.ts`, browser Web Speech API), and a product photo
  (`/api/ai/extract` with `kindHint: "product"` → generic name + brand, user
  confirms). Camera detections are grouped by name + brand with summed
  quantities (`src/shared/detectedProducts.ts`): four identical bottles become
  one `Beer ×4` line, different brands stay separate.
- Voice is always split by the model (`POST /api/ai/parse-list`). The model only
  names/normalises products; `domain/listParse.ts` grounds every name in the
  transcript, keeps the spoken brand as a note, dedupes, clamps quantities and
  matches pantry products deterministically. Model failure falls back to
  `parseListText` with `source: "fallback"` — never a guessed list.
- `parseListText` (`src/shared/listText.ts`) deterministically splits typed text
  and reads quantities; typed input never calls the model.
- Items carry `qty`, `brand` and `source` (`manual | voice | camera | scan | auto`).
  Renaming re-matches the canonical product server-side; brand is never identity.
- “Clear list” empties the current list in place after a confirm sheet. It never
  archives or creates a list; the same open list stays.
- Pantry → list auto-add is deterministic (`domain/pantrySchedule.ts`). It runs
  when `/quick-view` opens, at most once every 3 days. At each pass every
  product whose category interval has elapsed — perishable 3d, staple 14d,
  household 60d, durable 365d, counted from the latest purchase — is inserted
  with `source: "auto"` under its **normalized generic name** (never a brand
  or receipt line). Muted items and names already on the list are skipped.
  The refresh response exposes the batch so the UI offers one Undo;
  `DELETE /api/lists/:id/auto-items` removes it.
- `GET /api/lists/suggestions` remains the read-only rhythm preview contract
  for the future prediction service (`listSuggestionsResponseSchema`); the
  `/quick-view` UI no longer uses it.
- Voice transcription is a seam (`AIProvider.transcribe?`) for when Meta audio
  is confirmed; audio currently stays in the browser.

## Demo & fixtures

`POST /api/demo/seed` creates fixture enrichments plus purchases with dates
relative to *now*, so any day it deterministically shows: Milk BUY (personal
rhythm, T=5d), Rice SKIP with € evidence, steel bottle durable hold,
olive-oil SWAP (branded 500 ml @ €12/L habit vs store-brand 1 L @ €8/L —
≥10% median unit-price evidence, ≈€2/trip). Home screen has Load/Reset demo
buttons; the Scanner has receipt/list/cart fixture buttons for camera-free
testing. `tests/api.test.ts` encodes the acceptance scenarios: seed →
briefing groups; 3 receipts → personal rhythm; `im_out` clears a SKIP;
`never_remind` mutes; price-bearing enrichment → 400.

## Not built yet (do not invent)

Analyse/"Your Impact" screen and verified-savings ledger · business-mode
screens/seed data · shelf-photo stock check · barcode scanning ·
continuous cart video · Open Food Facts (possible later health-score source) ·
email signup UI (API supports attach; Auth screens are visuals only — see rule 7) · hosting/deployment ·
real golden-photo prompt-tuning set (fixtures are JSON so far).

## Working conventions

- Keep the shared Zod schemas as the only contract — change them first,
  then server, then client, then tests.
- Domain logic changes require unit tests (`pnpm test` + `pnpm run typecheck`
  before every commit).
- Commit after each successful, verified step with a message naming the
  step (see `git log` — Steps 1–5). Never commit `.env`, `.data/`, `dist/`,
  `dist-server/`, `node_modules/`, or generated icons.
- When a plan decision conflicts with this file, the meetings summaries in
  `meetings/` and the rules above win over the design mockups.
