import { Link } from "@tanstack/react-router";
import { productArtFor } from "../lib/productArt";
import { resolveItemArt } from "../lib/itemArt";

type TagKind = "money" | "health" | "planet";

const TAG_LABEL: Record<TagKind, string> = {
  money: "Saves money",
  health: "Healthier",
  planet: "Sustainable",
};

const FALLBACK_ART = resolveItemArt({
  rawName: "item",
  category: "other",
}).entry.url;

function PantryTag({ kind, on }: { kind: TagKind; on: boolean }) {
  return (
    <span className={`pantry-tag pantry-tag-${kind} ${on ? "is-on" : ""}`}>
      {TAG_LABEL[kind]}
    </span>
  );
}

export function PantryCard({ item }: { item: any }) {
  const tags = new Set<string>(item.tags ?? []);
  const tagOn = (kind: TagKind) => {
    const score = item.scores?.[kind];
    return typeof score === "number" ? score > 0.5 : tags.has(kind);
  };
  const art = item.category
    ? resolveItemArt({
        rawName: item.rawName,
        normalizedName: item.rawName,
        category: item.category,
        confidence: 0,
      }).entry.url
    : productArtFor(item.rawName, item.icon) ??
      resolveItemArt({
        rawName: item.rawName,
        category: "other",
      }).entry.url;

  const card = (
    <>
      <div className="pantry-card-main">
        <div className="pantry-card-art">
          <img
            src={art}
            alt={item.rawName}
            onError={(event) => {
              const img = event.currentTarget;
              if (img.dataset.fallback === "1") return;
              img.dataset.fallback = "1";
              img.src = FALLBACK_ART;
            }}
          />
        </div>
        <div className="pantry-card-tags">
          <PantryTag kind="money" on={tagOn("money")} />
          <PantryTag kind="health" on={tagOn("health")} />
          <PantryTag kind="planet" on={tagOn("planet")} />
        </div>
      </div>
      <div className="pantry-card-name">{item.rawName}</div>
      {item.swapTitle && <div className="dim">→ {item.swapTitle}</div>}
    </>
  );

  return item.productId ? (
    <Link
      className="pantry-card"
      to="/pantry/$productId"
      params={{ productId: item.productId }}
    >
      {card}
    </Link>
  ) : (
    <article className="pantry-card">{card}</article>
  );
}
