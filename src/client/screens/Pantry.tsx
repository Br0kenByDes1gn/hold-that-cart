import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../api";
import { ProductArt, Tags, useIconRegistry } from "../components";

import milkGlassArt from "../../../assets/item/milk_glass_and_carton Background Removed.png";
import breadArt from "../../../assets/item/bread_loaf Background Removed.png";
import chipsArt from "../../../assets/item/chips Background Removed.png";
import eggsArt from "../../../assets/item/eggs Background Removed.png";
import yogurtArt from "../../../assets/item/yogurt Background Removed.png";
import bananasArt from "../../../assets/item/fruit_assortment Background Removed.png";
import profilePic from "../../../assets/page-icons/profilepic.png";
import pantryBoxArt from "../../../assets/page-icons/businesspantry.png";

type TagKind = "money" | "health" | "planet";

interface PantryItem {
  id: string;
  name: string;
  art: string;
  alt: string;
  tags: Record<TagKind, boolean>;
}

interface PantrySection {
  id: string;
  title: string;
  items: PantryItem[];
}

const SECTIONS: PantrySection[] = [
  {
    id: "buy",
    title: "Buy",
    items: [
      {
        id: "milk",
        name: "Milk",
        art: milkGlassArt,
        alt: "Glass and carton of milk",
        tags: { money: false, health: true, planet: false },
      },
      {
        id: "bread",
        name: "Bread",
        art: breadArt,
        alt: "Loaf of bread",
        tags: { money: true, health: true, planet: false },
      },
    ],
  },
  {
    id: "skip",
    title: "Skip",
    items: [
      {
        id: "chips",
        name: "Chips",
        art: chipsArt,
        alt: "Bag of chips",
        tags: { money: true, health: false, planet: false },
      },
      {
        id: "eggs",
        name: "Eggs",
        art: eggsArt,
        alt: "Carton of eggs",
        tags: { money: true, health: true, planet: false },
      },
    ],
  },
  {
    id: "swap",
    title: "Swap",
    items: [
      {
        id: "yogurt",
        name: "Yogurt",
        art: yogurtArt,
        alt: "Tub of yogurt",
        tags: { money: false, health: true, planet: true },
      },
      {
        id: "bananas",
        name: "Bananas",
        art: bananasArt,
        alt: "Bunch of bananas",
        tags: { money: true, health: true, planet: true },
      },
    ],
  },
];

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

      <div className="pantry-sections">
        {SECTIONS.map((section) => (
          <section className="pantry-section" key={section.id}>
            <div className="pantry-section-head">
              <h2 className="pantry-section-title">{section.title}</h2>
              <Link to="/briefing" className="pantry-see-all">
                See all
              </Link>
            </div>
            <div className="pantry-grid">
              {section.items.map((item) => (
                <article className="pantry-card" key={item.id}>
                  <div className="pantry-card-main">
                    <div className="pantry-card-art">
                      <img src={item.art} alt={item.alt} />
                    </div>
                    <div className="pantry-card-tags">
                      <PantryTag kind="money" on={item.tags.money} />
                      <PantryTag kind="health" on={item.tags.health} />
                      <PantryTag kind="planet" on={item.tags.planet} />
                    </div>
                  </div>
                  <div className="pantry-card-name">{item.name}</div>
                </article>
              ))}
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
      <h3>History</h3>
      {d.history.map((h: any) => (
        <div className="dim" key={h.id}>
          {new Date(h.purchasedAt).toLocaleDateString()} · {h.brand ?? "—"} ·{" "}
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
