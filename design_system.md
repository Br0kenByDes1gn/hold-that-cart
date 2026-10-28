# Hold That Cart — Visual Design System

Source: the five mockup screens generated from the design prompts (Home, Scanner, Pantry, Analyse, Business). This document records the visual language, the copy language, every component, and the extracted assets (93 PNG files in `assets/`).

> **Read this first.** The assets are crops from a single screenshot, so they are small and low resolution (phone screens about 350 px wide, product images about 40 to 70 px). Use them as visual references and placeholders. For production, regenerate key art at high resolution (prompts in section 9) and rebuild text and UI in code, because generated images contain typos.

---

## 1. Concept

A clean, futuristic **loot-game** look for a grocery companion. Shopping lists, carts and receipts are "scanned" like loot. The pantry is an RPG-style **inventory** ("The Stash"). Each suggested swap is an **upgrade** carrying up to three **power tags**. The progress screen is a **character-stats** page.

| Real feature | Game metaphor | Screen name |
|---|---|---|
| Home | Mission select | Home |
| Scanner | Radar | Cart Radar |
| Pantry | Inventory | The Stash |
| Analyse | Stats | Your Impact |
| Duplicate found | Alert | "Hold That Cart!" |
| All three tags lit | Rare drop | Triple Match |

Platform: responsive web app, designed mobile-first at about 390 px wide (iPhone-sized, 9:16).

---

## 2. Voice and language

**Tone:** short, confident, game-like and friendly. Labels are 1 to 3 words. Sentences are under 10 words. Never lecture, shame food choices or score calories.

**Exact copy used in the mockups**

| Where | Copy |
|---|---|
| App name | HOLD THAT CART |
| Level title | Cart Commander, Level 4, 450 / 800 XP |
| Mode toggle | Household, Business |
| Hint bubble | Scan lists, carts or receipts to find better swaps! |
| Household cards | **Shopping Mode** (Scan a list, cart or receipt while you shop), **Pantry Mode** (Track what you have at home) |
| Business cards | **Cart** (Scan order summary or bulk list), **Pantry** (Track inventory and reorders) |
| Business hint | Manage your business purchases smarter |
| Scanner header | Cart Radar, "Scan your list, cart or receipt" |
| Alert | Hold That Cart! You already have 2 of these |
| Row hint | You have 2 at home |
| Pantry header | The Stash, "Your home pantry" |
| Pantry buttons | Analyse My Pantry, Add Receipt |
| Filters (household) | All, Favourites, Need Soon, Expired |
| Filters (business) | All, Low Stock, Need Soon |
| Rare card label | TRIPLE MATCH |
| Tags | Saves money, Healthier, Sustainable |
| Analyse header | Your Impact, "See how your choices make a difference" |
| Time ranges | This Week, This Month, All Time |
| Radar axes | Wallet (Save money), Planet (Be sustainable), Vitality (Be healthier) |
| Radar legend | Your current, Potential |
| Stats | Money saved, Health score, Sustainability score |
| Quests | WEEKLY QUESTS, "Make 5 healthier swaps this week", +200 XP |
| Business | BUSINESS PANTRY, Analyse Inventory, "Reorder every 12 days" |
| Tab bar (household) | Home, History, Stats, Quests, Profile (Pantry replaces History on the Pantry screen) |
| Tab bar (business) | Home, Orders, Pantry, Stats, Profile |

**Copy rules**
- Title Case for screen names and buttons, sentence case for hints.
- Currency is shown with the ₹ symbol. All figures in the mockups are placeholders.
- Savings and health text must be labeled as estimates in the real product.
- Fix the typo "Need Stoon" in the business filter chips.

---

## 3. Color

### 3.1 Brand tokens (canonical, from the prompt)

| Token | Hex | Use |
|---|---|---|
| `--money` | `#3b82f6` | "Saves money" tag, money stat, current-value line |
| `--health` | `#22c55e` | "Healthier" tag, health stat, potential line |
| `--planet` | `#f59e0b` | "Sustainable" tag, sustainability stat, Triple Match gold |
| `--alert` | `#ff3b5c` | "Hold That Cart!" alert, flagged item labels |
| `--tag-off` | flat gray (about `#4b5563`) | Tag that does not apply |

### 3.2 Surfaces (observed in the mockups, approximate)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#071a29` | Page background, deep space navy |
| `--bg-deep` | `#05141f` | Cards and recessed areas |
| `--tabbar` | `#020b14` | Bottom tab bar |
| `--alert-bg` | `#50151b` | Alert banner fill |
| `--xp` | `#ebad3f` | XP bar fill and XP chip gold |
| `--accent-cyan` | about `#38bdf8` | Active borders, glows, buttons, Business accent |

