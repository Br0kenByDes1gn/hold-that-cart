// Pure string normalization + knowledge-key helpers. No AI, no I/O.
export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function singularize(word: string): string {
  if (word.endsWith("ss")) return word;
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("es") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && word.length > 3) return word.slice(0, -1);
  return word;
}

export function tokens(name: string): string[] {
  return normalizeName(name)
    .split(" ")
    .filter(Boolean)
    .map(singularize);
}

/** Stable cache key for product_knowledge: name + brand/form (packaging matters). */
export function knowledgeKey(name: string, brand?: string, form?: string): string {
  const parts = [normalizeName(name)];
  if (brand) parts.push(`brand:${normalizeName(brand)}`);
  if (form) parts.push(`form:${normalizeName(form)}`);
  return parts.join("|");
}

/** Slug for icon lookup + catalog keys: "olive oil" -> "olive-oil". */
export function slugify(name: string): string {
  return (
    normalizeName(name).replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "unknown"
  );
}
