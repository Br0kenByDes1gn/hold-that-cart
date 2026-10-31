import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../api";
import { ProductArt, Tags, useIconRegistry } from "../components";
import { productArtFor } from "../lib/productArt";
import { resolveItemArt } from "../lib/itemArt";

import profilePic from "../../../assets/page-icons/profilepic.png";
import pantryBoxArt from "../../../assets/page-icons/businesspantry.png";

type TagKind = "money" | "health" | "planet";

interface PantrySection {
  id: string;
  title: string;
  items: any[];
}

const FALLBACK_ART = resolveItemArt({
  rawName: "item",
  category: "other",
}).entry.url;

const TAG_LABEL: Record<TagKind, string> = {
  money: "Saves money",
  health: "Healthier",
  planet: "Sustainable",
};

function PantryTag({ kind, on }: { kind: TagKind; on: boolean }) {
  return (
    <span className={`pantry-tag pantry-tag-${kind} ${on ? "is-on" : ""}`}>
      {TAG_LABEL[kind]}
    </span>
  );
}

export function PantryScreen() {
  const q = useQuery({
    queryKey: ["pantry", "sections"],
    queryFn: api.pantrySections,
  });
  const sections: PantrySection[] = q.data
    ? [
        { id: "buy", title: "Buy", items: q.data.buy ?? [] },
        { id: "skip", title: "Skip", items: q.data.skip ?? [] },
        { id: "swap", title: "Swap", items: q.data.swap ?? [] },
      ]
    : [];
  const empty = sections.every((s) => s.items.length === 0);
  return (
    <div className="pantry-page">
      <header className="pantry-top">
        <span className="pantry-top-spacer" aria-hidden="true" />
        <div className="pantry-top-title">
          <img className="pantry-box-art" src={pantryBoxArt} alt="" aria-hidden="true" />
          <h1 className="pantry-title">Pantry</h1>
        </div>
        <img className="pantry-profile" src={profilePic} alt="Profile" />
      </header>

      {q.isLoading && <p className="dim" style={{ padding: 16 }}>Loading…</p>}
      {q.isError && (
        <p className="error" style={{ padding: 16 }}>
          Couldn't load your pantry. Try again in a moment.
        </p>
      )}
      {q.data && empty && (
        <p className="dim" style={{ padding: 16 }}>
          Pantry is empty. Scan a receipt to add items.
        </p>
      )}

      <div className="pantry-sections">
        {sections
          .filter((s) => s.items.length > 0)
          .map((section) => (
            <section className="pantry-section" key={section.id}>
              <div className="pantry-section-head">
                <h2 className="pantry-section-title">{section.title}</h2>
                <Link to="/briefing" className="pantry-see-all">
                  See all
                </Link>
              </div>
              <div className="pantry-grid">
                {section.items.map((item: any, i: number) => {
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
                      key={`${item.productId}-${i}`}
                      to="/pantry/$productId"
                      params={{ productId: item.productId }}
                    >
                      {card}
                    </Link>
                  ) : (
                    <article className="pantry-card" key={i}>
                      {card}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}

export function ProductScreen({ productId }: { productId: string }) {
  const icons = useIconRegistry();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["product", productId], queryFn: () => api.product(productId) });
  const correct = useMutation({
    mutationFn: (type: "im_out" | "never_remind") => api.correct(productId, type),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product", productId] });
      qc.invalidateQueries({ queryKey: ["briefing"] });
      qc.invalidateQueries({ queryKey: ["pantry"] });
    },
  });
  const enrich = useMutation({
    mutationFn: () => api.enrichAI(productId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product", productId] }),
  });
  const reclass = useMutation({
    mutationFn: (shelfLifeClass: string) => api.patchProduct(productId, { shelfLifeClass }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product", productId] });
      qc.invalidateQueries({ queryKey: ["briefing"] });
    },
  });
  if (q.isLoading) return <div className="main">Loading…</div>;
  if (q.isError) return <div className="main">Not found.</div>;
  const d = q.data;
  const st = d.state;
  return (
    <div className="main">
      <ProductArt name={d.product.name} icon={d.product.icon} icons={icons} size={72} />
      <h2>{d.product.name}</h2>
      <p className="dim">
        {d.product.shelfLifeClass} · bought {st.purchaseCount}×
        {st.lastPurchasedAt ? ` · last ${new Date(st.lastPurchasedAt).toLocaleDateString()}` : ""}
        {st.T ? ` · every ~${Math.round(st.T)}d` : ""}
      </p>
      <Tags tags={d.suggestions.skip[0]?.tags ?? d.suggestions.swap[0]?.tags ?? []} />
      {d.enrichment ? (
        <>
          {d.enrichment.alternatives?.map((a: any, i: number) => (
            <div className="srow" key={i}>
              <div className="srow-body">
                <div className="srow-title">→ {a.title}</div>
                <div className="dim">{a.rationale}</div>
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className="card">
          <p>No AI knowledge yet.</p>
          <button onClick={() => enrich.mutate()} disabled={enrich.isPending}>
            {enrich.isPending ? "Asking Muse…" : "Enrich with Muse"}
          </button>
          {enrich.isError && <p className="error">Enrichment failed (needs MODEL_API_KEY on server).</p>}
        </div>
      )}
      {d.variants?.length > 0 && (
        <>
          <h3>Variants you've bought</h3>
          {d.variants.map((v: any) => (
            <div className="dim" key={v.key}>
              {v.brand ?? "No brand"} · {v.purchaseCount}× · median €{Number(v.medianPerUnit).toFixed(2)}/{v.baseUnit}
            </div>
          ))}
        </>
      )}
      <h3>History</h3>
      {d.history.map((h: any) => (
        <div className="dim" key={h.id}>
          {new Date(h.purchasedAt).toLocaleDateString()} · {h.variant ?? h.brand ?? "—"} ·{" "}
          {h.totalPrice != null ? `€${h.totalPrice}` : "no price"}
        </div>
      ))}
      <h3>Fix it</h3>
      <div className="row">
        <button onClick={() => correct.mutate("im_out")}>I'm out</button>
        <button onClick={() => correct.mutate("never_remind")}>Never remind me</button>
      </div>
      <div className="row">
        {(["perishable", "staple", "household", "durable"] as const).map((s) => (
          <button
            key={s}
            className={d.product.shelfLifeClass === s ? "chip-active" : ""}
            onClick={() => reclass.mutate(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
