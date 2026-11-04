# Hold That Cart — demo scenario

This document is the complete script for the recorded demo. The Playwright
agent drives the app; this file defines **what to seed**, **which screens to
visit**, and **what the data should look like**. No Playwright code lives here.

The demo has two chapters:

1. **Empty → first receipt** — show the cold start and a real receipt being
   processed.
2. **Full demo** — seed ~3 weeks of shopping and show the complete product.

Chapter 2 resets the household, so chapter 1 is wiped before it starts. Record
them as two takes (or cut between them).

---

## 1. Requirements

- Production build served by Hono:
  ```bash
  pnpm run build
  pnpm start        # http://localhost:3001
  ```
- `MODEL_API_KEY` must be set on the server for the first-receipt chapter.
  The demo receipt is a JSON fixture (no vision call), but **confirming it runs
  the pantry classification model**. Without a key the items fall back to
  "all false → SKIP", which is not the demo we want.
- Open the scanner with `?demo=1` for every recorded scan. That shows the prop
  photos instead of a live camera feed (no black screen, no permission prompt).
- Use a fresh browser context (or keep the same context for both chapters).
- The app must be booted once before seeding so the anonymous household exists.

---

## 2. Seed / reset API

The app stores its device id in `localStorage` under `htc-device-id` and sends
it as `X-Device-Id` on every request. All demo endpoints are available in the
production build (they are not dev-gated).

| Action | Request |
|---|---|
| Truly empty household | `POST /api/demo/reset` |
| Full demo (resets first) | `POST /api/demo/seed` |

`POST /api/demo/seed` returns `{ ok: true, listId }`. The `listId` is the
seeded **Weekly shop** list.

A seed helper the agent can adapt (run it inside the page context so it uses
the same device id):

```ts
async function seed(page, scene: "empty" | "full") {
  const result = await page.evaluate(async (scene) => {
    const deviceId = localStorage.getItem("htc-device-id");
    const path = scene === "empty" ? "/api/demo/reset" : "/api/demo/seed";
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": deviceId,
      },
      body: "{}",
    });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  }, scene);
  await page.reload(); // drop stale React Query data
  return result;
}
```

Wait for the Mode screen ("Shopping Mode" / "Pantry Mode" / "Grocery List")
before the first seed call, then reload after it.

### What "empty" means

The household has **no products, purchases, insights, scans, corrections or
lists**. The global `product_knowledge` enrichment cache is intentionally kept
warm, so the first receipt still gets shelf-life classes and alternatives.
Do not clear `product_knowledge`; that is what makes the first-receipt chapter
work on a fresh database.

---

## 3. Data reference

### 3.1 First-receipt fixture (`public/fixtures/receipt-1.json`)

| Line | Canonical | Category | Brand | Pack | Price |
|---|---|---|---|---|---|
| Milk 1L | milk | dairy | Dairy Pure | 1 L | €1.40 |
| White bread 500g | bread | bread | — | 500 g | €2.10 |
| Eggs 10pcs | eggs | eggs | — | 10 pcs | €3.10 |
| Olive oil 500ml | olive oil | oils | Borges | 500 ml | €6.00 |
| Greek yogurt 500g | yogurt | dairy | Fage | 500 g | €2.00 |
| Chicken breast 500g | chicken breast | meat | — | 500 g | €6.50 |

All six are confirmed at "now". One purchase each.

### 3.2 Full scene

Products and history (all dates relative to seed time):

| Product | Shelf life | Purchases (days ago) | Demo role |
|---|---|---|---|
| Milk | perishable | 21, 16, 11, 6 | BUY (due, T=5d) |
| Bread | perishable | 9, 5, 1 | SWAP (wholegrain, no €) |
| Eggs | perishable | 9, 2 | nothing (stocked, never SKIP) |
| Rice | staple | 70, 40, 10 | SKIP with €2.60 last price |
| Olive oil | staple | 70 Borges 500 ml €6, 52 store 1 L €8, 35 Borges 500 ml €6 | BUY + **SWAP €2.00** |
| Laundry detergent | household | 95 20-wash €7.50, 80 40-wash €11, 30 20-wash €7.50 | **SWAP €2.00** |
| Coffee | staple | 60 Lavazza 250 g €4.50, 40 store 500 g €6, 15 Lavazza 250 g €4.50 | **SWAP €1.50** |
| Trash bags | household | 130 €3.00, 70 €3.20 | BUY + auto-add |
| Cooking oil | staple | 85 €2.50, 45 €2.60 | BUY + auto-add |
| Dish soap | household | 90, 50, 10 | SKIP hold |
| Toothpaste | household | 135, 75, 15 | SKIP hold |
| Yogurt | perishable | 8, 2 | list/camera match |
| Steel water bottle | durable | 90 | SKIP (strongest hold) |
| Toilet paper | household | 50, 20 | getting low, no claim |

