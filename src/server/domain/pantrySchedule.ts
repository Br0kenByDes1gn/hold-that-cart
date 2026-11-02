import type { ShelfLifeClass } from "../../shared/schemas.js";
import { normalizeName } from "./normalize.js";

/**
 * Pantry → grocery-list auto-add schedule.
 *
 * Product identity is the normalized generic type ("olive oil"), never the
 * receipt line or brand. The clock starts at the latest purchase date and the
 * interval comes from the product's shelf-life class:
 *
 *   perishable 3 days · staple 2 weeks · household 2 months · durable 1 year
 *
 * The grocery list is refreshed at most once every 3 days; at each refresh
 * every item whose due date has passed (or is exactly today) is added.
 *
 * Pure module: all functions take `now` so tests stay deterministic.
 */

export const DAY_MS = 86_400_000;

/** How often the grocery list may refresh itself. */
export const LIST_REFRESH_DAYS = 3;

/** Days after the latest purchase before the item is added to the list. */
export const AUTO_ADD_INTERVAL_DAYS: Record<ShelfLifeClass, number | null> = {
  perishable: 3,
  staple: 14,
  household: 60,
  durable: 365,
  unknown: null, // no schedule — never auto-add
};

const CLASS_RANK: Record<ShelfLifeClass, number> = {
  perishable: 0,
  staple: 1,
  household: 2,
  durable: 3,
  unknown: 4,
};

export interface PantryScheduleInput {
  productId: string;
  /** Raw product name; the schedule exposes its normalized form. */
  name: string;
  shelfLifeClass: ShelfLifeClass;
  /** Latest purchase = the date the item was added to the pantry. */
  lastPurchasedAt: Date | null;
  muted?: boolean;
  /** Name currently on the open grocery list. */
  onList?: boolean;
  /** When this product was last auto-added (null if never / not on list). */
  autoAddedAt?: Date | null;
}

export interface PantryScheduleItem {
  productId: string;
  /** Canonical normalized name — this is what reaches the grocery list. */
  name: string;
  shelfLifeClass: ShelfLifeClass;
  /** Null for unknown products (no schedule). */
  intervalDays: number | null;
  lastAddedAt: Date | null;
  dueAt: Date | null;
  /** Whole days until due; 0 means due today or overdue. Null = no schedule. */
  daysLeft: number | null;
  due: boolean;
  muted: boolean;
  onList: boolean;
  autoAddedAt: Date | null;
}

export function intervalForClass(cls: ShelfLifeClass): number | null {
  return AUTO_ADD_INTERVAL_DAYS[cls] ?? null;
}

export function scheduleItem(
  input: PantryScheduleInput,
  now: Date = new Date(),
): PantryScheduleItem {
  const name = normalizeName(input.name) || input.name;
  const intervalDays = intervalForClass(input.shelfLifeClass);
  const lastAddedAt = input.lastPurchasedAt;
  const dueAt =
    lastAddedAt && intervalDays !== null
      ? new Date(lastAddedAt.getTime() + intervalDays * DAY_MS)
      : null;
  const due = dueAt !== null && dueAt.getTime() <= now.getTime();
  const daysLeft =
    dueAt === null
      ? null
      : Math.max(0, Math.ceil((dueAt.getTime() - now.getTime()) / DAY_MS));

  return {
    productId: input.productId,
    name,
    shelfLifeClass: input.shelfLifeClass,
    intervalDays,
    lastAddedAt,
    dueAt,
    daysLeft,
    due,
    muted: input.muted ?? false,
    onList: input.onList ?? false,
    autoAddedAt: input.autoAddedAt ?? null,
  };
}

/** All pantry items, visible in the dev panel, sorted perishables first. */
export function buildPantrySchedule(
  inputs: PantryScheduleInput[],
  now: Date = new Date(),
): PantryScheduleItem[] {
  return inputs
    .map((input) => scheduleItem(input, now))
    .sort((a, b) => {
      const byClass = CLASS_RANK[a.shelfLifeClass] - CLASS_RANK[b.shelfLifeClass];
      if (byClass !== 0) return byClass;
      const aLeft = a.daysLeft ?? Number.MAX_SAFE_INTEGER;
      const bLeft = b.daysLeft ?? Number.MAX_SAFE_INTEGER;
      if (aLeft !== bLeft) return aLeft - bLeft;
      return a.name.localeCompare(b.name);
    });
}

/** Items the next refresh should add: due, not muted, not already listed. */
export function autoAddCandidates(
  schedule: PantryScheduleItem[],
): PantryScheduleItem[] {
  return schedule.filter((item) => item.due && !item.muted && !item.onList);
}

/** True when the 3-day refresh window has elapsed (or no refresh yet). */
export function shouldRefresh(
  lastRefreshedAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!lastRefreshedAt) return true;
  return now.getTime() - lastRefreshedAt.getTime() >= LIST_REFRESH_DAYS * DAY_MS;
}

export function nextRefreshAt(lastRefreshedAt: Date | null): Date | null {
  if (!lastRefreshedAt) return null;
  return new Date(lastRefreshedAt.getTime() + LIST_REFRESH_DAYS * DAY_MS);
}
