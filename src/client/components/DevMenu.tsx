import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { api } from "../api";

/** Dev-only helper: seed/reset the demo pantry. Rendered only when
 *  import.meta.env.DEV is true (see router Shell) — never in production.
 *  Fixed-position, so it cannot affect any screen's layout. */
export function DevMenu() {
  const qc = useQueryClient();
  const location = useLocation();
  const onPantry = location.pathname === "/pantry";
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [devOpen, setDevOpen] = useState(false);
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
    if (!onPantry) setDevOpen(false);
  }, [onPantry]);

  const loadDevData = async () => {
    setDevLoading(true);
    setDevError("");
    try {
      setDevData(await api.devPantryInsights());
    } catch (e: any) {
      setDevError(String(e?.message ?? e).slice(0, 300));
    } finally {
      setDevLoading(false);
    }
  };

  const openDevMode = () => {
    setOpen(false);
    setDevOpen(true);
    void loadDevData();
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
              <button type="button" role="menuitem" onClick={openDevMode}>
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

      {devOpen && (
        <div
          className="devmode-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Pantry model output"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDevOpen(false);
          }}
        >
          <div className="devmode-panel">
            <header className="devmode-header">
              <div>
                <div className="devmode-title">Pantry model output</div>
                <div className="devmode-sub">
                  Raw classification returned for each detected item.
                </div>
              </div>
              <div className="devmode-actions">
                <button
                  type="button"
                  onClick={() => void loadDevData()}
                  disabled={devLoading}
                >
                  {devLoading ? "Loading…" : "Refresh"}
                </button>
                <button type="button" onClick={() => setDevOpen(false)}>
                  Close
                </button>
              </div>
            </header>

            {devError && <p className="error devmode-error">{devError}</p>}
            {!devError && !devLoading && devData?.items?.length === 0 && (
              <p className="dim" style={{ padding: 16 }}>
                No pantry insights yet. Scan a receipt first.
              </p>
            )}

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
          </div>
        </div>
      )}
    </>
  );
}
