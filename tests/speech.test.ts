import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSpeechSupport,
  speechSupportDetail,
  speechSupportNote,
} from "../src/client/lib/speech.js";

const FakeRecognition = class {};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getSpeechSupport", () => {
  it("reports no-api without a window", () => {
    vi.stubGlobal("window", undefined);
    expect(getSpeechSupport()).toEqual({
      status: "unsupported",
      reason: "no-api",
    });
  });

  it("reports no-api when neither constructor exists", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { userAgent: "test" });
    expect(getSpeechSupport()).toEqual({
      status: "unsupported",
      reason: "no-api",
    });
  });

  it("supports the standard constructor", () => {
    vi.stubGlobal("window", { SpeechRecognition: FakeRecognition });
    vi.stubGlobal("navigator", { userAgent: "test" });
    expect(getSpeechSupport()).toEqual({ status: "supported" });
  });

  it("supports the webkit-prefixed constructor", () => {
    vi.stubGlobal("window", { webkitSpeechRecognition: FakeRecognition });
    vi.stubGlobal("navigator", { userAgent: "test" });
    expect(getSpeechSupport()).toEqual({ status: "supported" });
  });

  it("treats Brave as unsupported even though the API exists", () => {
    vi.stubGlobal("window", { webkitSpeechRecognition: FakeRecognition });
    vi.stubGlobal("navigator", {
      userAgent: "test",
      brave: { isBrave: () => Promise.resolve(true) },
    });
    expect(getSpeechSupport()).toEqual({
      status: "unsupported",
      reason: "brave",
    });
  });

  it("detects Brave from the user agent as a fallback", () => {
    vi.stubGlobal("window", { webkitSpeechRecognition: FakeRecognition });
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Brave/1.70",
    });
    expect(getSpeechSupport()).toEqual({
      status: "unsupported",
      reason: "brave",
    });
  });
});

describe("speech support copy", () => {
  it("explains Brave and missing API states", () => {
    expect(
      speechSupportNote({ status: "unsupported", reason: "brave" }),
    ).toContain("Brave");
    expect(
      speechSupportNote({ status: "unsupported", reason: "no-api" }),
    ).toContain("isn't available");
    expect(
      speechSupportDetail({ status: "unsupported", reason: "brave" }),
    ).toContain("doesn't provide online speech recognition");
    expect(speechSupportNote({ status: "supported" })).toBe("");
  });
});
