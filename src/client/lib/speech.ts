import { useCallback, useEffect, useRef, useState } from "react";

// Minimal Web Speech API typings — `lib.dom` does not ship SpeechRecognition.
interface SpeechAlternativeLike {
  transcript: string;
}
interface SpeechResultLike {
  isFinal: boolean;
  0: SpeechAlternativeLike;
}
interface SpeechResultListLike {
  length: number;
  [index: number]: SpeechResultLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechResultListLike;
}
interface SpeechRecognitionErrorLike {
  error: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/**
 * - `no-api`: no SpeechRecognition constructor (Firefox et al.).
 * - `brave`: the constructor exists, but Brave blocks the cloud speech service
 *   and every attempt fails with a misleading `network` error.
 */
export type SpeechSupport =
  | { status: "supported" }
  | { status: "unsupported"; reason: "no-api" | "brave" };

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function isBrave(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    brave?: { isBrave?: () => Promise<boolean> };
  };
  if (typeof nav.brave?.isBrave === "function") return true;
  return /\bBrave\//.test(nav.userAgent ?? "");
}

export function getSpeechSupport(): SpeechSupport {
  if (!recognitionCtor()) return { status: "unsupported", reason: "no-api" };
  if (isBrave()) return { status: "unsupported", reason: "brave" };
  return { status: "supported" };
}

/** Short note shown next to the grocery list. */
export function speechSupportNote(support: SpeechSupport): string {
  if (support.status === "supported") return "";
  return support.reason === "brave"
    ? "Brave blocks voice input. Type items instead."
    : "Voice isn't available here. Type items instead.";
}

/** Longer explanation shown inside the add-items sheet. */
export function speechSupportDetail(support: SpeechSupport): string {
  if (support.status === "supported") return "";
  return support.reason === "brave"
    ? "Brave doesn't provide online speech recognition. Type the items below."
    : "Voice input isn't supported in this browser. Type the items below.";
}

function errorMessage(code: string): string {
  if (code === "not-allowed") {
    return "Allow microphone access in your browser, then try again.";
  }
  if (code === "service-not-allowed") {
    return "Speech recognition is blocked in this browser. Type the items instead.";
  }
  if (code === "no-speech") return "I didn't hear anything. Try again.";
  if (code === "network") {
    return isBrave()
      ? "Brave doesn't provide online speech recognition. Type the items instead."
      : "Speech recognition is unavailable. Check your connection and try again.";
  }
  if (code === "audio-capture") return "No microphone was found.";
  if (code === "aborted") return "";
  return "Voice input stopped. Try again.";
}

/**
 * Browser dictation. Audio stays on-device in the browser's speech service;
 * this hook is the client seam that a Meta transcription endpoint can replace.
 */
export function useDictation() {
  const [support] = useState<SpeechSupport>(() => getSpeechSupport());
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const supportNow = getSpeechSupport();
    if (supportNow.status !== "supported") {
      setError(speechSupportDetail(supportNow));
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setError("Voice input isn't supported in this browser. Type the items instead.");
      return;
    }

    recognitionRef.current?.abort();
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      let finalText = finalRef.current;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += `${text} `;
        else interim += text;
      }
      finalRef.current = finalText;
      setTranscript(`${finalText}${interim}`.trim());
    };
    recognition.onerror = (event) => {
      setError(errorMessage(event.error));
      setListening(false);
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    finalRef.current = "";
    setTranscript("");
    setError("");
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("Voice input couldn't start. Try again.");
    }
  }, []);

  const stop = useCallback(() => {
    // Let the browser finalise the last result; `onend` flips `listening`.
    recognitionRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    finalRef.current = "";
    setListening(false);
    setTranscript("");
    setError("");
  }, []);

  return {
    support,
    supported: support.status === "supported",
    listening,
    transcript,
    error,
    setTranscript,
    start,
    stop,
    reset,
  };
}