**Expected full briefing** (order within a group is not guaranteed):

- Alert: `🛒 Hold That Cart! You already have 4 of these.`
- **BUY — probably due**: Trash bags, Cooking oil, Olive oil, Milk
- **SKIP — probably stocked**: Rice, Dish soap, Toothpaste, Steel water bottle
- **SWAP — better options**:
  - Olive oil — `≈ €2.00 / trip (your receipts)`
  - Laundry detergent — `≈ €2.00 / trip (your receipts)`
  - Coffee — `≈ €1.50 / trip (your receipts)`
- Tags visible on SWAP cards: money + planet.

**Expected full Pantry section totals:** 14 items — 7 Buy, 6 Skip, 1 Swap.

- Buy: Yogurt (money+health+planet), Trash bags (money+planet), Coffee
  (money+health+planet), Laundry detergent (money+planet), Eggs (money+health),
  Bread (health+planet), Milk (money+health)
- Skip: Toilet paper (money), Steel water bottle (planet), Toothpaste
  (money+planet), Dish soap (planet), Cooking oil (money+health), Rice (planet)
- Swap: Olive oil → "Store-brand olive oil"

**Seeded grocery list ("Weekly shop", 9 items):**

| Item | Qty | Source | State |
|---|---|---|---|
| Bananas | 2 | manual | |
| Bread | 1 | voice | brand Hovis |
| Yogurt | 2 | camera | brand Fage |
| Rice | 1 | scan | |
| Dish soap | 1 | manual | |
| Toothpaste | 1 | manual | |
| Steel water bottle | 1 | manual | |
| Saffron | 1 | manual | unknown item |
| Eggs | 1 | manual | **checked**, "I need it" |

`lastPantryRefreshAt` is null. The **first `/quick-view` open** runs the
3-day sweep and adds 5 auto items:

`milk`, `olive oil`, `coffee`, `trash bags`, `cooking oil`

QuickView then shows: `5 items added from your pantry` + **Undo**.

**List evaluation (`/lists/:id`) after the sweep:** 4 holds —

- Rice, Dish soap, Toothpaste, Steel water bottle → **SKIP**
- Everything else: Bread/Yogurt/Milk/coffee/olive oil → SWAP (model swaps,
  no € in this view), Bananas/Saffron/Eggs/cooking oil/trash bags → BUY

**Cart fixture (`public/fixtures/cart-1.json`):** Milk bottle, Chips ×2, Rice,
Steel bottle, Dish soap, Toothpaste → confirm gives a new list with **4 holds**
(Rice, Steel bottle, Dish soap, Toothpaste).

**List fixture (`public/fixtures/list-1.json`):** Milk, Eggs, Rice, Dish soap,
Toothpaste, Bananas → confirm gives a new list with **3 holds** (Rice, Dish
soap, Toothpaste).

### 3.3 Expected first-receipt state

- Pantry: 6 cards (Milk, Bread, Eggs, Olive oil, Yogurt, Chicken breast), one
  purchase each, tags from classification. Exact Buy/Skip/Swap split depends on
  Muse's scores — assert the cards and tags render, not the split.
- Briefing: **BUY 0, SKIP 0, holdCount 0**, and 3 model SWAPs:
  Milk (larger carton, planet), Bread (wholegrain, health), Olive oil (store
  brand, planet). **No `€` savings anywhere.**
- Grocery list: empty (no item is 3/14/60 days old yet), no auto-add banner.
- Product detail (Milk/Bread/Olive oil): enrichment alternatives present; one
  purchase in history; no "Variants you've bought" with two variants.

### 3.4 Demo-camera props

The scanner has a demo-camera mode so the recorded video never shows a black
video element:

| URL | Preview |
|---|---|
| `/scanner?demo=1` | Receipt mode → `public/fixtures/receipt-demo.jpeg` |
| `/scanner?demo=1` then **Cart** | Cart mode → `public/fixtures/cart-demo.jpeg` |
| `/scanner?demo=receipt` | Same, opens in Receipt mode |
| `/scanner?demo=cart` | Same, opens in Cart mode |

