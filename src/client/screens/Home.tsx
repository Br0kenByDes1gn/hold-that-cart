import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../api";
import { ProductArt, Tags, useIconRegistry } from "../components";

export function HomeScreen() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState("");
  const seed = useMutation({
    mutationFn: api.seedDemo,
    onSuccess: () => {
      setMsg("Demo pantry loaded.");
      qc.invalidateQueries();
    },
    onError: (e: any) => setMsg(String(e.message).slice(0, 200)),
  });
  const reset = useMutation({
    mutationFn: api.resetDemo,
    onSuccess: () => {
      setMsg("Pantry cleared.");
      qc.invalidateQueries();
    },
  });
  return (
    <div className="main">
      <p className="hint">Scan lists, carts or receipts to find better swaps!</p>
      <Link to="/briefing" className="card glow-cyan mode-card">
        <h1>Shopping Mode</h1>
        <p>Scan a list, cart or receipt while you shop.</p>
      </Link>
      <Link to="/pantry" className="card glow-cyan mode-card">
        <h1>Pantry Mode</h1>
        <p>Track what you have at home.</p>
      </Link>
      <div className="row">
        <button onClick={() => seed.mutate()} disabled={seed.isPending}>
          {seed.isPending ? "Loading…" : "Load demo pantry"}
        </button>
        <button onClick={() => reset.mutate()} disabled={reset.isPending}>
          Reset
        </button>
      </div>
      <p className="dim" style={{ textAlign: "center", marginTop: 8 }}>
        New here? <Link to="/">Create an account</Link>
      </p>
      {msg && <p className="dim">{msg}</p>}
    </div>
  );
}

function SuggestionRow({ s, icons }: { s: any; icons: any[] }) {
  const actionClass = s.action === "SKIP" ? "row-skip" : s.action === "BUY" ? "row-buy" : "row-swap";
  return (
    <div className={`srow ${actionClass}`}>
      <ProductArt name={s.rawName} icons={icons} size={44} />
      <div className="srow-body">
        <div className="srow-title">
          <span className="badge">{s.action}</span> {s.rawName}
        </div>
        {s.swapTitle && <div className="dim">→ {s.swapTitle}</div>}
        <Tags tags={s.tags} />
        {s.evidence?.expectedSaving ? (
          <div className="dim">≈ €{Number(s.evidence.expectedSaving).toFixed(2)} / trip (your receipts)</div>
        ) : null}
      </div>
    </div>
  );
}

export function BriefingScreen() {
  const icons = useIconRegistry();
  const q = useQuery({ queryKey: ["briefing"], queryFn: () => api.briefing() });
  return (
    <div className="main">
      <h2>Pre-shop briefing</h2>
      <p className="dim">Built from your rhythm. Estimates, not facts.</p>
      {q.isLoading && <p>Loading…</p>}
      {q.isError && <p>Couldn't load. Load the demo pantry from Home first.</p>}
      {q.data && (
        <>
          {q.data.holdCount > 0 && (
            <div className="alert">
              🛒 Hold That Cart! You already have {q.data.holdCount} of these.
            </div>
          )}
          <h3>BUY — probably due</h3>
          {q.data.buy.length === 0 && <p className="dim">Nothing due.</p>}
          {q.data.buy.map((s: any, i: number) => (
            <SuggestionRow key={i} s={s} icons={icons} />
          ))}
          <h3>SKIP — probably stocked</h3>
          {q.data.skip.length === 0 && <p className="dim">Nothing to skip.</p>}
          {q.data.skip.map((s: any, i: number) => (
            <SuggestionRow key={i} s={s} icons={icons} />
          ))}
          <h3>SWAP — better options</h3>
          {q.data.swap.length === 0 && <p className="dim">No swaps found.</p>}
          {q.data.swap.map((s: any, i: number) => (
            <SuggestionRow key={i} s={s} icons={icons} />
          ))}
          <Link to="/scanner" className="card glow-cyan">
            <h1>Open Cart Radar →</h1>
            <p>Scan your list or cart now.</p>
          </Link>
        </>
      )}
    </div>
  );
}
