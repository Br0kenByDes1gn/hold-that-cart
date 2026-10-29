# Hold That Cart

PWA that builds a household pantry from receipts, then uses purchase rhythm to
intervene at the right moment: **"Hold that cart — you already have this."**

## Stack

TypeScript · Vite + React (TanStack Router + Query) · Hono · Drizzle ORM ·
Postgres dialect everywhere (PGlite file DB for dev, real Postgres via
`DATABASE_URL`) · Muse via Meta Model API (`https://api.meta.ai/v1`) · Vitest

## Run it

```bash
pnpm install
pnpm run dev:server   # Hono API on :3001 (PGlite in ./.data, gitignored)
pnpm run dev:client   # Vite on :5173 (proxies /api → :3001)
```

Or production-style (Hono serves the built SPA + PWA):

```bash
pnpm run build && pnpm start   # :3001
```

Copy `.env.example` → `.env` and set `MODEL_API_KEY` (Meta dev.meta.ai key)
to enable photo extraction + AI enrichment. Everything else works without it.

## Flow

1. Home → **Load demo pantry** (seeded history with a built-in money story).
2. **Briefing** (pre-shop): BUY ≤8 / SKIP ≤5 / SWAP ≤3, computed from rhythm.
3. **Scanner**: photo → `POST /api/ai/extract` → correct items → confirm.
   No camera? Use the demo JSON buttons (receipt / list / cart fixtures).
4. **Pantry (The Stash)**: status grid, item detail with evidence, history,
   alternatives, and one-tap corrections (`I'm out` / `Never remind me`).
5. Receipts → purchases (pantry fills). Lists/carts → shopping list +
   `POST /api/lists/:id/evaluate` ("You already have N of these").

## Rules the engine enforces

- Model extracts and informs; code decides. Enrichment schema has **no price
  fields** — invented prices fail validation (`assertNoPrices`).
- Money tags light only from your own receipts (median unit prices, ≥10%).
- Perishables are never SKIP. Durables owned = strongest hold alert, never BUY.
- Only tags with evidence light; everything else stays grey. Estimates labelled.

## Tests

```bash
pnpm test        # 42 tests: rhythm, matching, money, suggestions, canonical pooling, API, AI contracts
```

Key acceptance: seed → expected briefing groups; 3rd receipt flips a product
to personal rhythm; `I'm out` clears a SKIP; durable re-scan → hold alert.
