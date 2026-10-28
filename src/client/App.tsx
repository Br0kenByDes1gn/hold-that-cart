import { useEffect, useState } from "react";
import { getDeviceId } from "./lib/device";

export function App() {
  const [health, setHealth] = useState<string>("…");
  useEffect(() => {
    getDeviceId();
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setHealth(j.ok ? "online" : "error"))
      .catch(() => setHealth("offline (dev server not running?)"));
  }, []);
  return (
    <div className="shell">
      <header className="header">
        <div className="wordmark">HOLD THAT CART</div>
        <div className="subtitle">Cart Radar · The Stash</div>
      </header>
      <main className="main">
        <div className="card glow-cyan">
          <h1>Shopping Mode</h1>
          <p>Scan a list, cart or receipt while you shop.</p>
          <button disabled>Start shopping (soon)</button>
        </div>
        <div className="card glow-cyan">
          <h1>Pantry Mode</h1>
          <p>Track what you have at home.</p>
          <button disabled>Open pantry (soon)</button>
        </div>
        <p className="dim">API: {health}</p>
      </main>
      <nav className="tabbar">
        <span className="active">Home</span>
        <span>Pantry</span>
        <span>Scanner</span>
      </nav>
    </div>
  );
}
