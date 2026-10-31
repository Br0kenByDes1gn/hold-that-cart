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

export function productArtFor(
  name?: string | null,
  icon?: string | null,
): string | null {
  return productArtEntry(name, icon)?.url ?? null;
}