Observed from the image; confirm against your final tokens. In Business mode the look shifts slightly to a cooler steel and cyan.

### 3.3 Glow

- Glow is the signature effect. It appears on active tag chips, selected mode cards, the Triple Match card, the scan beam and the radar chart.
- Pattern: `box-shadow: 0 0 12px color@0.5, inset 0 0 8px color@0.15` on a 1 to 2 px border in the same hue.
- Inactive elements have **no glow** and sit flat.

### 3.4 CSS starter

```css
:root {
  --bg: #071a29;  --bg-deep: #05141f;  --tabbar: #020b14;
  --money: #3b82f6;  --health: #22c55e;  --planet: #f59e0b;
  --alert: #ff3b5c;  --tag-off: #4b5563;  --cyan: #38bdf8;
  --text: #e6f1ff;   --text-dim: #8aa4c0;
  --radius-card: 16px; --radius-pill: 999px;
}
```

---

## 4. Typography

| Role | Style | Notes |
|---|---|---|
| Headings, screen titles, wordmark, mode names | Chunky, squared techno display, all caps | Prompt: "chunky techno/pixel display font" |
| Body, labels, tags | Clean sans-serif | Small, high contrast on dark |
| Numbers (stats) | Bold display, large | Count-up animation |

Closest free matches (my suggestion, not extracted from the image): Rajdhani, Chakra Petch or Orbitron for display; Inter for body. Verify licensing and test legibility at small sizes.

---

## 5. Shape, spacing and layout

- Cards: solid dark fill, 1 to 2 px glowing border, **16 px radius**.
- Chips and buttons: **pill or 12 px radius**.
- Generous spacing; large tap targets (minimum 44 px).
- Single-column mobile layout. On desktop, keep the content in a centered column of about 480 px, and use a two-pane layout where useful (as in the Business home and pantry).
- Bottom **tab bar** with five items, outline icons, active item glows blue.
- Header pattern: back arrow on the left, centered title with a one-line subtitle, action icon (search, flash) on the right.

---

## 6. Tags (the core UI idea)

Every suggestion carries up to three tags. Each has a **leading icon plus a text label**, so color is never the only signal.

| Tag | Active color | Inactive |
|---|---|---|
| Saves money | Blue `--money` | Flat gray, no glow |
| Healthier | Green `--health` | Flat gray, no glow |
| Sustainable | Amber `--planet` | Flat gray, no glow |

- **Triple Match:** when all three tags are active, the card gets a gold glowing border and a crown "TRIPLE MATCH" label.
- Rows show tags in a horizontal line; pantry cards stack them vertically.

---

## 7. Game layer (kept restrained)

| Element | Where | Behavior |
|---|---|---|
| Level badge | Home header | Avatar, "Cart Commander", Level 4, XP bar with "450 / 800 XP" |
| XP rewards | Quests | "+200 XP" chip on completed quests |
| Weekly quests | Analyse | Progress bar and "3/5 complete" |
| Triple Match | Pantry | Gold border, crown label |
| Stat count-ups | Analyse | Numbers animate up, with ▲ percentage badges |

Guardrails: reward only verified actions (for example, a later receipt confirming a swap), no guilt-based streak loss, no calorie scoring, and offer a reduced-motion option.

---

## 8. Components and screens

### 8.1 Home ("Mission Select")
- Header: wordmark on the left, level badge on the right, mode toggle below.
- Hint bubble next to the mascot, then two large mode cards. The selected card has a **gold** border, the other cyan.
- Decorative strip at the bottom: planet and city skyline.
- Assets: `screens/01_home_household`, `brand/*`, `cards/shopping_mode_card`, `cards/pantry_mode_card`, `ui/toggle_household_business`, `ui/tab_bar_household_home`.

### 8.2 Scanner ("Cart Radar")
- Header with back and flash icons.
- Large camera viewport with corner brackets, a sweeping green scan beam, and floating item labels. Normal labels have blue or green outlines. A **flagged** item (a duplicate) has a red outline.
- Red alert banner "Hold That Cart!" with an item-count pill.
- Swap list: current item, arrow, suggested swap, three tags, trash icon.
- Assets: `screens/02_scanner_cart_radar`, `ui/scan_viewport`, `ui/label_*`, `ui/alert_hold_that_cart`, `ui/swap_row_*`.

