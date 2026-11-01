import { useEffect, useRef, useState } from "react";
import { Camera, Check, Mic, Minus, Plus, Sparkles, X } from "lucide-react";

import { api } from "../api";
import { fileToDataUrl } from "../lib/image";
import { useDictation } from "../lib/speech";
import { parseListText } from "../../shared/listText";

export type AddSource = "voice" | "camera";

export interface PendingListItem {
  rawName: string;
  qty: number;
  source: AddSource;
  brand?: string | null;
  productId?: string | null;
}

interface DetectedItem {
  rawName: string;
  selected: boolean;
}

interface VoiceMatch {
  productId: string | null;
  productName: string | null;
  inPantry: boolean;
}

interface VoiceRow {
  id: string;
  name: string;
  brand: string | null;
  qty: number;
  match: VoiceMatch;
}

interface AddToListSheetProps {
  open: boolean;
  initialTab?: AddSource;
  busy?: boolean;
  onClose: () => void;
  onAdd: (items: PendingListItem[]) => void;
}

const NO_MATCH: VoiceMatch = {
  productId: null,
  productName: null,
  inPantry: false,
};

export function AddToListSheet({
  open,
  initialTab = "voice",
  busy = false,
  onClose,
  onAdd,
}: AddToListSheetProps) {
  const [tab, setTab] = useState<AddSource>(initialTab);
  const dictation = useDictation();

  const [photo, setPhoto] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [detected, setDetected] = useState<DetectedItem[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [voiceRows, setVoiceRows] = useState<VoiceRow[]>([]);
  const [voiceSource, setVoiceSource] = useState<"model" | "fallback" | null>(
    null,
  );
  const [parsing, setParsing] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [parsedTranscript, setParsedTranscript] = useState("");
  const wasListening = useRef(false);
  const nextRowId = useRef(0);

  const splitVoice = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setParsing(true);
    setVoiceError("");
    setVoiceRows([]);
    setVoiceSource(null);
    try {
      const data: any = await api.parseList(trimmed);
      const rows: VoiceRow[] = (data.items ?? [])
        .map((item: any) => ({
          id: `voice-${nextRowId.current++}`,
          name: String(item.name ?? "").trim(),
          brand: item.brand ? String(item.brand).trim() : null,
          qty: Math.max(1, Math.min(99, Math.round(Number(item.qty) || 1))),
          match: item.match ?? NO_MATCH,
        }))
        .filter((row: VoiceRow) => row.name.length > 0);
      setVoiceRows(rows);
      setVoiceSource(data.source === "model" ? "model" : "fallback");
      setParsedTranscript(trimmed);
      if (rows.length === 0) {
        setVoiceError("I couldn't find any items in that. Try again or type them.");
      }
    } catch {
      const rows: VoiceRow[] = parseListText(trimmed)
        .map((item) => ({
          id: `voice-${nextRowId.current++}`,
          name: item.rawName,
          brand: null,
          qty: item.qty,
          match: NO_MATCH,
        }));
      setVoiceRows(rows);
      setVoiceSource("fallback");
      setParsedTranscript(trimmed);
      setVoiceError("Couldn't reach the splitter — check the items.");
    } finally {
      setParsing(false);
    }
  };

  useEffect(() => {
    if (!open) {
      dictation.reset();
      wasListening.current = false;
      return;
    }
    setTab(initialTab);
    dictation.reset();
    setPhoto(null);
    setReading(false);
    setCameraError("");
    setDetected([]);
    setVoiceRows([]);
    setVoiceSource(null);
    setParsing(false);
    setVoiceError("");
    setParsedTranscript("");
    wasListening.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab]);

  // Parse once, when dictation ends (tap stop or the browser ends on silence).
  useEffect(() => {
    if (!open) {
      wasListening.current = false;
      return;
    }
    if (wasListening.current && !dictation.listening) {
      wasListening.current = false;
      const text = dictation.transcript.trim();
      if (text) void splitVoice(text);
      return;
    }
    wasListening.current = dictation.listening;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dictation.listening, dictation.transcript]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onTranscriptChange = (value: string) => {
    dictation.setTranscript(value);
    // The previous parse no longer matches the text.
    setVoiceRows([]);
    setVoiceSource(null);
    setVoiceError("");
    setParsedTranscript("");
  };

  const updateRow = (id: string, patch: Partial<VoiceRow>) => {
    setVoiceRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const changeRowQty = (id: string, delta: number) => {
    setVoiceRows((rows) =>
      rows.map((row) =>
        row.id === id
          ? { ...row, qty: Math.max(1, Math.min(99, row.qty + delta)) }
          : row,
      ),
    );
  };

  const readPhoto = async (dataUrl: string) => {
    setReading(true);
    setCameraError("");
    setDetected([]);
    try {
      const data: any = await api.aiExtract(dataUrl, "product");
      const items = (data.items ?? [])
        .map((item: any) => ({
          rawName: String(item.normalizedName || item.rawName || "").trim(),
          selected: true,
        }))
        .filter((item: DetectedItem) => item.rawName.length > 0);
      if (items.length === 0) {
        throw new Error("I couldn't name that product. Try a clearer photo.");
      }
      setDetected(items);
    } catch (error: any) {
      setCameraError(
        `Couldn't read that photo. ${String(error?.message ?? error).slice(0, 160)}`,
      );
    } finally {
      setReading(false);
    }
  };

  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setPhoto(dataUrl);
      await readPhoto(dataUrl);
    } catch (error: any) {
      setCameraError(String(error?.message ?? error));
    }
  };

  const selectedCameraItems = detected.filter((item) => item.selected);
  const canAddVoice =
    voiceRows.length > 0 &&
    voiceRows.every((row) => row.name.trim().length > 0);
  const canSplit =
    !dictation.listening &&
    dictation.transcript.trim().length > 0 &&
    (voiceRows.length === 0 ||
      dictation.transcript.trim() !== parsedTranscript);

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Add items to your list"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sheet-head">
          <h2>Add items</h2>
          <button
            type="button"
            className="sheet-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        <div className="sheet-tabs" role="tablist" aria-label="Add method">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "voice"}
            className={`sheet-tab ${tab === "voice" ? "is-active" : ""}`}
            onClick={() => setTab("voice")}
          >
            <Mic size={18} /> Voice
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "camera"}
            className={`sheet-tab ${tab === "camera" ? "is-active" : ""}`}
            onClick={() => setTab("camera")}
          >
            <Camera size={18} /> Camera
          </button>
        </div>

        {tab === "voice" ? (
          <div className="sheet-panel">
            {dictation.supported ? (
              <button
                type="button"
                className={`voice-mic ${dictation.listening ? "is-listening" : ""}`}
                onClick={dictation.listening ? dictation.stop : dictation.start}
              >
                <Mic size={22} />
                <span>{dictation.listening ? "Listening…" : "Tap and speak"}</span>
              </button>
            ) : (
              <p className="dim">
                Voice input isn't supported in this browser. Type the item instead.
              </p>
            )}

            <p className="dim sheet-hint">
              Just say the products: “milk, two eggs, Borges olive oil”.
            </p>

            <label className="sheet-field">
              <span>Your items</span>
              <textarea
                value={dictation.transcript}
                onChange={(event) => onTranscriptChange(event.target.value)}
                placeholder="Items appear here — edit anything."
                rows={3}
              />
            </label>

            {canSplit && (
              <button
                type="button"
                className="sheet-secondary sheet-split"
                onClick={() => void splitVoice(dictation.transcript)}
                disabled={parsing}
              >
                <Sparkles size={16} /> Split items
              </button>
            )}

            {parsing && <p className="dim">Reading your list…</p>}

            {voiceRows.length > 0 && (
              <div className="voice-items" aria-label="Parsed items">
                {voiceRows.map((row, index) => (
                  <div className="voice-item" key={row.id}>
                    <div className="voice-item-fields">
                      <input
                        value={row.name}
                        onChange={(event) =>
                          updateRow(row.id, {
                            name: event.target.value,
                            // A renamed item no longer matches the old pantry product.
                            match: NO_MATCH,
                          })
                        }
                        aria-label={`Item ${index + 1} name`}
                      />
                      <input
                        value={row.brand ?? ""}
                        onChange={(event) =>
                          updateRow(row.id, {
                            brand: event.target.value || null,
                          })
                        }
                        placeholder="Brand (optional)"
                        aria-label={`Item ${index + 1} brand`}
                      />
                    </div>
                    <div className="voice-item-meta">
                      <div className="grocery-qty">
                        <button
                          type="button"
                          className="grocery-step"
                          aria-label={`One less ${row.name}`}
                          onClick={() => changeRowQty(row.id, -1)}
                          disabled={row.qty <= 1}
                        >
                          <Minus size={13} />
                        </button>
                        <span className="grocery-item-qty">Qty {row.qty}</span>
                        <button
                          type="button"
                          className="grocery-step"
                          aria-label={`One more ${row.name}`}
                          onClick={() => changeRowQty(row.id, 1)}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      <span
                        className={`voice-match ${row.match.inPantry ? "in-pantry" : ""}`}
                      >
                        {row.match.inPantry
                          ? `In pantry: ${row.match.productName ?? row.name}`
                          : "New item"}
                      </span>
                      <button
                        type="button"
                        className="voice-remove"
                        aria-label={`Remove ${row.name}`}
                        onClick={() =>
                          setVoiceRows((rows) =>
                            rows.filter((current) => current.id !== row.id),
                          )
                        }
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {voiceSource === "fallback" && voiceRows.length > 0 && (
              <p className="dim sheet-hint">
                Automatic splitting was unavailable — check the items.
              </p>
            )}
            {dictation.error && <p className="error">{dictation.error}</p>}
            {voiceError && <p className="error">{voiceError}</p>}

            <button
              type="button"
              className="sheet-primary"
              disabled={busy || parsing || !canAddVoice}
              onClick={() =>
                onAdd(
                  voiceRows.map((row) => ({
                    rawName: row.name.trim(),
                    brand: row.brand?.trim() || null,
                    qty: row.qty,
                    productId: row.match.productId,
                    source: "voice" as const,
                  })),
                )
              }
            >
              {voiceRows.length > 0
                ? `Add ${voiceRows.length} item${voiceRows.length === 1 ? "" : "s"}`
                : "Add items"}
            </button>
          </div>
        ) : (
          <div className="sheet-panel">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(event) => {
                void onPickPhoto(event.target.files?.[0]);
                event.target.value = "";
              }}
            />

            <button
              type="button"
              className={`camera-btn ${photo ? "has-photo" : ""}`}
              onClick={() => fileRef.current?.click()}
            >
              {photo ? (
                <img src={photo} alt="Product photo" />
              ) : (
                <>
                  <Camera size={26} />
                  <span>Take a product photo</span>
                </>
              )}
            </button>

            <p className="dim sheet-hint">
              Photograph the product label. You can correct the name before
              adding.
            </p>

            {reading && <p className="dim">Reading the label…</p>}
            {cameraError && <p className="error">{cameraError}</p>}

            {detected.length > 0 && (
              <div className="detected-list" aria-label="Detected products">
                {detected.map((item, index) => (
                  <div className={`detected-row ${item.selected ? "is-selected" : ""}`} key={index}>
                    <button
                      type="button"
                      className="detected-check"
                      aria-label={
                        item.selected
                          ? `Don't add ${item.rawName}`
                          : `Add ${item.rawName}`
                      }
                      aria-pressed={item.selected}
                      onClick={() =>
                        setDetected(
                          detected.map((current, i) =>
                            i === index
                              ? { ...current, selected: !current.selected }
                              : current,
                          ),
                        )
                      }
                    >
                      {item.selected ? <Check size={16} /> : null}
                    </button>
                    <input
                      value={item.rawName}
                      onChange={(event) =>
                        setDetected(
                          detected.map((current, i) =>
                            i === index
                              ? { ...current, rawName: event.target.value }
                              : current,
                          ),
                        )
                      }
                      aria-label="Product name"
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className="sheet-primary"
              disabled={busy || selectedCameraItems.length === 0}
              onClick={() =>
                onAdd(
                  selectedCameraItems.map((item) => ({
                    rawName: item.rawName,
                    brand: null,
                    productId: null,
                    qty: 1,
                    source: "camera" as const,
                  })),
                )
              }
            >
              {selectedCameraItems.length > 0
                ? `Add ${selectedCameraItems.length} item${selectedCameraItems.length === 1 ? "" : "s"}`
                : "Add items"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
