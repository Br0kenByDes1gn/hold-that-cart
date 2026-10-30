import { useEffect, useState } from "react";
import { productArtFor } from "./lib/productArt";

export interface IconEntry {
  slug: string;
  file: string;
  category: string;
  label: string;
  exists: boolean;
}

let cache: IconEntry[] | null = null;

export function useIconRegistry() {
  const [icons, setIcons] = useState<IconEntry[] | null>(cache);
  useEffect(() => {
    if (cache) return;
    fetch("/icons/products/icons.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => {
        cache = j;
        setIcons(j);
      })
      .catch(() => setIcons([]));
  }, []);
  return icons ?? [];
}

export function iconFor(name: string, explicitIcon?: string | null, icons: IconEntry[] = []): string | null {
  if (explicitIcon) {
    const f = `icons/products/${explicitIcon}.png`;
    return f;
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const hit = icons.find((i) => i.slug === slug && i.exists);
  if (hit) return hit.file;
  // token fallback: any icon sharing a word
  const words = new Set(slug.split("-"));
  const partial = icons.find((i) => i.exists && i.slug.split("-").some((w) => words.has(w)));
  return partial ? partial.file : null;
}

export function TagChip({ kind, on }: { kind: "money" | "health" | "planet"; on: boolean }) {
  const label = kind === "money" ? "Saves money" : kind === "health" ? "Healthier" : "Sustainable";
  const icon = kind === "money" ? "◉" : kind === "health" ? "♥" : "❋";
  return (
    <span className={`tag ${on ? `on-${kind}` : ""}`}>
      <span aria-hidden>{icon}</span> {label}
    </span>
  );
}

export function Tags({ tags }: { tags: string[] }) {
  const set = new Set(tags);
  return (
    <div className="tags">
      <TagChip kind="money" on={set.has("money")} />
      <TagChip kind="health" on={set.has("health")} />
      <TagChip kind="planet" on={set.has("planet")} />
    </div>
  );
}

export function ProductArt({ name, icon, icons, size = 56 }: { name: string; icon?: string | null; icons: IconEntry[]; size?: number }) {
  const local = productArtFor(name, icon);
  const registrySrc = local ? null : iconFor(name, icon, icons);
  const src = local ?? (registrySrc ? `/${registrySrc}` : null);
  if (!src) return <div className="art-fallback" style={{ width: size, height: size }}>📦</div>;
  return <img src={src} alt={name} width={size} height={size} className="art" loading="lazy" />;
}
