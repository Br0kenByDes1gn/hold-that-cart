import { Link } from "@tanstack/react-router";

export function AnalyseScreen() {
  return (
    <div className="main">
      <h2>Analyse</h2>
      <p className="dim">Your shopping impact at a glance.</p>
      <div className="card">
        <h1>No insights yet</h1>
        <p>
          Scan a receipt or a shopping list to start building your money, health and
          sustainability picture.
        </p>
      </div>
      <Link to="/scanner" className="card glow-cyan">
        <h1>Open Cart Radar →</h1>
        <p>Scan something to get started.</p>
      </Link>
    </div>
  );
}