### 8.3 Pantry ("The Stash")
- "Analyse My Pantry" button at the top, filter chips, then a two-column grid of item cards.
- Card: checkbox, product art, name, three tag chips. The Triple Match card has the gold border.
- "Add Receipt" button at the bottom, above the tab bar.
- Assets: `screens/03_pantry_the_stash`, `ui/card_*`, `ui/button_*`, `ui/filter_chips_pantry`.

### 8.4 Analyse ("Your Impact")
- Segmented control for time range.
- Glowing triangular radar chart: **Wallet** at the top, **Planet** at the bottom left, **Vitality** at the bottom right. Current shape in blue, larger potential shape in green.
- Three stat cards (blue, green, amber) with a badge, big number, label and ▲ change.
- Weekly quests card with progress bar and XP reward.
- Assets: `screens/04_analyse_your_impact`, `ui/radar_*`, `ui/stat_*`, `ui/weekly_quests_card`, `icons/*`.

### 8.5 Business mode
- Same layout as household, in a cooler mission-control tone. The toggle shows **Business** active, and the badge reads "Business Pro".
- Two cards only: **Cart** and **Pantry**.
- Business pantry rows add a "Reorder every 12 days" column with a circular-arrow icon.
- Assets: `screens/05_business_home_and_pantry`, `brand/*business*`, `cards/business_*`, `ui/business_row_*`, `ui/tab_bar_business`.

---

## 9. Image style and regeneration prompts

**Imagery style:** glossy, softly glowing 3D or isometric objects on dark navy. Hero props sit on glowing platforms. Food and product images are bright, centered, with soft cyan rim light. Product shots have dark backgrounds that blend into the card.

**Regenerate at high resolution (suggested prompts)**

```
Isometric glowing holographic clipboard on a glass platform, cyan and blue neon edges, dark navy background, clean sci-fi UI icon style, 1024x1024, no text.
```
```
Stack of cardboard boxes on a glowing isometric platform, icy blue neon rim light, dark navy background, sci-fi game UI icon, 1024x1024, no text.
```
```
Glowing receipt in a scanner frame with fresh vegetables, neon corner brackets, dark navy background, game UI hero art, 1024x1024, no text.
```
```
Set of generic grocery product icons on a dark navy background, soft cyan rim light, centered, glossy game-inventory style: rice bag, lentils, onions, tomatoes, milk, yogurt, bread, oat milk, nuts. Generic packaging only, no brand names or logos, no text. Each item separate, 512x512.
```

---

## 10. Notes and cautions

1. **Mascot.** The generated screens include a robot mascot (`brand/mascot_*`, `brand/avatar_helmet_icon`). An earlier requirement said no robot or explainer character. Decide whether to keep it. If not, remove those three assets and the hint bubble.
2. **Real brand in artwork.** `items/lays_chips` shows a real brand logo. Don't ship it. Replace with generic packaging.
3. **Garbled text.** Generated images contain small typos ("Need Stoon") and tiny text. Rebuild all text in code.
4. **Low resolution.** Do not scale these assets up for production use.
5. **Accessibility.** Every tag needs an icon and a text label. Verify contrast of small gray text on dark navy against 4.5:1. Provide a reduced-motion setting for glow pulses, scan beam and count-ups.
6. **Placeholder data.** Sample figures (₹1,240, +38, +52, 12 days) are illustrative only.

---

## 11. Asset manifest

93 files, organized by folder.

### Screens
| File | Size (px) | What it is |
|---|---|---|
| `assets/screens/01_home_household.png` | 354×672 | Home screen, Household mode ("Mission Select") |
| `assets/screens/02_scanner_cart_radar.png` | 352×672 | Scanner screen ("Cart Radar") with alert and swap rows |
| `assets/screens/03_pantry_the_stash.png` | 354×672 | Pantry screen ("The Stash") with Triple Match card |
| `assets/screens/04_analyse_your_impact.png` | 468×520 | Analyse screen ("Your Impact") with radar chart, stats, quests |
| `assets/screens/05_business_home_and_pantry.png` | 630×520 | Business mode: home and business pantry side by side |

