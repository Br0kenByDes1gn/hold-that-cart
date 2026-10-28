import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../api";
import { ProductArt, Tags, useIconRegistry } from "../components";

export function PantryScreen() {
  const icons = useIconRegistry();
  const q = useQuery({ queryKey: ["pantry"], queryFn: api.pantry });
  return (
    <div className="main">
      <h2>The Stash</h2>
      <p className="dim">Your home pantry.</p>
      <Link to="/briefing" className="card glow-cyan">
        <h1>Analyse My Pantry →</h1>
        <p>See what's due, stocked, and swappable.</p>
      </Link>
      {q.isLoading && <p>Loading…</p>}
      {q.data?.products?.length === 0 && (
        <p>
          Pantry is empty. <Link to="/">Load the demo pantry</Link> or scan a receipt.
        </p>
      )}
      <div className="grid">
        {q.data?.products?.map((p: any) => (
          <Link key={p.productId} to="/pantry/$productId" params={{ productId: p.productId }} className="pcard">
            <ProductArt name={p.name} icon={p.icon} icons={icons} size={56} />
            <div className="pcard-name">{p.name}</div>
            <div className="dim">
              {p.state.status === "stocked"
                ? "probably stocked"
                : p.state.status === "due"
                  ? "due"
                  : p.state.status === "getting_low"
                    ? "getting low"
                    : "unknown"}
              {p.muted ? " · muted" : ""}
            </div>
          </Link>
        ))}
      </div>
      <Link to="/scanner" className="card glow-cyan">
        <h1>+ Add Receipt</h1>
      </Link>
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
