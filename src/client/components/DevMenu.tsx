import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

/** Dev-only helper: seed/reset the demo pantry. Rendered only when
 *  import.meta.env.DEV is true (see router Shell) — never in production.
 *  Fixed-position, so it cannot affect any screen's layout. */
export function DevMenu() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open ]);

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
  );
}
