import { useEffect, useMemo, useState } from "react";
import { Check, Camera, ChevronRight, Mic, Minus, Plus, Sparkles, Trash2 } from "lucide-react";
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

interface SuggestionRow {
  productId: string | null;
  rawName: string;
  qty: number;
  reasonCode: string;
  reason: string;
  confidence: number;
  evidence: { daysSince: number | null; typicalIntervalDays: number | null };
}

const SOURCE_LABEL: Record<string, string> = {
  voice: "voice",
  camera: "photo",
  auto: "pantry",
  scan: "scan",
};

function suggestionKey(suggestion: SuggestionRow): string {
  return suggestion.productId ?? suggestion.rawName.toLowerCase();
}

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

  const suggestionsQ = useQuery({
    queryKey: ["list-suggestions", listId],
    queryFn: () => api.listSuggestions(listId),
    enabled: listsQ.isSuccess,
  });

  const items: ListItemRow[] = useMemo(
    () =>
      ((listQ.data?.items ?? []) as ListItemRow[]).filter(
        (item) => item.decision !== "skip",
      ),
    [listQ.data],
  );
  const suggestions: SuggestionRow[] = suggestionsQ.data?.suggestions ?? [];

  const [draft, setDraft] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<AddSource>("voice");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
  }, [listId]);

  const invalidateList = (targetId: string) => {
    qc.invalidateQueries({ queryKey: ["list", targetId] });
    qc.invalidateQueries({ queryKey: ["list-suggestions", targetId] });
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
      setReviewOpen(false);
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
    setSheetTab(tab);
    setSheetOpen(true);
  };

  const onSheetAdd = (pending: PendingListItem[]) => {
    addItems.mutate(pending);
  };

  const openReview = () => {
    setSelectedSuggestions(new Set(suggestions.map(suggestionKey)));
    setReviewOpen(true);
  };

  const toggleSuggestion = (key: string) => {
    setSelectedSuggestions((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const acceptSuggestions = () => {
    const chosen = suggestions.filter((suggestion) =>
      selectedSuggestions.has(suggestionKey(suggestion)),
    );
    if (chosen.length === 0) return;
    addItems.mutate(
      chosen.map((suggestion) => ({
        rawName: suggestion.rawName,
        qty: suggestion.qty,
        source: "auto",
      })),
    );
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

      {suggestions.length > 0 && (
        <button type="button" className="grocery-suggest" onClick={openReview}>
          <span className="grocery-suggest-icon" aria-hidden="true">
            <Sparkles size={20} />
          </span>
          <span className="grocery-suggest-copy">
            <strong>
              {suggestions.length} item{suggestions.length === 1 ? "" : "s"} from your
              pantry
            </strong>
            <span className="grocery-suggest-note">
              Preview · pantry rhythm — predictions are being upgraded
            </span>
          </span>
          <ChevronRight size={20} />
        </button>
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
            Your grocery list is empty. Type an item, dictate one, snap a product,
            or add what your pantry says is due.
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

      {reviewOpen && (
        <div
          className="sheet-backdrop"
          role="presentation"
          onClick={() => setReviewOpen(false)}
        >
          <section
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Pantry suggestions"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="sheet-head">
              <h2>From your pantry</h2>
              <span className="preview-badge">Preview</span>
            </header>
            <p className="dim sheet-hint">
              Temporary rhythm-based suggestions for testing. The pantry prediction
              service will replace them.
            </p>
            <div className="suggestion-list">
              {suggestions.map((suggestion) => {
                const key = suggestionKey(suggestion);
                const selected = selectedSuggestions.has(key);
                return (
                  <button
                    type="button"
                    className={`suggestion-row ${selected ? "is-selected" : ""}`}
                    key={key}
                    aria-pressed={selected}
                    onClick={() => toggleSuggestion(key)}
                  >
                    <span className="suggestion-check">
                      {selected ? <Check size={16} /> : null}
                    </span>
                    <span className="suggestion-copy">
                      <strong>{suggestion.rawName}</strong>
                      <span className="dim">
                        {suggestion.reason}
                        {suggestion.evidence.daysSince !== null
                          ? ` · ${suggestion.evidence.daysSince}d ago`
                          : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="sheet-actions">
              <button
                type="button"
                className="sheet-secondary"
                onClick={() => setReviewOpen(false)}
              >
                Not now
              </button>
              <button
                type="button"
                className="sheet-primary"
                disabled={busy || selectedSuggestions.size === 0}
                onClick={acceptSuggestions}
              >
                {selectedSuggestions.size > 0
                  ? `Add ${selectedSuggestions.size} item${
                      selectedSuggestions.size === 1 ? "" : "s"
                    }`
                  : "Add items"}
              </button>
            </div>
          </section>
        </div>
      )}

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
