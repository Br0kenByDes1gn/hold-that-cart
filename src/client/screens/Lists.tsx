import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { ProductArt, Tags, useIconRegistry } from "../components";

export function ListScreen({ listId }: { listId: string }) {
  const icons = useIconRegistry();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["list", listId], queryFn: () => api.list(listId) });
  const ev = useQuery({ queryKey: ["eval", listId], queryFn: () => api.evaluateList(listId) });
  const decide = useMutation({
    mutationFn: ({ itemId, patch }: { itemId: string; patch: Record<string, unknown> }) =>
      api.patchListItem(listId, itemId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["list", listId] }),
  });

  return (
    <div className="main">
      <h2>{list.data?.list?.title ?? "Shopping list"}</h2>
      {ev.data?.holdCount > 0 && (
        <div className="alert">🛒 Hold That Cart! You already have {ev.data.holdCount} of these.</div>
      )}
      {ev.isLoading && <p>Checking pantry…</p>}
      {ev.data?.results?.map((r: any) => {
        const item = list.data?.items?.find((i: any) => i.id === r.listItemId);
        const s = r.suggestion;
        return (
          <div className={`srow ${s.action === "SKIP" ? "row-skip" : s.action === "SWAP" ? "row-swap" : "row-buy"}`} key={r.listItemId}>
            <ProductArt name={r.rawName} icons={icons} size={44} />
            <div className="srow-body">
              <div className="srow-title">
                <span className="badge">{s.action}</span> {r.rawName}
              </div>
              {s.swapTitle && <div className="dim">→ {s.swapTitle}</div>}
              <Tags tags={s.tags} />
              {item?.checked && <div className="dim">✓ done</div>}
              <div className="row">
                <button onClick={() => decide.mutate({ itemId: r.listItemId, patch: { decision: "needs_it", checked: true } })}>
                  I need it
                </button>
                <button onClick={() => decide.mutate({ itemId: r.listItemId, patch: { decision: "skip", checked: true } })}>
                  Skip it
                </button>
                {!item?.checked && (
                  <button onClick={() => decide.mutate({ itemId: r.listItemId, patch: { checked: true } })}>✓</button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
