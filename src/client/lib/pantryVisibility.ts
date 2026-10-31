export type PantrySectionId = "buy" | "skip" | "swap";

export interface VisibilityItem {
  rawName?: string;
  tags?: string[];
  scores?: {
    savesMoney?: number;
    healthy?: number;
    sustainable?: number;
  };
}

const TAG_KEYS = ["savesMoney", "healthy", "sustainable"] as const;
const SECTION_ORDER: PantrySectionId[] = ["buy", "skip", "swap"];
const EXTRA_ORDER: PantrySectionId[] = ["buy", "swap", "skip"];

export function activeTagCount(item: VisibilityItem): number {
  if (item.scores) {
    return TAG_KEYS.filter((key) => (item.scores?.[key] ?? 0) > 0.5).length;
  }
  return new Set(item.tags ?? []).size;
}

export function inactiveTagCount(item: VisibilityItem): number {
  return 3 - activeTagCount(item);
}

function scoreSum(item: VisibilityItem): number {
  if (!item.scores) return activeTagCount(item);
  return TAG_KEYS.reduce((sum, key) => sum + (item.scores?.[key] ?? 0), 0);
}

function nameOf(item: VisibilityItem): string {
  return (item.rawName ?? "").toLowerCase();
}

/** Sort each category with the rules requested for the Pantry preview. */
export function sortSectionItems<T extends VisibilityItem>(
  section: PantrySectionId,
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const activeA = activeTagCount(a);
    const activeB = activeTagCount(b);
    const inactiveDiff = inactiveTagCount(b) - inactiveTagCount(a);

    if (section === "buy") {
      if (activeB !== activeA) return activeB - activeA;
      const scoreDiff = scoreSum(b) - scoreSum(a);
      if (scoreDiff !== 0) return scoreDiff;
    } else {
      if (inactiveDiff !== 0) return inactiveDiff;
      const scoreDiff = scoreSum(a) - scoreSum(b);
      if (scoreDiff !== 0) return scoreDiff;
    }

    return nameOf(a).localeCompare(nameOf(b));
  });
}

/**
 * Allocate the available visible-card slots.
 * 1. one per non-empty section
 * 2. a second per non-empty section
 * 3. remaining slots in BUY → SWAP → SKIP order
 */
export function allocateVisibleCards(
  sections: Array<{ id: PantrySectionId; items: unknown[] }>,
  totalVisible: number,
): Record<PantrySectionId, number> {
  const result: Record<PantrySectionId, number> = { buy: 0, skip: 0, swap: 0 };
  const active = SECTION_ORDER.map((id) => ({
    id,
    count: sections.find((section) => section.id === id)?.items.length ?? 0,
  })).filter((section) => section.count > 0);

  let remaining = Math.min(
    Math.max(0, totalVisible),
    active.reduce((sum, section) => sum + section.count, 0),
  );

  for (const section of active) {
    if (remaining <= 0) break;
    result[section.id] += 1;
    remaining -= 1;
  }

  for (const section of active) {
    if (remaining <= 0) break;
    if (result[section.id] >= section.count) continue;
    result[section.id] += 1;
    remaining -= 1;
  }

  let index = 0;
  while (remaining > 0 && active.length > 0) {
    const id = EXTRA_ORDER[index % EXTRA_ORDER.length];
    index += 1;
    const section = active.find((entry) => entry.id === id);
    if (!section || result[id] >= section.count) {
      if (arrayEveryFull(active, result)) break;
      continue;
    }
    result[id] += 1;
    remaining -= 1;
  }

  return result;
}

function arrayEveryFull(
  sections: Array<{ id: PantrySectionId; count: number }>,
  allocation: Record<PantrySectionId, number>,
): boolean {
  return sections.every((section) => allocation[section.id] >= section.count);
}
