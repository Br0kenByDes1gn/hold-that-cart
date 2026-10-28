# What to fix

1. **Bring back “hold that cart.”** When a list or cart is scanned, check it against the pantry first and put “You already have 2 of these” at the top of the results. It’s your name and your edge.

Not every item gets an “already have” check

| Item type | Examples | What the app does |
| ----- | ----- | ----- |
| **Perishables** (days) | Milk, bread, vegetables | Never says “you already have this.” Only suggests swaps |
| **Staples** (weeks) | Rice, oil, flour | Soft flag only when bought recently, shown with an estimate |
| **Household consumables** (1 to 3 months) | Detergent, soap | Flags when recently bought |
| **Durables** (years) | Steel bottle, containers, cutlery, bags | Strongest “hold that cart” alerts, because duplicates here are the real waste |

2. **Ground the suggestions.** The model shouldn’t invent products or prices.  
   * Suggest swap *types* (loose instead of packaged, refill, store brand, larger pack).  
   * Calculate “saves money” from the user’s own receipt history, such as unit-price comparisons.  
   * Base “healthier” on a nutrition database, not model opinion. Open Food Facts is one open option, but check its coverage for your region.  
   * Base “sustainable” on your own scoring formula.

Show **one pre-shop briefing** when the user taps “Start shopping” or opens the scanner, with a hard cap:

| Section | What it shows | Limit |
| ----- | ----- | ----- |
| **BUY** | Items probably due, so the app writes your list for you; The BUY section is a ready-made shopping list built from the user’s rhythm, and the user can add anything else manually | Top 8 |
| **SKIP** | Items you probably still have, with the money you’d save | Top 3 to 5 |
| **SWAP** | The best upgrades, with the money, health and planet tags | Top 3 |

Everything else sits behind “See all 27 items.”

3. **Treat the cart photo as the hardest input.** Items are stacked and labels are hidden. Make the list and receipt the reliable paths. For carts, show what was detected and let the user correct it.  
4. **Never claim all three tags.** They rarely align. Lighting only the ones that apply is the honest way, so keep that.  
5. **Seed demo data for business mode.** Frequency suggestions need weeks of history, so use clearly labeled simulated data.  
6. **Define “Analyse” precisely.** Three numbers: money saved against a baseline, health score change, sustainability score change, all computed from purchases confirmed by later receipts.

### 

# How it learns, with simple math in code

For each item:

* **Typical interval (T):** the median gap between purchases, once there are at least two gaps. Before that, use a default for the category, scaled by household size.  
* **Days since last purchase (d):** from the receipt date.

| Condition | Status |
| ----- | ----- |
| d is under 60% of T | Probably stocked (SKIP candidate) |
| d is between 60% and 100% of T | Getting low |
| d is over 100% of T | Due (BUY) |

# Cold start: value from the first scan

| Stage | What the user gets |
| ----- | ----- |
| **Day 0, no history** | Swap suggestions and the three tags on whatever they scan, which needs no history. Ask two quick questions: household size, and how often they shop |
| **After 1 receipt** | “Due soon” estimates from category defaults, labeled as estimates |
| **After 2 to 3 receipts** | Personal rhythm, with stronger and more accurate flags |

**Optional boost:** a 5-second **shelf photo** lets vision check what’s actually stocked and correct the estimates. It’s useful but never required.

# Keep it trustworthy and quiet

* **Show confidence.** Only flag items with enough history, and label everything “probably.”  
* **One-tap corrections:** “I’m out” removes a skip flag instantly. “Never remind me about this” mutes it.  
* **Learn from corrections,** so flags improve with use.  
* **Verify the saving.** Count “saved by skipping” only when the next receipt confirms the item wasn’t bought.  
* **Be upfront about blind spots:** cash purchases, online orders, guests and festivals are invisible to the app, so these are estimates, not facts.

