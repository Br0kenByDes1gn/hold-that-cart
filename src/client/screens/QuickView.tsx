import { Link } from "@tanstack/react-router";

export function QuickViewScreen() {
  return (
    <div className="main">
      <h2>Quick View</h2>
      <p className="dim">Your grocery list at a glance.</p>
      <Link to="/mode" className="card glow-cyan">
        <h1>Back to Mode Select →</h1>
        <p>Return to choose a mode.</p>
      </Link>
    </div>
  );
}
