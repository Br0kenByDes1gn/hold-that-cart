import { describe, expect, it } from "vitest";
import { computeState } from "../src/server/domain/rhythm";

const DAY = 86_400_000;
const NOW = new Date("2026-10-28T12:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

describe("rhythm", () => {
  it("unknown with no purchases", () => {
    const s = computeState({
      purchases: [],
      defaultIntervalDays: 30,
      householdSize: 2,
      shelfLifeClass: "staple",
      imOutActive: false,
      muted: false,
      now: NOW,
    });
    expect(s.status).toBe("unknown");
    expect(s.confidence).toBe("low");
  });

  it("threshold boundaries: exactly 0.6T stocked→getting_low, 1.0T → due", () => {
    const mk = (d: number) =>
      computeState({
        purchases: [{ purchasedAt: ago(d) }],
        defaultIntervalDays: 10,
        householdSize: 2,
        shelfLifeClass: "staple",
        imOutActive: false,
        muted: false,
        now: NOW,
      });
    expect(mk(5.9).status).toBe("stocked"); // ratio 0.59
    expect(mk(6).status).toBe("getting_low"); // ratio exactly 0.6
    expect(mk(9.9).status).toBe("getting_low");
    expect(mk(10).status).toBe("due"); // ratio exactly 1.0
    expect(mk(11).status).toBe("due");
  });

  it("median of gaps with ≥3 purchases (personal rhythm)", () => {
    // gaps 5,5,20 → median 5 → T=5; last 6d ago → due
    const s = computeState({
      purchases: [{ purchasedAt: ago(31) }, { purchasedAt: ago(26) }, { purchasedAt: ago(21) }, { purchasedAt: ago(6) }],
      defaultIntervalDays: 30,
      householdSize: 2,
      shelfLifeClass: "staple",
      imOutActive: false,
      muted: false,
      now: NOW,
    });
    expect(s.T).toBeCloseTo(5, 5);
    expect(s.confidence).toBe("high");
    expect(s.status).toBe("due");
  });

  it("household scaling of defaults (4 people → half interval)", () => {
    const s2 = computeState({
      purchases: [{ purchasedAt: ago(10) }],
      defaultIntervalDays: 30,
      householdSize: 2,
      shelfLifeClass: "staple",
      imOutActive: false,
      muted: false,
      now: NOW,
    });
    const s4 = computeState({
      purchases: [{ purchasedAt: ago(10) }],
      defaultIntervalDays: 30,
      householdSize: 4,
      shelfLifeClass: "staple",
      imOutActive: false,
      muted: false,
      now: NOW,
    });
    expect(s2.T).toBe(30);
    expect(s4.T).toBe(15);
    expect(s2.status).toBe("stocked"); // 10/30
    expect(s4.status).toBe("getting_low"); // 10/15
  });

  it("I'm out forces due until next purchase", () => {
    const s = computeState({
      purchases: [{ purchasedAt: ago(2) }],
      defaultIntervalDays: 30,
      householdSize: 2,
      shelfLifeClass: "staple",
      imOutActive: true,
      muted: false,
      now: NOW,
    });
    expect(s.status).toBe("due");
    expect(s.imOut).toBe(true);
  });

  it("durable with null default → owned means stocked (strong hold), never crashes", () => {
    const s = computeState({
      purchases: [{ purchasedAt: ago(90) }],
      defaultIntervalDays: null,
      householdSize: 2,
      shelfLifeClass: "durable",
      imOutActive: false,
      muted: false,
      now: NOW,
    });
    expect(s.status).toBe("stocked");
    expect(s.confidence).toBe("high");
  });

  it("durable with no purchases → unknown", () => {
    const s = computeState({
      purchases: [],
      defaultIntervalDays: null,
      householdSize: 2,
      shelfLifeClass: "durable",
      imOutActive: false,
      muted: false,
      now: NOW,
    });
    expect(s.status).toBe("unknown");
  });
});
