import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Mic, X } from "lucide-react";

import { api } from "../api";
import { fileToDataUrl } from "../lib/image";
import { useDictation } from "../lib/speech";
import { parseListText } from "../../shared/listText";

export type AddSource = "voice" | "camera";

export interface PendingListItem {
  rawName: string;
  qty: number;
  source: AddSource;
}

interface DetectedItem {
  rawName: string;
  selected: boolean;
}

interface AddToListSheetProps {
  open: boolean;
  initialTab?: AddSource;
  busy?: boolean;
  onClose: () => void;
  onAdd: (items: PendingListItem[]) => void;
}

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

  const parsed = useMemo(() => parseListText(dictation.transcript), [dictation.transcript]);

  useEffect(() => {
    if (!open) {
      dictation.reset();
      return;
    }
    setTab(initialTab);
    dictation.reset();
    setPhoto(null);
    setReading(false);
    setCameraError("");
    setDetected([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

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
              Say your list: “milk, two eggs and bread”.
            </p>

            <label className="sheet-field">
              <span>Your items</span>
              <textarea
                value={dictation.transcript}
                onChange={(event) => dictation.setTranscript(event.target.value)}
                placeholder="Items appear here — edit anything."
                rows={3}
              />
            </label>

            {parsed.length > 0 && (
              <div className="parsed-chips" aria-label="Parsed items">
                {parsed.map((item) => (
                  <span className="parsed-chip" key={item.rawName}>
                    {item.rawName} ×{item.qty}
                  </span>
                ))}
              </div>
            )}

            {dictation.error && <p className="error">{dictation.error}</p>}

            <button
              type="button"
              className="sheet-primary"
              disabled={busy || parsed.length === 0}
              onClick={() =>
                onAdd(parsed.map((item) => ({ ...item, source: "voice" as const })))
              }
            >
              {parsed.length > 0
                ? `Add ${parsed.length} item${parsed.length === 1 ? "" : "s"}`
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
