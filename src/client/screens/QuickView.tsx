import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import { iconFor, useIconRegistry } from "../components";
import profilePic from "../../../assets/page-icons/profilepic.png";
import groceryListArt from "../../../assets/page-icons/businesscart.png";

interface GroceryItem {
  id: string;
  name: string;
  quantity: string;
  art: string | null;
  alt: string;
  serverListId?: string;
}

export function QuickViewScreen() {
  const icons = useIconRegistry();
  const qc = useQueryClient();
  const listsQ = useQuery({ queryKey: ["lists"], queryFn: api.lists });
  const latestListId: string | null = listsQ.data?.lists?.[0]?.id ?? null;
  const listQ = useQuery({
    queryKey: ["list", latestListId],
    queryFn: () => api.list(latestListId!),
    enabled: !!latestListId,
  });
  const briefingQ = useQuery({
    queryKey: ["briefing", "quickview"],
    queryFn: () => api.briefing({ buy: 20 }),
    enabled: !latestListId && !listsQ.isLoading,
  });

  const serverItems: GroceryItem[] = (listQ.data?.items ?? [])
    .filter((it: any) => it.decision !== "skip")
    .map((it: any) => ({
      id: it.id,
      name: it.rawName,
      quantity: "Qty 1",
      art: iconFor(it.rawName, undefined, icons),
      alt: it.rawName,
      serverListId: latestListId ?? undefined,
    }));
  const briefingItems: GroceryItem[] = (briefingQ.data?.buy ?? []).map((s: any, i: number) => ({
    id: `brief-${s.productId ?? i}`,
    name: s.rawName,
    quantity: "Qty 1",
    art: iconFor(s.rawName, undefined, icons),
    alt: s.rawName,
  }));
  const usingServer = !!latestListId;
  const sourceItems = usingServer ? serverItems : briefingItems;

  const [localItems, setLocalItems] = useState<GroceryItem[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => {
    setLocalItems(null);
    if (usingServer) {
      setChecked(new Set((listQ.data?.items ?? []).filter((it: any) => it.checked).map((it: any) => it.id)));
    } else {
      setChecked(new Set());
    }
  }, [latestListId, listQ.data]);

  const items = localItems ?? sourceItems;

  const patchItem = useMutation({
    mutationFn: ({ itemId, patch }: { itemId: string; patch: Record<string, unknown> }) =>
      api.patchListItem(latestListId!, itemId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["list", latestListId] }),
  });

  const toggle = (id: string) => {
    const nextChecked = !checked.has(id);
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (usingServer) patchItem.mutate({ itemId: id, patch: { checked: nextChecked } });
  };

  const remove = (id: string) => {
    setLocalItems((current) => (current ?? sourceItems).filter((item) => item.id !== id));
    if (usingServer) {
      patchItem.mutate({ itemId: id, patch: { decision: "skip", checked: true } });
    }
  };

  return (
    <div className="grocery-page">
      <header className="pantry-top grocery-top">
        <span className="pantry-top-spacer" aria-hidden="true" />
        <div className="pantry-top-title">
          <img className="grocery-list-art" src={groceryListArt} alt="" aria-hidden="true" />
          <h1 className="pantry-title grocery-title">Grocery List</h1>
        </div>
        <img className="pantry-profile" src={profilePic} alt="Profile" />
      </header>

      <div className="grocery-list">
        {items.map((item) => {
          const isChecked = checked.has(item.id);
          return (
            <article className={`grocery-card ${isChecked ? "is-checked" : ""}`} key={item.id}>
              <input
                type="checkbox"
                className="grocery-check"
                checked={isChecked}
                onChange={() => toggle(item.id)}
                aria-label={`Mark ${item.name} as ${isChecked ? "not bought" : "bought"}`}
              />
              <span className="grocery-item-art">
                {item.art ? <img src={`/${item.art}`} alt={item.alt} /> : null}
              </span>
              <div className="grocery-item-copy">
                <div className="grocery-item-name">{item.name}</div>
                <div className="grocery-item-qty">{item.quantity}</div>
              </div>
              <button
                type="button"
                className="grocery-remove"
                aria-label={`Remove ${item.name} from the list`}
                onClick={() => remove(item.id)}
              >
                <Trash2 size={20} strokeWidth={2} />
              </button>
            </article>
          );
        })}

        {items.length === 0 && (
          <p className="grocery-empty">Your grocery list is empty.</p>
        )}
      </div>
    </div>
  );
}
