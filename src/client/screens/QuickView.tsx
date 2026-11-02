import { useEffect, useMemo, useState } from "react";
import { Camera, Mic, Minus, Plus, Sparkles, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import { iconFor, useIconRegistry } from "../components";
import {
  AddToListSheet,
  type AddSource,
  type PendingListItem,
} from "../components/AddToListSheet";
import { parseListText } from "../../shared/listText";
import { getSpeechSupport, speechSupportNote } from "../lib/speech";
import profilePic from "../../../assets/page-icons/profilepic.png";
import groceryListArt from "../../../assets/page-icons/businesscart.png";

interface ListItemRow {
  id: string;
  productId: string | null;
  rawName: string;
  brand: string | null;
  qty: string | number;
  checked: boolean;
  decision: string | null;
  source: string;
}

interface AutoAddedRow {
  id: string;
  productId: string;
  rawName: string;
  qty: number;
}

interface ListAuto {
  refreshIntervalDays: number;
  lastRefreshedAt: string | null;
  nextRefreshAt: string | null;
  added: AutoAddedRow[];
}

const DAY_MS = 86_400_000;

const SOURCE_LABEL: Record<string, string> = {
  voice: "voice",
  camera: "photo",
  auto: "pantry",
  scan: "scan",
};

export function QuickViewScreen() {
  const icons = useIconRegistry();
  const qc = useQueryClient();

  const listsQ = useQuery({ queryKey: ["lists"], queryFn: api.lists });
  const lists: any[] = listsQ.data?.lists ?? [];
  const activeList = lists.find((list) => list.status === "open") ?? null;
  const listId: string | null = activeList?.id ?? null;

  const listQ = useQuery({
    queryKey: ["list", listId],
    queryFn: () => api.list(listId!),
    enabled: !!listId,
  });

  // Lazy pantry sweep: adds due items at most once every 3 days.
  const refreshQ = useQuery({
    queryKey: ["pantry-refresh"],
    queryFn: api.pantryRefresh,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const items: ListItemRow[] = useMemo(
    () =>
      ((listQ.data?.items ?? []) as ListItemRow[]).filter(
        (item) => item.decision !== "skip",
      ),
    [listQ.data],
  );
  const auto: ListAuto | null = listQ.data?.auto ?? null;
  const autoAdded = auto?.added ?? [];
  const nextRefreshInDays = auto?.nextRefreshAt
    ? Math.max(
        0,
        Math.ceil((new Date(auto.nextRefreshAt).getTime() - Date.now()) / DAY_MS),
      )
    : null;

  const [draft, setDraft] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<AddSource>("voice");
  const [clearOpen, setClearOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [error, setError] = useState("");
  const [speechSupport] = useState(() => getSpeechSupport());

  useEffect(() => {
    setError("");
  }, [listId]);

  // The refresh may have created a list and inserted rows; pull them in.
  useEffect(() => {
    if (!refreshQ.data) return;
    qc.invalidateQueries({ queryKey: ["lists"] });
    const refreshedListId = (refreshQ.data as { listId?: string | null }).listId;
    if (refreshedListId) {
      qc.invalidateQueries({ queryKey: ["list", refreshedListId] });
    }
  }, [refreshQ.data, qc]);

  const invalidateList = (targetId: string) => {
    qc.invalidateQueries({ queryKey: ["list", targetId] });
    qc.invalidateQueries({ queryKey: ["lists"] });
  };

  const addItems = useMutation({
    mutationFn: async (
      payload: Array<{
        rawName: string;
        qty: number;
        source: string;
        brand?: string | null;
        productId?: string | null;
      }>,
    ) => {
      let targetId = listId;
      let created = false;
      if (!targetId) {
        const createdList: any = await api.createList({
          title: "Shopping list",
          source: payload.every((item) => item.source === "auto") ? "auto" : "manual",
        });
        targetId = createdList.id;
        created = true;
      }
      if (payload.length === 1) {
        await api.addListItem(targetId!, payload[0]);
      } else {
        await api.addListItems(targetId!, payload);
      }
      return { targetId: targetId as string, created };
    },
    onSuccess: ({ targetId, created }) => {
      setDraft("");
      setSheetOpen(false);
      setError("");
      if (created) qc.invalidateQueries();
      else invalidateList(targetId);
    },
    onError: (mutationError: any) => setError(String(mutationError?.message ?? mutationError)),
  });

  const patchItem = useMutation({
    mutationFn: ({ itemId, patch }: { itemId: string; patch: Record<string, unknown> }) =>
      api.patchListItem(listId!, itemId, patch),
    onSuccess: () => listId && invalidateList(listId),
    onError: (mutationError: any) => setError(String(mutationError?.message ?? mutationError)),
  });

  const deleteItem = useMutation({
    mutationFn: (itemId: string) => api.deleteListItem(listId!, itemId),
    onMutate: async (itemId: string) => {
      qc.setQueryData(["list", listId], (current: any) =>
        current
          ? { ...current, items: current.items.filter((item: any) => item.id !== itemId) }
          : current,
      );
    },
    onSuccess: () => listId && invalidateList(listId),
    onError: (mutationError: any) => {
      setError(String(mutationError?.message ?? mutationError));
      if (listId) qc.invalidateQueries({ queryKey: ["list", listId] });
    },
  });

  const undoAuto = useMutation({
    mutationFn: () => {
      if (!listId) throw new Error("No list to undo");
      return api.undoAutoItems(listId);
    },
    onSuccess: () => {
      if (listId) invalidateList(listId);
    },
    onError: (mutationError: any) =>
      setError(String(mutationError?.message ?? mutationError)),
  });

  const clearList = useMutation({
    mutationFn: async () => {
      if (!listId) throw new Error("No list to clear");
      return api.clearList(listId);
    },
    onSuccess: () => {
      setClearOpen(false);
      if (listId) invalidateList(listId);
    },
    onError: (mutationError: any) => {
      setError(String(mutationError?.message ?? mutationError));
      setClearOpen(false);
    },
  });

  const submitTyped = () => {
    const parsed = parseListText(draft);
    if (parsed.length === 0) return;
    addItems.mutate(parsed.map((item) => ({ ...item, source: "manual" })));
  };

  const openSheet = (tab: AddSource) => {
    if (tab === "voice" && speechSupport.status !== "supported") return;
    setSheetTab(tab);
    setSheetOpen(true);
  };

  const onSheetAdd = (pending: PendingListItem[]) => {
    addItems.mutate(pending);
  };

  const commitRename = () => {
    if (!editing) return;
    const value = editing.value.trim();
    const current = items.find((item) => item.id === editing.id);
    if (value && current && value !== current.rawName) {
      patchItem.mutate({ itemId: editing.id, patch: { rawName: value } });
    }
    setEditing(null);
  };

  const changeQty = (item: ListItemRow, delta: number) => {
    const current = Number(item.qty) || 1;
    const next = Math.max(1, Math.min(999, current + delta));
    if (next !== current) patchItem.mutate({ itemId: item.id, patch: { qty: next } });
  };

  const busy = addItems.isPending;

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

      <div className="grocery-subhead">
        <span className="dim">
          {items.length === 0
            ? "Nothing on the list yet"
            : `${items.length} item${items.length === 1 ? "" : "s"} · ${
                items.filter((item) => item.checked).length
              } in cart`}
        </span>
        <div className="grocery-subhead-actions">
          {listId && (
            <Link
              to="/lists/$listId"
              params={{ listId }}
              className="grocery-link"
            >
              Check pantry
            </Link>
          )}
          {items.length > 0 && (
            <button
              type="button"
              className="grocery-new"
              onClick={() => setClearOpen(true)}
            >
              Clear list
            </button>
          )}
        </div>
      </div>

      {speechSupport.status !== "supported" && (
        <p className="grocery-voice-note" role="note">
          {speechSupportNote(speechSupport)}
        </p>
      )}

      {autoAdded.length > 0 && (
        <section className="grocery-auto" aria-label="Auto-added from pantry">
          <span className="grocery-suggest-icon" aria-hidden="true">
            <Sparkles size={20} />
          </span>
          <span className="grocery-suggest-copy">
            <strong>
              {autoAdded.length} item{autoAdded.length === 1 ? "" : "s"} added from your
              pantry
            </strong>
            <span className="grocery-suggest-note">
              Refreshes every {auto?.refreshIntervalDays ?? 3} days
              {nextRefreshInDays !== null
                ? ` · next in ${nextRefreshInDays}d`
                : ""}
            </span>
          </span>
          <button
            type="button"
            className="grocery-auto-undo"
            onClick={() => undoAuto.mutate()}
            disabled={undoAuto.isPending}
          >
            {undoAuto.isPending ? "Undoing…" : "Undo"}
          </button>
        </section>
      )}

      {error && <p className="error">{error}</p>}

      <div className="grocery-list">
        {items.map((item) => {
          const art = iconFor(item.rawName, undefined, icons);
          const isChecked = item.checked;
          return (
            <article
              className={`grocery-card ${isChecked ? "is-checked" : ""}`}
              key={item.id}
            >
              <input
                type="checkbox"
                className="grocery-check"
                checked={isChecked}
                onChange={() =>
                  patchItem.mutate({
                    itemId: item.id,
                    patch: { checked: !isChecked },
                  })
                }
                aria-label={`Mark ${item.rawName} as ${
                  isChecked ? "not bought" : "bought"
                }`}
              />
              <span className="grocery-item-art">
                {art ? <img src={`/${art}`} alt={item.rawName} /> : null}
              </span>
              <div className="grocery-item-copy">
                {editing?.id === item.id ? (
                  <input
                    className="grocery-item-edit"
                    value={editing.value}
                    autoFocus
                    onChange={(event) =>
                      setEditing({ id: item.id, value: event.target.value })
                    }
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitRename();
                      if (event.key === "Escape") setEditing(null);
                    }}
                    aria-label="Item name"
                  />
                ) : (
                  <button
                    type="button"
                    className="grocery-item-name"
                    onClick={() => setEditing({ id: item.id, value: item.rawName })}
                    title="Rename item"
                  >
                    {item.rawName}
                  </button>
                )}
                {item.brand && (
                  <span className="grocery-item-brand">{item.brand}</span>
                )}
                <div className="grocery-item-meta">
                  <div className="grocery-qty">
                    <button
                      type="button"
                      className="grocery-step"
                      aria-label={`One less ${item.rawName}`}
                      onClick={() => changeQty(item, -1)}
                      disabled={(Number(item.qty) || 1) <= 1}
                    >
                      <Minus size={13} />
                    </button>
                    <span className="grocery-item-qty">
                      Qty {Number(item.qty) || 1}
                    </span>
                    <button
                      type="button"
                      className="grocery-step"
                      aria-label={`One more ${item.rawName}`}
                      onClick={() => changeQty(item, 1)}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  {SOURCE_LABEL[item.source] && (
                    <span className="grocery-source">{SOURCE_LABEL[item.source]}</span>
                  )}
                </div>
              </div>
              <div className="grocery-item-actions">
                <button
                  type="button"
                  className="grocery-remove"
                  aria-label={`Remove ${item.rawName} from the list`}
                  onClick={() => deleteItem.mutate(item.id)}
                >
                  <Trash2 size={19} strokeWidth={2} />
                </button>
              </div>
            </article>
          );
        })}

        {items.length === 0 && (
          <p className="grocery-empty">
            {speechSupport.status === "supported"
              ? "Your grocery list is empty. Type an item, dictate one, snap a product, or add what your pantry says is due."
              : "Your grocery list is empty. Type an item, snap a product, or add what your pantry says is due."}
          </p>
        )}
      </div>

      <form
        className="grocery-addbar"
        onSubmit={(event) => {
          event.preventDefault();
          submitTyped();
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add an item"
          aria-label="Add an item"
        />
        <button
          type="submit"
          className="grocery-addbar-btn"
          aria-label="Add item"
          disabled={!draft.trim() || busy}
        >
          <Plus size={20} />
        </button>
        <button
          type="button"
          className="grocery-addbar-btn"
          aria-label="Add by voice"
          title={
            speechSupport.status === "supported"
              ? "Add by voice"
              : speechSupportNote(speechSupport)
          }
          disabled={speechSupport.status !== "supported"}
          onClick={() => openSheet("voice")}
        >
          <Mic size={20} />
        </button>
        <button
          type="button"
          className="grocery-addbar-btn"
          aria-label="Add by photo"
          onClick={() => openSheet("camera")}
        >
          <Camera size={20} />
        </button>
      </form>

      <AddToListSheet
        open={sheetOpen}
        initialTab={sheetTab}
        busy={busy}
        onClose={() => setSheetOpen(false)}
        onAdd={onSheetAdd}
      />

      {clearOpen && (
        <div
          className="sheet-backdrop"
          role="presentation"
          onClick={() => setClearOpen(false)}
        >
          <section
            className="sheet sheet-confirm"
            role="dialog"
            aria-modal="true"
            aria-label="Clear list"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="sheet-head">
              <h2>Clear this list?</h2>
            </header>
            <p className="dim sheet-hint">
              Removes every item from this list. Can’t be undone.
            </p>
            <div className="sheet-actions">
              <button
                type="button"
                className="sheet-secondary"
                onClick={() => setClearOpen(false)}
              >
                Keep
              </button>
              <button
                type="button"
                className="sheet-danger"
                onClick={() => clearList.mutate()}
                disabled={clearList.isPending}
              >
                {clearList.isPending ? "Clearing…" : "Clear"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
