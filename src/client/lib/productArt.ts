// Product images live in assets/item. Vite bundles them and gives us hashed
// URLs, so the app never depends on the generated public/icons/products
// folder being present.

const modules = import.meta.glob<string>("../../../assets/item/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

export interface ProductArtEntry {
  slug: string;
  file: string;
  url: string;
}

interface ArtEntry extends ProductArtEntry {
  tokens: Set<string>;
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/ background removed\.png$/i, "")
    .replace(/\.png$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const entries: ArtEntry[] = Object.entries(modules)
  .map(([path, url]) => {
    const file = path.split("/").pop() ?? "";
    const slug = toSlug(file);
    return { slug, file, tokens: new Set(slug.split("-").filter(Boolean)), url };
  })
  .filter((entry) => entry.slug.length > 0);

const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));

// Names that cannot be inferred by token matching alone.
const ALIASES: Record<string, string> = {
  milk: "milk-glass-and-carton",
  banana: "fruit-assortment",
  bananas: "fruit-assortment",
  fruit: "fruit-assortment",
  bread: "bread-loaf",
  rice: "rice-grains-bowl",
  chicken: "raw-chicken",
  beef: "beef-steak",
  steak: "beef-steak",
  salmon: "salmon-fillet",
  coffee: "coffee-jar",
  tea: "tea-box",
  honey: "honey-jar",
  "peanut-butter": "peanut-butter",
  "olive-oil": "olive-oil",
  "laundry-detergent": "laundry-detergent",
  "toilet-paper": "toilet-paper",
  wine: "alcohol-bottle-icon",
  beer: "alcohol-bottle-icon",
  whiskey: "alcohol-bottle-icon",
  whisky: "alcohol-bottle-icon",
  vodka: "alcohol-bottle-icon",
  rum: "alcohol-bottle-icon",
  gin: "alcohol-bottle-icon",
  prosecco: "alcohol-bottle-icon",
  champagne: "alcohol-bottle-icon",
  liqueur: "alcohol-bottle-icon",
  seedlip: "alcohol-bottle-icon",
  "pet-food": "pet-food-icon",
  "dog-food": "pet-food-icon",
  "cat-food": "pet-food-icon",
  cola: "cola-bottle",
  pepsi: "cola-bottle",
  sprite: "cola-bottle",
  soda: "cola-bottle",
  "soft-drink": "cola-bottle",
  water: "plastic-water-bottle",
  juice: "juice-carton",
  "orange-juice": "orange-juice-carton",
  "apple-juice": "apple-juice-carton",
};

function publicEntry(entry: ArtEntry): ProductArtEntry {
  return { slug: entry.slug, file: entry.file, url: entry.url };
}

export function productArtEntryBySlug(slug: string): ProductArtEntry | null {
  const entry = bySlug.get(toSlug(slug));
  return entry ? publicEntry(entry) : null;
}

/**
 * Resolve a product name and/or icon slug to a bundled image entry.
 * Tries the explicit icon first, then the product name, then shared tokens.
 */
export function productArtEntry(
  name?: string | null,
  icon?: string | null,
): ProductArtEntry | null {
  const candidates = [icon, name]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => toSlug(value));

  for (const slug of candidates) {
    const alias = ALIASES[slug];
    if (alias && bySlug.has(alias)) return publicEntry(bySlug.get(alias)!);
    const exact = bySlug.get(slug);
    if (exact) return publicEntry(exact);
  }

  for (const slug of candidates) {
    const words = [...new Set(slug.split("-"))].filter(
      (word) => word.length > 2 && word !== "the",
    );
    if (words.length === 0) continue;

    let best: { entry: ArtEntry; score: number } | null = null;
    for (const entry of entries) {
      const score = words.reduce(
        (total, word) => total + (entry.tokens.has(word) ? 1 : 0),
        0,
      );
      if (score > 0 && (!best || score > best.score)) {
        best = { entry, score };
      }
    }
    if (best) return publicEntry(best.entry);
  }

  return null;
}

/** Exact/alias lookup only — no fuzzy token matching. */
export function productArtExact(
  name?: string | null,
  icon?: string | null,
): ProductArtEntry | null {
  const candidates = [icon, name]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => toSlug(value));

  for (const slug of candidates) {
    const alias = ALIASES[slug];
    if (alias && bySlug.has(alias)) return publicEntry(bySlug.get(alias)!);
    const exact = bySlug.get(slug);
    if (exact) return publicEntry(exact);
  }
  return null;
}

export function productArtFor(
  name?: string | null,
  icon?: string | null,
): string | null {
  return productArtEntry(name, icon)?.url ?? null;
}
