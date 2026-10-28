import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { api } from "../api";

function fileToDataUrl(file: File, maxDim = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function ScannerScreen() {
  const nav = useNavigate();
  const [kindHint, setKindHint] = useState("unknown");
  const [items, setItems] = useState<any[]>([]);
  const [kind, setKind] = useState("unknown");
  const [scanId, setScanId] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState("");

  const extract = useMutation({
    mutationFn: ({ image, hint }: { image: string; hint: string }) => api.aiExtract(image, hint),
    onSuccess: async (data: any) => {
      setError("");
      setKind(data.kind ?? "unknown");
      setItems(data.items ?? []);
      // persist scan so it can be confirmed
      try {
        const scan = await api.createScan(data.kind ?? "unknown", data.items ?? []);
        setScanId(scan.id);
      } catch (e: any) {
        setError(`Extracted, but couldn't save scan: ${e.message}`);
      }
    },
    onError: (e: any) => setError(e.message),
  });

  const confirm = useMutation({
    mutationFn: () => {
      if (!scanId) throw new Error("nothing to confirm");
      const payload = items.map((it) => ({
        rawName: it.rawName,
        normalizedName: it.normalizedName,
        productId: it.match?.productId ?? it.productId ?? null,
        qty: it.qty ?? 1,
        packQty: it.packQty,
        packUnit: it.packUnit,
        price: it.price,
        brand: it.brand,
      }));
      return api.confirmScan(scanId, kind, payload);
    },
    onSuccess: (data: any) => {
      if (data.listId) nav({ to: "/lists/$listId", params: { listId: data.listId } });
      else nav({ to: "/pantry" });
    },
    onError: (e: any) => setError(e.message),
  });

  return (
    <div className="main">
      <h2>Cart Radar</h2>
      <p className="dim">Scan your list, cart or receipt.</p>
      <div className="row">
        {(["receipt", "list", "cart", "unknown"] as const).map((k) => (
          <button key={k} className={kindHint === k ? "chip-active" : ""} onClick={() => setKindHint(k)}>
            {k}
          </button>
        ))}
      </div>
      <label className="card glow-cyan file-card">
        <span>📷 Take / upload photo</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setError("");
            try {
              const dataUrl = await fileToDataUrl(f);
              extract.mutate({ image: dataUrl, hint: kindHint });
            } catch (err: any) {
              setError(String(err?.message ?? err));
            }
          }}
        />
      </label>
      {extract.isPending && <p>Reading photo…</p>}
      <details>
        <summary className="dim">Or use demo JSON (no camera needed)</summary>
        <div className="row">
          {(["receipt-1.json", "list-1.json", "cart-1.json"] as const).map((f) => (
            <button
              key={f}
              onClick={async () => {
                setError("");
                try {
                  const arr = await fetch(`/fixtures/${f}`).then((r) => r.json());
                  const kindGuess = f.startsWith("receipt") ? "receipt" : f.startsWith("list") ? "list" : "cart";
                  const scan = await api.createScan(kindGuess, arr);
                  setScanId(scan.id);
                  setKind(scan.kind);
                  setItems(scan.matches ?? arr);
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              Load {f.replace("-1.json", "")}
            </button>
          ))}
        </div>
        <textarea
          rows={5}
          className="json"
          placeholder='[{"rawName":"Milk","normalizedName":"milk","qty":1}]'
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
        <div className="row">
          <button
            onClick={async () => {
              setError("");
              try {
                const arr = JSON.parse(jsonText);
                const scan = await api.createScan(kindHint === "unknown" ? "list" : kindHint, arr);
                setScanId(scan.id);
                setKind(scan.kind);
                setItems(scan.matches ?? arr);
              } catch (e: any) {
                setError(e.message);
              }
            }}
          >
            Use pasted JSON
          </button>
        </div>
      </details>
      {error && <p className="error">{error}</p>}
      {items.length > 0 && (
        <>
          <h3>Detected ({kind}) — correct before confirming</h3>
          {items.map((it, i) => (
            <div className="srow" key={i}>
              <div className="srow-body">
                <input
                  value={it.rawName}
                  onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, rawName: e.target.value } : x)))}
                />
                <div className="dim">
                  {it.normalizedName} · qty {it.qty ?? 1}
                  {it.price != null ? ` · €${it.price}` : ""}
                  {it.match?.productId ? " · ✓ matched" : " · new item"}
                </div>
              </div>
              <button onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button onClick={() => confirm.mutate()} disabled={confirm.isPending}>
            {confirm.isPending ? "Saving…" : kind === "receipt" ? "Confirm → add to pantry" : "Confirm → make list"}
          </button>
        </>
      )}
    </div>
  );
}
