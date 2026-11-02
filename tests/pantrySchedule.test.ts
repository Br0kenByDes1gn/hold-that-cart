import { describe, expect, it } from "vitest";
import {
  AUTO_ADD_INTERVAL_DAYS,
  LIST_REFRESH_DAYS,
  autoAddCandidates,
  buildPantrySchedule,
  nextRefreshAt,
  scheduleItem,
  shouldRefresh,
  type PantryScheduleInput,
} from "../src/server/domain/pantrySchedule.js";

const NOW = new Date("2026-11-02T12:00:00.000Z");
const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

function input(
  overrides: Partial<PantryScheduleInput> = {},
): PantryScheduleInput {
  return {
    productId: "11111111-1111-4111-8111-111111111111",
    name: "Milk",
    shelfLifeClass: "perishable",
    lastPurchasedAt: daysAgo(0),
    ...overrides,
  };
}

describe("pantrySchedule category intervals", () => {
  it("uses the fixed product-type intervals", () => {
    expect(AUTO_ADD_INTERVAL_DAYS).toEqual({
      perishable: 3,
      staple: 14,
      household: 60,
      durable: 365,
      unknown: null,
    });
    expect(LIST_REFRESH_DAYS).toBe(3);
  });

  it("marks a perishable due exactly on day 3", () => {
    const early = scheduleItem(input({ lastPurchasedAt: daysAgo(2) }), NOW);
    expect(early).toMatchObject({ due: false, daysLeft: 1, intervalDays: 3 });

    const onMark = scheduleItem(input({ lastPurchasedAt: daysAgo(3) }), NOW);
    expect(onMark).toMatchObject({ due: true, daysLeft: 0 });

    const late = scheduleItem(input({ lastPurchasedAt: daysAgo(4) }), NOW);
    expect(late).toMatchObject({ due: true, daysLeft: 0 });
  });

  it("honours the staple (2 weeks) boundary", () => {
    const early = scheduleItem(
      input({ shelfLifeClass: "staple", lastPurchasedAt: daysAgo(13) }),
      NOW,
    );
    expect(early).toMatchObject({ due: false, daysLeft: 1, intervalDays: 14 });

    const onMark = scheduleItem(
      input({ shelfLifeClass: "staple", lastPurchasedAt: daysAgo(14) }),
      NOW,
    );
    expect(onMark).toMatchObject({ due: true, daysLeft: 0 });
  });

  it("honours the household (2 months) boundary", () => {
    const early = scheduleItem(
      input({ shelfLifeClass: "household", lastPurchasedAt: daysAgo(59) }),
      NOW,
    );
    expect(early).toMatchObject({ due: false, daysLeft: 1, intervalDays: 60 });

    const onMark = scheduleItem(
      input({ shelfLifeClass: "household", lastPurchasedAt: daysAgo(60) }),
      NOW,
    );
    expect(onMark).toMatchObject({ due: true, daysLeft: 0 });
  });

  it("honours the durable (1 year) boundary", () => {
    const early = scheduleItem(
      input({ shelfLifeClass: "durable", lastPurchasedAt: daysAgo(364) }),
      NOW,
    );
    expect(early).toMatchObject({ due: false, daysLeft: 1, intervalDays: 365 });

    const onMark = scheduleItem(
      input({ shelfLifeClass: "durable", lastPurchasedAt: daysAgo(365) }),
      NOW,
    );
    expect(onMark).toMatchObject({ due: true, daysLeft: 0 });
  });

  it("gives unknown products no schedule", () => {
    const item = scheduleItem(
      input({ shelfLifeClass: "unknown", lastPurchasedAt: daysAgo(100) }),
      NOW,
    );
    expect(item).toMatchObject({
      intervalDays: null,
      dueAt: null,
      daysLeft: null,
      due: false,
    });
  });

  it("exposes the normalized name only", () => {
    const item = scheduleItem(input({ name: "Olive Oil" }), NOW);
    expect(item.name).toBe("olive oil");
  });

  it("carries muted, on-list and auto-added state", () => {
    const addedAt = daysAgo(1);
    const item = scheduleItem(
      input({ muted: true, onList: true, autoAddedAt: addedAt }),
      NOW,
    );
    expect(item).toMatchObject({ muted: true, onList: true, autoAddedAt: addedAt });
  });
});

describe("pantrySchedule ordering and candidates", () => {
  it("sorts perishables first, then by days left", () => {
    const schedule = buildPantrySchedule(
      [
        input({
          productId: "22222222-2222-4222-8222-222222222222",
          name: "Rice",
          shelfLifeClass: "staple",
          lastPurchasedAt: daysAgo(1),
        }),
        input({
          productId: "33333333-3333-4333-8333-333333333333",
          name: "Bread",
          lastPurchasedAt: daysAgo(3),
        }),
        input({
          productId: "44444444-4444-4444-8444-444444444444",
          name: "Eggs",
          lastPurchasedAt: daysAgo(1),
        }),
      ],
      NOW,
    );
    expect(schedule.map((item) => item.name)).toEqual(["bread", "eggs", "rice"]);
  });

  it("selects only due, unmuted, un-listed items", () => {
    const schedule = buildPantrySchedule(
      [
        input({ name: "Milk", lastPurchasedAt: daysAgo(3) }),
        input({
          name: "Bread",
          lastPurchasedAt: daysAgo(3),
          muted: true,
        }),
        input({
          name: "Eggs",
          lastPurchasedAt: daysAgo(3),
          onList: true,
        }),
        input({ name: "Rice", shelfLifeClass: "staple", lastPurchasedAt: daysAgo(1) }),
      ],
      NOW,
    );
    expect(autoAddCandidates(schedule).map((item) => item.name)).toEqual(["milk"]);
  });
});

describe("pantrySchedule 3-day refresh gate", () => {
  it("refreshes immediately when no pass has run", () => {
    expect(shouldRefresh(null, NOW)).toBe(true);
  });

  it("waits the full 3 days and includes the mark", () => {
    expect(shouldRefresh(daysAgo(2), NOW)).toBe(false);
    expect(shouldRefresh(daysAgo(3), NOW)).toBe(true);
    expect(shouldRefresh(daysAgo(4), NOW)).toBe(true);
  });

  it("computes the next refresh timestamp", () => {
    const last = daysAgo(1);
    expect(nextRefreshAt(last)?.getTime()).toBe(last.getTime() + 3 * DAY_MS);
    expect(nextRefreshAt(null)).toBeNull();
  });
});
