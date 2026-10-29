import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import chipsArt from "../../../assets/item/chips Background Removed.png";
import milkGlassArt from "../../../assets/item/milk_glass_and_carton Background Removed.png";
import breadArt from "../../../assets/item/bread_loaf Background Removed.png";
import eggsArt from "../../../assets/item/eggs Background Removed.png";
import bananasArt from "../../../assets/item/fruit_assortment Background Removed.png";
import yogurtArt from "../../../assets/item/yogurt Background Removed.png";

type Facing = "user" | "environment";
type ScanMode = "list" | "cart" | "receipt";
type CameraState = "starting" | "ready" | "captured" | "error";

const SCAN_MODES: Array<{ id: ScanMode; label: string }> = [
  { id: "list", label: "Grocery list" },
  { id: "cart", label: "Cart" },
  { id: "receipt", label: "Receipt" },
];

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

function WarningIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10.3 3.7 2.2 17.5A2 2 0 0 0 3.9 20.5h16.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12 9v4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.1" fill="currentColor" />
    </svg>
  );
}

function BanIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="m5.7 5.7 12.6 12.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SwapIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8h13m-4-4 4 4-4 4M20 16H7m4 4-4-4 4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type ActionKind = "warning" | "ban" | "swap";

interface ItemDef {
  id: string;
  name: string;
  art: string;
  frame: string;
  alt: string;
}

interface DetectedItem extends ItemDef {
  action: ActionKind;
}

const ITEM_DEFS: ItemDef[] = [
  {
    id: "chips",
    name: "Chips",
    art: chipsArt,
    frame: "cr-frame-chips",
    alt: "Bag of chips",
  },
  {
    id: "milk",
    name: "Whole milk",
    art: milkGlassArt,
    frame: "cr-frame-milk",
    alt: "Glass and carton of whole milk",
  },
  {
    id: "bread",
    name: "White bread",
    art: breadArt,
    frame: "cr-frame-bread",
    alt: "Loaf of white bread",
  },
  {
    id: "eggs",
    name: "Eggs",
    art: eggsArt,
    frame: "cr-frame-eggs",
    alt: "Carton of eggs",
  },
  {
    id: "bananas",
    name: "Bananas",
    art: bananasArt,
    frame: "cr-frame-bananas",
    alt: "Bunch of bananas",
  },
  {
    id: "yogurt",
    name: "Yogurt",
    art: yogurtArt,
    frame: "cr-frame-yogurt",
    alt: "Tub of yogurt",
  },
];

const ACTION_LABEL: Record<ActionKind, string> = {
  warning: "Warning",
  ban: "Skip this item",
  swap: "Try this swap",
};

function buildDetectedItems(): DetectedItem[] {
  const pool: ActionKind[] = ["warning", "warning", "ban", "ban", "swap", "swap"];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return ITEM_DEFS.map((item, index) => ({ ...item, action: pool[index] }));
}

function ActionIcon({ action }: { action: ActionKind }) {
  if (action === "warning") return <WarningIcon size={42} />;
  if (action === "ban") return <BanIcon size={42} />;
  return <SwapIcon size={42} />;
}

export function ScannerScreen() {
  const nav = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestIdRef = useRef(0);
  const activeDeviceIdRef = useRef<string | null>(null);

  const [flashOn, setFlashOn] = useState(false);
  const [items] = useState<DetectedItem[]>(buildDetectedItems);
  const [facing, setFacing] = useState<Facing>("user");
  const [scanMode, setScanMode] = useState<ScanMode>("receipt");
  const [cameraState, setCameraState] = useState<CameraState>("starting");
  const [cameraError, setCameraError] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);

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
    void startCamera("user");
    return () => {
      requestIdRef.current += 1;
      stopCamera();
    };
  }, [startCamera, stopCamera]);

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

        <video
          ref={videoRef}
          className={`cr-camera-feed ${facing === "user" ? "is-mirrored" : ""}`}
          autoPlay
          playsInline
          muted
        />

        {photo && <img className="cr-captured-photo" src={photo} alt="Captured scan" />}

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
        <button
          type="button"
          className="cr-control cr-control-flip"
          aria-label={`Switch to ${facing === "user" ? "back" : "front"} camera`}
          onClick={() => void flipCamera()}
        >
          <FlipCamera />
        </button>
        {SCAN_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={`cr-control ${scanMode === mode.id ? "is-active" : ""}`}
            aria-pressed={scanMode === mode.id}
            onClick={() => setScanMode(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="cr-swaps" aria-label="Detected items">
        {items.map((item) => (
          <article className="cr-swap" key={item.id}>
            <div className={`cr-swap-figure ${item.frame}`}>
              <span className="cr-swap-clip">
                <img className="cr-swap-art" src={item.art} alt={item.alt} />
              </span>
              <span
                className={`cr-action cr-action-${item.action}`}
                role="img"
                aria-label={`${ACTION_LABEL[item.action]}: ${item.name}`}
              >
                <ActionIcon action={item.action} />
              </span>
            </div>
            <div className="cr-swap-name">{item.name}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