- The live camera is not started in demo mode.
- The scan beam animates over the photo.
- **Take photo** keeps the photo on screen, shows "Reading…", then loads the
  deterministic JSON fixture (no vision API call). The visible button text is
  `Take photo`; its accessible name is `Take receipt photo` / `Take cart photo`.
- **Retake photo** returns to the prop photo.
- The photos are visual props. The detections come from
  `receipt-1.json` / `cart-1.json`, so they are **not expected to match the
  photo line-for-line**. The cart photo is a real cart; the curated cart
  fixture is what produces the 4-hold story.
- The old **Use demo receipt/cart** buttons still exist as a fallback.

### 3.5 Dev-menu fixture shortcuts (dev only)

When running `pnpm run dev`, the gear menu has a **Demo fixtures** group:

| Button | URL | Result |
|---|---|---|
| Receipt fixture | `/scanner?demo=1&fixture=receipt` | receipt prop + fixture auto-loaded |
| Cart fixture | `/scanner?demo=1&fixture=cart` | cart prop + fixture auto-loaded |
| List fixture | `/scanner?fixture=list` | live camera + fixture auto-loaded |

These are one-click shortcuts for manual testing. They are **not** part of the
production recording flow; the production scenario still uses the explicit
steps in chapters 4 and 5. The list fixture has no prop photo, so it uses the
live camera (and shows the camera error in headless Chromium).

---

## 4. Chapter 1 — Empty → first receipt

Goal: show the cold start and that one receipt is enough to produce
type-level swaps without inventing savings or holds.

| # | Action | Expected |
|---|---|---|
| 1 | `goto("/")` and wait for the three mode cards | Mode screen |
| 2 | `seed(page, "empty")` | household empty, knowledge warm |
| 3 | `goto("/pantry")` | "Pantry is empty. Scan a receipt to add items." |
| 4 | `goto("/scanner?demo=1")` | Cart Radar, scan type **Receipt** selected; receipt photo in the frame, no camera prompt |
| 5 | Click **Take photo** | photo is captured, "Reading…", then "Detected (receipt)" and 6 rows |
| 6 | Click **Confirm → add to pantry** | button shows "Classifying items…"; waits; lands on `/pantry` |
| 7 | Show the Pantry cards | 6 cards with tags; open **Milk** to show alternatives + one-purchase history |
| 8 | `goto("/briefing")` | No hold alert; BUY/SKIP empty; 3 SWAP cards with **no €** |
| 9 | `goto("/quick-view")` | Empty list; no auto-add banner |

Optional beats:

- On a Milk/Bread product detail, show that "Enrich with Muse" is **not**
  offered (knowledge came from the warm cache) — the alternatives are already
  there.
- Save cart scanning for chapter 2. After only one receipt there is no stock
  history, so a cart would produce no holds.

---

## 5. Chapter 2 — Full demo

Goal: show the mature product: rhythm, holds, receipt-proven savings,
pantry sections, grocery list building, auto-add, and list evaluation.

| # | Action | Expected |
|---|---|---|
| 1 | `seed(page, "full")` | returns `listId`; household reset + seeded |
| 2 | `goto("/briefing")` | Hold alert **4**; 4 BUY / 4 SKIP / 3 SWAP; €2.00, €2.00, €1.50 |
| 3 | `goto("/pantry")` | Buy/Skip/Swap sections; tag chips lit/grey as listed above; "See more" if cards are clipped |
| 4 | Open **Olive oil** from Pantry | `Variants you've bought`: Borges €12.00/L vs Store brand €8.00/L; history; alternatives |
| 5 | Go back, open **Laundry detergent** | Variants: 20-wash ≈ €0.38/wash vs 40-wash ≈ €0.28/wash; cheaper-format suggestion |
| 6 | `goto("/quick-view")` | Auto banner: **5 items added from your pantry** + **Undo**; 14 rows; source labels voice/photo/pantry/scan; Eggs checked |
| 7 | Type `Chocolate` in "Add an item" and submit | new manual row |
| 8 | Check one row | "N in cart" count increments |
| 9 | Optional: click **Undo** | the 5 auto rows disappear; banner clears |
| 10 | Click **Check pantry** | `/lists/:id`: Hold alert **4**; row actions **I need it** / **Skip it** |
| 11 | `goto("/scanner?demo=1")` | Cart Radar, receipt prop visible |
| 12 | Click **Cart** | preview switches to the cart photo; scan beam still animates |
| 13 | Click **Take photo** | photo is captured, "Reading…", then "Detected (cart)" 6 rows |
| 14 | Click **Confirm → make list** | lands on a new `/lists/:id`; Hold alert **4** (Rice, Steel bottle, Dish soap, Toothpaste) |
| 15 | Optional: on `/lists/:id` click **I need it** on Rice | row is marked done/needs it |
| 16 | Optional corrections: `goto("/pantry")` → Rice → **I'm out** | `/briefing` now puts Rice in BUY (marked out) |
| 17 | Optional: `goto("/quick-view")` → **Clear list** → **Clear** | list empties in place, stays open |