### Brand
| File | Size (px) | What it is |
|---|---|---|
| `assets/brand/avatar_helmet_icon.png` | 48×46 | Round helmet avatar icon |
| `assets/brand/level_badge_business_pro.png` | 150×50 | Business level badge ("Business Pro", Level 4) |
| `assets/brand/level_badge_cart_commander.png` | 164×67 | Level badge with avatar, title, level, XP bar and XP count |
| `assets/brand/logo_business.png` | 122×50 | Wordmark crop from Business home |
| `assets/brand/logo_hold_that_cart.png` | 144×52 | Wordmark, stacked "HOLD THAT CART" (household header) |
| `assets/brand/mascot_robot_business.png` | 150×77 | Robot mascot in warehouse scene (see note on mascot) |
| `assets/brand/mascot_robot_with_cart.png` | 127×106 | Robot mascot with shopping cart (see note on mascot) |
| `assets/brand/speech_bubble_scan_lists.png` | 190×60 | Hint bubble: "Scan lists, carts or receipts to find better swaps!" |

### UI components
| File | Size (px) | What it is |
|---|---|---|
| `assets/ui/alert_hold_that_cart.png` | 332×55 | Red alert banner "Hold That Cart!" with item count pill |
| `assets/ui/business_row_cleaning_spray.png` | 274×64 | Business pantry row with reorder rhythm |
| `assets/ui/business_row_dish_soap.png` | 274×62 | Business pantry row with reorder rhythm |
| `assets/ui/business_row_paper_towels.png` | 274×62 | Business pantry row with reorder rhythm |
| `assets/ui/business_row_toilet_paper.png` | 274×60 | Business pantry row with reorder rhythm |
| `assets/ui/business_row_trash_bags.png` | 274×64 | Business pantry row with reorder rhythm |
| `assets/ui/button_add_receipt.png` | 328×47 | Primary outline button with document icon |
| `assets/ui/button_analyse_inventory.png` | 270×35 | Business version of the Analyse button |
| `assets/ui/button_analyse_my_pantry.png` | 328×43 | Primary outline button with bar-chart icon |
| `assets/ui/card_pantry_milk.png` | 162×118 | Pantry card with one gray (inactive) tag |
| `assets/ui/card_pantry_onions.png` | 162×118 | Pantry card with one gray (inactive) tag |
| `assets/ui/card_pantry_rice.png` | 162×118 | Standard pantry card, three tags lit |
| `assets/ui/card_pantry_tomatoes.png` | 162×118 | Pantry card, three tags lit |
| `assets/ui/card_pantry_yogurt.png` | 162×118 | Pantry card with one gray (inactive) tag |
| `assets/ui/card_triple_match_lentils.png` | 167×118 | Pantry card with gold Triple Match border and crown label |
| `assets/ui/filter_chips_business.png` | 272×28 | Filter chips: All, Low Stock, Need Soon |
| `assets/ui/filter_chips_pantry.png` | 332×32 | Filter chips: All, Favourites, Need Soon, Expired |
| `assets/ui/header_business_pantry.png` | 275×30 | Business pantry header with search icon |
| `assets/ui/header_cart_radar.png` | 342×50 | Scanner screen header with back and flash icons |
| `assets/ui/header_the_stash.png` | 346×50 | Pantry screen header with back and search icons |
| `assets/ui/header_your_impact.png` | 440×45 | Analyse screen header |
| `assets/ui/label_bananas.png` | 92×38 | Detected-item label, normal (blue outline) |
| `assets/ui/label_chips_alert.png` | 88×42 | Detected-item label, flagged (red outline) |
| `assets/ui/label_eggs.png` | 66×37 | Detected-item label, normal (green outline) |
| `assets/ui/label_milk.png` | 74×42 | Detected-item label, normal (green outline) |
| `assets/ui/radar_chart_wallet_planet_vitality.png` | 380×200 | Triangle radar chart with Wallet, Planet, Vitality axes |
| `assets/ui/radar_legend.png` | 108×50 | Legend: Your current (blue), Potential (green) |
| `assets/ui/scan_viewport.png` | 331×246 | Camera viewport with corner brackets, scan beam and floating labels |
| `assets/ui/segmented_this_week.png` | 349×28 | Segmented control: This Week, This Month, All Time |
| `assets/ui/stat_health_score.png` | 138×90 | Stat card, green border, heart badge |
| `assets/ui/stat_money_saved.png` | 136×90 | Stat card, blue border, piggy-bank badge |
| `assets/ui/stat_sustainability_score.png` | 148×90 | Stat card, amber border, leaf badge |
| `assets/ui/swap_row_bread_to_wholegrain.png` | 328×77 | Swap row with all three tags lit |
| `assets/ui/swap_row_chips_to_nuts.png` | 328×73 | Swap row with two tags lit, one gray |
| `assets/ui/swap_row_milk_to_oat.png` | 328×74 | Swap row with two tags lit, one gray |
| `assets/ui/tab_bar_business.png` | 315×55 | Business bottom tab bar (Home, Orders, Pantry, Stats, Profile) |
| `assets/ui/tab_bar_household_home.png` | 350×58 | Bottom tab bar, Home active |
| `assets/ui/tab_bar_household_pantry.png` | 346×57 | Bottom tab bar, Pantry active |
| `assets/ui/toggle_business_active.png` | 284×34 | Mode toggle, Business active |
| `assets/ui/toggle_household_business.png` | 315×37 | Mode toggle, Household active |
| `assets/ui/weekly_quests_card.png` | 440×82 | Weekly quests card with progress bar and +200 XP chip |

