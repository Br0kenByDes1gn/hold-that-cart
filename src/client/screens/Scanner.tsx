import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";

import { resolveItemArt } from "../lib/itemArt";
import { fileToDataUrl } from "../lib/image";

type Facing = "user" | "environment";
type ScanMode = "list" | "cart" | "receipt";
type CameraState = "starting" | "ready" | "captured" | "error";

const SCAN_MODES: Array<{ id: ScanMode; label: string }> = [
  { id: "list", label: "Grocery list" },
  { id: "cart", label: "Cart" },
  { id: "receipt", label: "Receipt" },
];

// Demo-camera props: shown instead of a live feed when the scanner is opened
// with ?demo=1 (or ?demo=receipt|cart). The detections still come from the
// deterministic JSON fixtures; the photos only make the scan look real.
const DEMO_RECEIPT_IMAGE = "/fixtures/receipt-demo.jpeg";
const DEMO_CART_IMAGE = "/fixtures/cart-demo.jpeg";

function demoParamFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("demo");
}

function ChevronLeft({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m15 18-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Zap({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2 4.5 13.2c-.4.55 0 1.3.68 1.3H11l-1 7.5 8.5-11.2c.4-.55 0-1.3-.68-1.3H12l1-7.5Z" />
    </svg>
  );
}

function Flashlight({ size = 25 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 2h12v4H6V2Zm2 4h8l1 5H7l1-5Zm1 5h6v9a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-9Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 14v3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function FlipCamera({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CameraIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13.5" r="3.2" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  );
}

function RotateIcon({ size = 25 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 11a8 8 0 1 0-.6 4M20 4v7h-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ScannerScreen() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestIdRef = useRef(0);
  const activeDeviceIdRef = useRef<string | null>(null);

  const [flashOn, setFlashOn] = useState(false);
  const [extracted, setExtracted] = useState<any[]>([]);
  const [detectedKind, setDetectedKind] = useState<string>("receipt");
  const [scanId, setScanId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [facing, setFacing] = useState<Facing>("user");
  const [demoParam] = useState<string | null>(() => demoParamFromLocation());
  const demoEnabled =
    demoParam === "1" || demoParam === "receipt" || demoParam === "cart";
  const [scanMode, setScanMode] = useState<ScanMode>(
    demoParam === "cart" ? "cart" : "receipt",
  );
  const demoImage =
    demoEnabled && scanMode === "cart"
      ? DEMO_CART_IMAGE
      : demoEnabled && scanMode === "receipt"
        ? DEMO_RECEIPT_IMAGE
        : null;
  const demoKind: "cart" | "receipt" = scanMode === "cart" ? "cart" : "receipt";
  const [cameraState, setCameraState] = useState<CameraState>(
    demoEnabled ? "ready" : "starting",
  );
  const [cameraError, setCameraError] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const demoTimerRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const refreshVideoDevices = useCallback(async () => {
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "videoinput",
      );
      setVideoDevices(devices);
      return devices;
    } catch {
      return [];
    }
  }, []);

  const startCamera = useCallback(
    async (nextFacing: Facing, allowFallback = true, deviceId?: string) => {
      const requestId = ++requestIdRef.current;
      stopCamera();
      setPhoto(null);
      setCameraError("");
      setCameraState("starting");

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera API not available");
        }

        const video: MediaTrackConstraints = {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        };
        if (deviceId) {
          video.deviceId = { exact: deviceId };
        } else {
          video.facingMode = nextFacing;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video,
        });

        if (requestId !== requestIdRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        activeDeviceIdRef.current =
          stream.getVideoTracks()[0]?.getSettings().deviceId ?? null;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        if (requestId !== requestIdRef.current) return;
        setFacing(nextFacing);
        setCameraState("ready");
        void refreshVideoDevices();
      } catch {
        if (requestId !== requestIdRef.current) return;
        if (allowFallback) {
          if (deviceId) {
            await startCamera(nextFacing, false);
            return;
          }
          if (nextFacing !== "user") {
            await startCamera("user", false);
            return;
          }
        }
        setCameraState("error");
        setCameraError("Camera unavailable. Allow camera access in your browser, then try again.");
      }
    },
    [refreshVideoDevices, stopCamera],
  );

  useEffect(() => {
    if (demoEnabled) {
      stopCamera();
      setCameraState("ready");
      setCameraError("");
      return () => {
        requestIdRef.current += 1;
        stopCamera();
      };
    }
    void startCamera("user");
    return () => {
      requestIdRef.current += 1;
      stopCamera();
    };
  }, [demoEnabled, startCamera, stopCamera]);

  useEffect(
    () => () => {
      if (demoTimerRef.current !== null) {
        window.clearTimeout(demoTimerRef.current);
      }
    },
    [],
  );

  const goBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      nav({ to: "/mode" });
    }
  };

  const flipCamera = async () => {
    const nextFacing: Facing = facing === "user" ? "environment" : "user";
    const devices =
      videoDevices.length > 0 ? videoDevices : await refreshVideoDevices();

    if (devices.length > 1) {
      const currentId = activeDeviceIdRef.current;
      const currentIndex = devices.findIndex((device) => device.deviceId === currentId);
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % devices.length : 0;
      await startCamera(nextFacing, true, devices[nextIndex].deviceId);
      return;
    }

    await startCamera(nextFacing);
  };

  const capturePhoto = () => {
    if (demoImage) {
      if (photo) {
        setPhoto(null);
        setCameraState("ready");
        setCameraError("");
        return;
      }
      if (demoTimerRef.current !== null) {
        window.clearTimeout(demoTimerRef.current);
      }
      setExtracted([]);
      setScanId(null);
      setExtractError("");
      setPhoto(demoImage);
      setCameraState("captured");
      setCameraError("");
      setBusy(true);
      // Keep the captured frame on screen briefly so it reads as a real scan
      // before the deterministic fixture results appear.
      demoTimerRef.current = window.setTimeout(() => {
        demoTimerRef.current = null;
        void loadFixture();
      }, 700);
      return;
    }

    if (photo) {
      void startCamera(facing, true, activeDeviceIdRef.current ?? undefined);
      return;
    }

    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) {
      setCameraError("Camera is still starting. Try again in a moment.");
      return;
    }

    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCameraError("Couldn't capture a photo.");
      return;
    }

    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    setPhoto(canvas.toDataURL("image/jpeg", 0.88));
    setCameraState("captured");
    setCameraError("");
    stopCamera();
    void runExtract(canvas.toDataURL("image/jpeg", 0.88));
  };

  const runExtract = async (image: string) => {
    setBusy(true);
    setExtractError("");
    try {
      const data: any = await api.aiExtract(image, scanMode);
      const items = data.items ?? [];
      setDetectedKind(data.kind ?? scanMode);
      setExtracted(items);
      const scan = await api.createScan(data.kind ?? scanMode, items);
      setScanId(scan.id);
      // Re-match against pantry for the correction UI
      if (Array.isArray(scan.matches)) setExtracted(scan.matches);
    } catch (e: any) {
      setExtractError(
        `Couldn't read that photo. ${String(e?.message ?? e).slice(0, 180)} Try the demo items below.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const loadFixture = async () => {
    setBusy(true);
    setExtractError("");
    try {
      const file = scanMode === "receipt" ? "receipt-1.json" : scanMode === "cart" ? "cart-1.json" : "list-1.json";
      const arr = await fetch(`/fixtures/${file}`).then((r) => r.json());
      const scan = await api.createScan(scanMode, arr);
      setDetectedKind(scan.kind);
      setScanId(scan.id);
      setExtracted(scan.matches ?? arr);
    } catch (e: any) {
      setExtractError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = useMutation({
    mutationFn: () => {
      if (!scanId) throw new Error("nothing to confirm");
      const payload = extracted.map((it) => ({
        rawName: it.rawName,
        normalizedName: it.normalizedName,
        category: it.category,
        productId: it.match?.productId ?? it.productId ?? null,
        qty: it.qty ?? 1,
        packQty: it.packQty,
        packUnit: it.packUnit,
        price: it.price,
        brand: it.brand,
      }));
      return api.confirmScan(scanId, detectedKind, payload);
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries();
      if (data.listId) nav({ to: "/lists/$listId", params: { listId: data.listId } });
      else nav({ to: "/pantry" });
    },
    onError: (e: any) => setExtractError(e.message),
  });

  const chooseMode = (mode: ScanMode) => {
    setScanMode(mode);
    if (demoEnabled) {
      setPhoto(null);
      setCameraState("ready");
      setCameraError("");
      setExtracted([]);
      setScanId(null);
    }
  };

  return (
    <div className="scanner-page">
      <header className="cr-header">
        <button type="button" className="cr-icon-btn cr-back" aria-label="Go back" onClick={goBack}>
          <ChevronLeft />
        </button>

        <div className="cr-heading">
          <div className="cr-title-row">
            <Zap size={18} />
            <h1 className="cr-title">Cart Radar</h1>
          </div>
          <p className="cr-subtitle">Scan your list, cart or receipt</p>
        </div>

        <button
          type="button"
          className={`cr-icon-btn cr-flash ${flashOn ? "is-active" : ""}`}
          aria-label={flashOn ? "Turn flashlight off" : "Turn flashlight on"}
          aria-pressed={flashOn}
          onClick={() => setFlashOn((on) => !on)}
        >
          <Flashlight />
        </button>
      </header>

      <button
        type="button"
        className="cr-pantry-btn"
        onClick={() => nav({ to: "/pantry" })}
      >
        Pantry
      </button>

      <section
        className={`cr-scanner ${photo ? "has-photo" : ""}`}
        aria-label="Cart Radar camera preview"
      >
        <span className="cr-corner cr-corner-tl" />
        <span className="cr-corner cr-corner-tr" />
        <span className="cr-corner cr-corner-bl" />
        <span className="cr-corner cr-corner-br" />

        {!demoEnabled && (
          <video
            ref={videoRef}
            className={`cr-camera-feed ${facing === "user" ? "is-mirrored" : ""}`}
            autoPlay
            playsInline
            muted
          />
        )}

        {demoImage && !photo && (
          <img
            className={`cr-camera-feed cr-demo-feed is-${demoKind}`}
            src={demoImage}
            alt=""
          />
        )}

        {photo && (
          <img
            className={`cr-captured-photo ${
              demoEnabled ? `cr-demo-photo is-${demoKind}` : ""
            }`}
            src={photo}
            alt="Captured scan"
          />
        )}

        <div className="cr-scan-beam" aria-hidden="true" />

        {cameraState === "starting" && !photo && (
          <div className="cr-camera-message">Starting camera…</div>
        )}

        {cameraState === "error" && !photo && (
          <div className="cr-camera-message cr-camera-message-error">
            <p>{cameraError}</p>
            <button
              type="button"
              className="cr-retry"
              onClick={() => void startCamera(facing)}
            >
              Try again
            </button>
          </div>
        )}

      </section>

      <button
        type="button"
        className="cr-capture"
        aria-label={photo ? "Retake photo" : `Take ${scanMode} photo`}
        onClick={capturePhoto}
      >
        {photo ? <RotateIcon size={20} /> : <CameraIcon size={20} />}
        <span>{photo ? "Retake photo" : "Take photo"}</span>
      </button>

      <div className="cr-controls" role="group" aria-label="Scan type">
        {!demoEnabled && (
          <button
            type="button"
            className="cr-control cr-control-flip"
            aria-label={`Switch to ${facing === "user" ? "back" : "front"} camera`}
            onClick={() => void flipCamera()}
          >
            <FlipCamera />
          </button>
        )}
        {SCAN_MODES.filter((mode) => !demoEnabled || mode.id !== "list").map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={`cr-control ${scanMode === mode.id ? "is-active" : ""}`}
            aria-pressed={scanMode === mode.id}
            onClick={() => chooseMode(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="row" style={{ padding: "0 16px" }}>
        <label className="btn">
          Upload photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const dataUrl = await fileToDataUrl(f);
                setPhoto(dataUrl);
                setCameraState("captured");
                void runExtract(dataUrl);
              } catch (err: any) {
                setExtractError(String(err?.message ?? err));
              }
            }}
          />
        </label>
        <button type="button" onClick={() => void loadFixture()} disabled={busy}>
          Use demo {scanMode}
        </button>
      </div>

      {busy && <p style={{ padding: "0 16px" }}>Reading…</p>}
      {extractError && <p className="error" style={{ padding: "0 16px" }}>{extractError}</p>}

      {extracted.length > 0 && (
        <div className="cr-swaps" aria-label="Detected items">
          {extracted.map((it, i) => {
            const a = resolveItemArt(it);
            return (
              <article className="cr-swap" key={i}>
                <div className="cr-swap-figure cr-frame-category">
                  <span className="cr-swap-clip">
                    <img className="cr-swap-art" src={a.entry.url} alt={a.categoryLabel} />
                  </span>
                </div>
                <div className="cr-swap-name">{it.rawName}</div>
                <div className="cr-swap-category">{a.categoryLabel}</div>
              </article>
            );
          })}
        </div>
      )}

      {extracted.length > 0 && (
        <div style={{ padding: "0 16px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
          <h3>Detected ({detectedKind}) — correct before confirming</h3>
          {extracted.map((it, i) => (
            <div className="srow" key={i}>
              <div className="srow-body">
                <input
                  value={it.rawName}
                  onChange={(e) =>
                    setExtracted(
                      extracted.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              rawName: e.target.value,
                              normalizedName: e.target.value,
                              category: "other",
                              productId: null,
                              match: undefined,
                            }
                          : x,
                      ),
                    )
                  }
                />
                <div className="dim">
                  {it.normalizedName} · {resolveItemArt(it).categoryLabel} · qty {it.qty ?? 1}
                  {it.price != null ? ` · €${it.price}` : ""}
                  {it.match?.productId ? " · ✓ matched" : " · new item"}
                </div>
              </div>
              <button onClick={() => setExtracted(extracted.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <div className="row">
            <button
              onClick={() =>
                setExtracted([
                  ...extracted,
                  {
                    rawName: "New item",
                    normalizedName: "new item",
                    category: "other",
                    qty: 1,
                  },
                ])
              }
            >
              + Add item
            </button>
            <button onClick={() => confirm.mutate()} disabled={confirm.isPending}>
              {confirm.isPending
                ? detectedKind === "receipt"
                  ? "Classifying items…"
                  : "Saving…"
                : detectedKind === "receipt"
                  ? "Confirm → add to pantry"
                  : "Confirm → make list"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
