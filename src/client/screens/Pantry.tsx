import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../api";
import { ProductArt, Tags, useIconRegistry } from "../components";
import { PantryCard } from "../components/PantryCard";
import {
  allocateVisibleCards,
  sortSectionItems,
  type PantrySectionId,
} from "../lib/pantryVisibility";

import profilePic from "../../../assets/page-icons/profilepic.png";
import pantryBoxArt from "../../../assets/page-icons/businesspantry.png";

interface PantrySection {
  id: PantrySectionId;
  title: string;
  items: any[];
}

export function PantryScreen() {
  const q = useQuery({
    queryKey: ["pantry", "sections"],
    queryFn: api.pantrySections,
  });
  const pageRef = useRef<HTMLDivElement>(null);
  const overflowAtRef = useRef<Set<number>>(new Set());
  const [visibleTotal, setVisibleTotal] = useState(7);
  const [fitNonce, setFitNonce] = useState(0);

  const sections: PantrySection[] = q.data
    ? [
        { id: "buy" as PantrySectionId, title: "Buy", items: sortSectionItems("buy", q.data.buy ?? []) },
        { id: "skip" as PantrySectionId, title: "Skip", items: sortSectionItems("skip", q.data.skip ?? []) },
        { id: "swap" as PantrySectionId, title: "Swap", items: sortSectionItems("swap", q.data.swap ?? []) },
      ].filter((section) => section.items.length > 0)
    : [];
  const totalCount = sections.reduce((sum, section) => sum + section.items.length, 0);
  const dataKey = q.data
    ? `${q.data.buy?.length ?? 0}:${q.data.skip?.length ?? 0}:${q.data.swap?.length ?? 0}`
    : "none";

  useEffect(() => {
    overflowAtRef.current = new Set();
    setVisibleTotal(7);
  }, [dataKey]);

  useEffect(() => {
    const onResize = () => {
      overflowAtRef.current = new Set();
      setFitNonce((value) => value + 1);
    };
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (cancelled) return;
      overflowAtRef.current = new Set();
      setFitNonce((value) => value + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    if (!q.data || totalCount === 0) return;
    const page = pageRef.current;
    if (!page) return;
    const shell = page.parentElement;
    const shellPad = shell ? parseFloat(getComputedStyle(shell).paddingBottom) || 0 : 0;
    const available = window.innerHeight - shellPad;
    const fits = page.scrollHeight <= available + 1;

    setVisibleTotal((current) => {
      const capped = Math.min(current, totalCount);
      if (fits) {
        if (capped < totalCount && !overflowAtRef.current.has(capped + 1)) {
          return capped + 1;
        }
        return capped;
      }
      if (capped <= 0) return 0;
      overflowAtRef.current.add(capped);
      return capped - 1;
    });
  }, [q.data, totalCount, dataKey, visibleTotal, fitNonce]);

  const allocation = allocateVisibleCards(sections, visibleTotal);
  const empty = sections.length === 0;

  return (
    <div className="pantry-page" ref={pageRef}>
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
        {sections.map((section) => {
          const visibleItems = section.items.slice(0, allocation[section.id]);
          const hidden = section.items.length - visibleItems.length;
          return (
            <section className="pantry-section" key={section.id}>
              <div className="pantry-section-head">
                <h2 className="pantry-section-title">{section.title}</h2>
                {hidden > 0 && (
                  <Link
                    to="/pantry/section/$section"
                    params={{ section: section.id }}
                    className="pantry-see-all"
                  >
                    See more ({hidden})
                  </Link>
                )}
              </div>
              {visibleItems.length > 0 && (
                <div className="pantry-grid">
                  {visibleItems.map((item: any, i: number) => (
                    <PantryCard
                      key={item.productId ?? `${section.id}-${i}`}
                      item={item}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
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
