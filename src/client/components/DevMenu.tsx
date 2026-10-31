import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { api } from "../api";
import { resolveItemArt } from "../lib/itemArt";

type DevView = "pantry" | "scanner";

/** Dev-only helper: seed/reset the demo pantry. Rendered only when
 *  import.meta.env.DEV is true (see router Shell) — never in production.
 *  Fixed-position, so it cannot affect any screen's layout. */
export function DevMenu() {
  const qc = useQueryClient();
  const location = useLocation();
  const onPantry = location.pathname === "/pantry";
  const onScanner = location.pathname === "/scanner";
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [devView, setDevView] = useState<DevView | null>(null);
  const [devLoading, setDevLoading] = useState(false);
  const [devError, setDevError] = useState("");
  const [devData, setDevData] = useState<any>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    setDevView(null);
  }, [location.pathname]);

  const loadDevData = async (view: DevView) => {
    setDevLoading(true);
    setDevError("");
    try {
      setDevData(
        view === "pantry" ? await api.devPantryInsights() : await api.devLatestScan(),
      );
    } catch (e: any) {
      setDevError(String(e?.message ?? e).slice(0, 300));
    } finally {
      setDevLoading(false);
    }
  };

  const openDevMode = (view: DevView) => {
    setOpen(false);
    setDevView(view);
    void loadDevData(view);
  };

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
    onError: (e: any) => setMsg(String(e.message).slice(0, 200)),
  });

  const scan = devView === "scanner" ? devData?.scan : null;
  const scanItems: any[] = Array.isArray(scan?.rawExtraction?.items)
    ? scan.rawExtraction.items
    : [];

  return (
    <>
      <div className="devmenu" ref={rootRef}>
        {open && (
          <div className="devmenu-panel" role="menu" aria-label="Developer menu">
            <div className="devmenu-title">Dev menu</div>
            <button
              type="button"
              role="menuitem"
              onClick={() => seed.mutate()}
              disabled={seed.isPending}
            >
              {seed.isPending ? "Loading…" : "Load demo pantry"}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => reset.mutate()}
              disabled={reset.isPending}
            >
              Reset pantry
            </button>
            {onPantry && (
              <button type="button" role="menuitem" onClick={() => openDevMode("pantry")}>
                Dev mode
              </button>
            )}
            {onScanner && (
              <button type="button" role="menuitem" onClick={() => openDevMode("scanner")}>
                Dev mode
              </button>
            )}
            {msg && <div className="devmenu-msg">{msg}</div>}
          </div>
        )}
        <button
          type="button"
          className="devmenu-btn"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Developer menu"
          onClick={() => setOpen((o) => !o)}
        >
          ⚙
        </button>
      </div>

      {devView && (
        <div
          className="devmode-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={
            devView === "pantry" ? "Pantry model output" : "Scanner model output"
          }
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDevView(null);
          }}
        >
          <div className="devmode-panel">
            <header className="devmode-header">
              <div>
                <div className="devmode-title">
                  {devView === "pantry" ? "Pantry model output" : "Scanner model output"}
                </div>
                <div className="devmode-sub">
                  {devView === "pantry"
                    ? "Raw classification returned for each detected item."
                    : "Raw extraction JSON plus the category and image chosen for each item."}
                </div>
              </div>
              <div className="devmode-actions">
                <button
                  type="button"
                  onClick={() => void loadDevData(devView)}
                  disabled={devLoading}
                >
                  {devLoading ? "Loading…" : "Refresh"}
                </button>
                <button type="button" onClick={() => setDevView(null)}>
                  Close
                </button>
              </div>
            </header>

            {devError && <p className="error devmode-error">{devError}</p>}

            {devView === "scanner" && !devError && !devLoading && !scan && (
              <p className="dim" style={{ padding: 16 }}>
                No scan yet. Scan a receipt, list or cart first.
              </p>
            )}

            {devView === "scanner" && scan && (
              <>
                <div className="devmode-section-title">Raw scan JSON</div>
                <pre className="devmode-json devmode-json-full">
                  {JSON.stringify(scan.rawExtraction, null, 2)}
                </pre>
                <div className="devmode-section-title">Detected items</div>
                <div className="devmode-items">
                  {scanItems.map((item: any, index: number) => {
                    const art = resolveItemArt(item);
                    return (
                      <section className="devmode-item" key={`${item.rawName}-${index}`}>
                        <div className="devmode-item-head">
                          <strong>{item.rawName}</strong>
                          <span className="dim">
                            {art.category} · {art.categoryLabel}
                          </span>
                        </div>
                        <div className="devmode-image-line">
                          Image: {art.entry.file}
                          {!art.usedCategory ? " (name fallback)" : ""}
                        </div>
                        <pre className="devmode-json">
                          {JSON.stringify(item, null, 2)}
                        </pre>
                      </section>
                    );
                  })}
                </div>
              </>
            )}

            {devView === "pantry" && !devError && !devLoading && devData?.items?.length === 0 && (
              <p className="dim" style={{ padding: 16 }}>
                No pantry insights yet. Scan a receipt first.
              </p>
            )}

            {devView === "pantry" && (
              <div className="devmode-items">
                {devData?.items?.map((item: any) => (
                  <section className="devmode-item" key={item.productId}>
                    <div className="devmode-item-head">
                      <strong>{item.rawName}</strong>
                      <span className="dim">
                        {item.source}
                        {item.modelName ? ` · ${item.modelName}` : ""}
                        {item.promptVersion ? ` · ${item.promptVersion}` : ""}
                      </span>
                    </div>
                    {item.classificationError && (
                      <p className="devmode-item-error">
                        Model error: {item.classificationError}
                      </p>
                    )}
                    <pre className="devmode-json">
                      {JSON.stringify(
                        item.raw ?? item.assessment ?? item.classification,
                        null,
                        2,
                      )}
                    </pre>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
