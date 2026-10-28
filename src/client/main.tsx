import "./theme.css";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouter } from "./router";
import { api } from "./api";

const qc = new QueryClient();

function Boot() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api.ensureHousehold().catch(() => undefined).finally(() => setReady(true));
  }, []);
  if (!ready) return <div className="shell"><p className="dim">Starting…</p></div>;
  return <AppRouter />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <Boot />
    </QueryClientProvider>
  </React.StrictMode>,
);
