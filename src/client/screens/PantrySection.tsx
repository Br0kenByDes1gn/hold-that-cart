import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../api";
import { PantryCard } from "../components/PantryCard";
import {
  sortSectionItems,
  type PantrySectionId,
} from "../lib/pantryVisibility";

const TITLES: Record<PantrySectionId, string> = {
  buy: "Buy",
  skip: "Skip",
  swap: "Swap",
};

const SECTIONS: PantrySectionId[] = ["buy", "skip", "swap"];

export function PantrySectionScreen({ section }: { section: string }) {
  const sectionId = SECTIONS.includes(section as PantrySectionId)
    ? (section as PantrySectionId)
    : null;
  const q = useQuery({
    queryKey: ["pantry", "sections"],
    queryFn: api.pantrySections,
  });

  if (!sectionId) {
    return (
      <div className="main">
        <p className="error">Unknown pantry section.</p>
        <Link to="/pantry" className="btn">Back to Pantry</Link>
      </div>
    );
  }

  const items = sortSectionItems(sectionId, q.data?.[sectionId] ?? []);

  return (
    <div className="main">
      <Link to="/pantry" className="pantry-see-all">← Back to Pantry</Link>
      <h2>{TITLES[sectionId]}</h2>
      <p className="dim">{items.length} items</p>
      {q.isLoading && <p>Loading…</p>}
      {q.isError && <p className="error">Couldn't load this section.</p>}
      {!q.isLoading && !q.isError && items.length === 0 && (
        <p className="dim">No items in this section.</p>
      )}
      <div className="pantry-grid">
        {items.map((item: any, index: number) => (
          <PantryCard key={item.productId ?? `${sectionId}-${index}`} item={item} />
        ))}
      </div>
    </div>
  );
}