If step 9 (Undo) is recorded, the auto rows are gone for the rest of the take.
For a retake, call `seed(page, "full")` again; it is idempotent.

---

## 6. Assertions the agent can rely on

Use these as Playwright assertions or recording checkpoints:

```text
Scanner demo:
  /scanner?demo=1     → prop receipt visible; no "Camera unavailable"
  Cart mode           → prop cart visible
  Take photo          → "Reading…" then "Detected (...)"
  (no getUserMedia permission prompt)

Empty:
  /pantry              → "Pantry is empty"
  /briefing            → no "Hold That Cart!" alert
  /quick-view          → "Nothing on the list yet"

First receipt:
  /pantry              → Milk, Bread, Eggs, Olive oil, Yogurt, Chicken breast
  /briefing            → Milk, Bread, Olive oil in SWAP; no "€"; holdCount 0
  /pantry/<milk>       → enrichment alternatives present; history length 1

Full:
  /briefing            → alert "4 of these"
                         BUY contains Milk, Olive oil, Cooking oil, Trash bags
                         SKIP contains Rice, Dish soap, Toothpaste, Steel water bottle
                         SWAP contains Olive oil, Laundry detergent, Coffee
                         SWAP shows "€2.00", "€2.00", "€1.50"
  /pantry              → total 14; Olive oil in Swap; Yogurt lights all 3 tags
  /pantry/<olive oil>  → "Borges" and "Store brand" variants; €12.00/L and €8.00/L
  /quick-view          → "5 items added from your pantry"; Undo
                         rows include milk, olive oil, coffee, trash bags, cooking oil (auto)
  /lists/<weekly>      → alert "4 of these"; Rice/Dish soap/Toothpaste/Steel bottle rows
  /scanner (cart)      → after confirm, new list alert "4 of these"
```

---

## 7. Recording notes and known quirks

- **Direct routes:** `/briefing` is not linked from the current UI. Navigate to
  it by URL. The scenario does not add any screens or navigation.
- **Seeding is API-only.** There is no demo button in the app. Call the
  endpoints from the page context and reload.
- **Full seed resets.** Chapter 2 wipes chapter 1; record them as separate
  takes or cut.
- **First receipt classification is live.** Confirmation calls Muse. Wait for
  `/pantry` (or the end of "Classifying items…"), not a fixed timeout. If Muse
  fails, the fallback marks every item SKIP and the first-receipt pantry looks
  flat — retake that step.
- **Camera:** always use `/scanner?demo=1`. It shows the prop receipt/cart
  photo and never starts `getUserMedia`, so there is no black preview and no
  permission prompt. Without `?demo=1`, headless Chromium may fail to open the
  camera.
- **The photos are props.** Detections come from the deterministic JSON
  fixtures, so the result list is not expected to match the photo line-for-line
  (the cart photo is a real cart; the curated fixture is what produces the
  4-hold story). This is accepted for the demo.
- **The camera button in `/quick-view` and the mic** need browser permissions
  and, for voice, a Chromium build with the Web Speech API. The core scenario
  does not require either; typed + demo scans are enough.
- **Reload after seeding** so React Query does not serve the previous
  household's cache.
- **Unknown items:** Bananas and Saffron have no pantry product. They appear as
  BUY on list evaluation; that is intentional ("new item, no claims").
- **Do not re-use `receipt-1.json` after the full seed.** Confirming it would
  overwrite the curated insights for Milk/Bread/Olive oil (latest insight wins).
  The full chapter already has history.
- **Savings are per-item.** There is no cumulative savings ledger or Analyse
  screen in this build. The € figures come only from receipt-derived
  unit-price comparisons.

---

## 8. Retake / reset

Between takes:

1. `POST /api/demo/reset` → empty + warm knowledge.
2. `POST /api/demo/seed` → full demo, idempotent.
3. `page.reload()` after either call.

The seeded list id is returned by `/api/demo/seed`; use it to open
`/lists/<id>` directly.