### Mode cards and hero art
| File | Size (px) | What it is |
|---|---|---|
| `assets/cards/art_business_boxes.png` | 134×96 | Hero art: stacked boxes on a platform |
| `assets/cards/art_business_clipboard.png` | 110×96 | Hero art: holographic clipboard on a platform |
| `assets/cards/art_pantry_jars_shelf.png` | 126×126 | Hero art: jar shelf in a glowing frame |
| `assets/cards/art_shopping_receipt_veg.png` | 118×130 | Hero art: glowing receipt with vegetables in a scanner frame |
| `assets/cards/bg_planet_skyline.png` | 350×72 | Decorative strip: planet and city skyline |
| `assets/cards/business_cart_card.png` | 152×206 | Business mode card: Cart |
| `assets/cards/business_pantry_card.png` | 146×206 | Business mode card: Pantry |
| `assets/cards/pantry_mode_card.png` | 164×284 | Mode card, cyan border |
| `assets/cards/shopping_mode_card.png` | 164×284 | Mode card, gold highlight (selected) |

### Product images
| File | Size (px) | What it is |
|---|---|---|
| `assets/items/cleaning_spray.png` | 39×52 | Product art: cleaning spray bottle |
| `assets/items/dish_soap.png` | 36×55 | Product art: dish soap bottle |
| `assets/items/lays_chips.png` | 46×64 | Product art: chips bag (shows a real brand logo, see notes) |
| `assets/items/lentils_jar.png` | 56×76 | Product art: lentils in a bag |
| `assets/items/milk_bottle.png` | 52×76 | Product art: milk bottle |
| `assets/items/oat_milk_carton.png` | 40×40 | Product art: oat milk carton |
| `assets/items/onions.png` | 60×82 | Product art: onions |
| `assets/items/paper_towels.png` | 39×58 | Product art: paper towel roll |
| `assets/items/rice_bag.png` | 54×78 | Product art: rice in a clear bag |
| `assets/items/roasted_nuts.png` | 40×38 | Product art: roasted nuts pack |
| `assets/items/toilet_paper.png` | 41×46 | Product art: toilet paper rolls |
| `assets/items/tomatoes.png` | 64×76 | Product art: tomatoes |
| `assets/items/trash_bags.png` | 42×54 | Product art: trash bag rolls |
| `assets/items/white_bread.png` | 44×65 | Product art: white bread loaf |
| `assets/items/whole_grain_bread.png` | 38×38 | Product art: whole grain bread bag |
| `assets/items/whole_milk_carton.png` | 39×68 | Product art: whole milk bottle |
| `assets/items/yogurt_tub.png` | 60×68 | Product art: yogurt tub |

### Icons and badges
| File | Size (px) | What it is |
|---|---|---|
| `assets/icons/axis_planet.png` | 38×34 | Radar axis icon: Planet |
| `assets/icons/axis_vitality_heart.png` | 36×34 | Radar axis icon: Vitality |
| `assets/icons/axis_wallet.png` | 36×36 | Radar axis icon: Wallet |
| `assets/icons/badge_health_heart.png` | 42×42 | Badge: health score (green) |
| `assets/icons/badge_piggy_bank.png` | 42×44 | Badge: money saved (blue) |
| `assets/icons/badge_sustain_leaf.png` | 44×44 | Badge: sustainability score (amber) |
| `assets/icons/quest_target.png` | 46×42 | Quest icon: target |
| `assets/icons/tab_history.png` | 44×32 | Tab icon: History |
| `assets/icons/tab_home.png` | 44×32 | Tab icon: Home (active, blue glow) |
| `assets/icons/tab_profile.png` | 44×32 | Tab icon: Profile |
| `assets/icons/tab_quests.png` | 46×32 | Tab icon: Quests |
| `assets/icons/tab_stats.png` | 44×32 | Tab icon: Stats |
| `assets/icons/xp_star_badge.png` | 62×30 | XP reward chip: +200 XP |
