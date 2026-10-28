import { describe, expect, it } from "vitest";
import { findCheaperVariant, findLargerPackSaving } from "../src/server/domain/money";
import { baseQuantity, unitPrice } from "../src/server/domain/units";

const D = (s: string) => new Date(s);

describe("units", () => {
  it("normalises €/kg vs €/100g traps", () => {
    const a = unitPrice(6.0, 1, 500, "ml")!; // 500ml @ €6 → €12/L
    const b = unitPrice(8.0, 1, 1, "L")!; // 1L @ €8 → €8/L
    expect(a.baseUnit).toBe("L");
    expect(a.perUnit).toBeCloseTo(12, 5);
    expect(b.perUnit).toBeCloseTo(8, 5);
  });
  it("missing pack → null (no comparison)", () => {
    expect(baseQuantity(1, undefined, "kg")).toBeNull();
    expect(unitPrice(2.0, 1, undefined, "kg")).toBeNull();
  });
  it("count items compare per each", () => {
    const u = unitPrice(3.1, 1, 10, "pcs")!;
    expect(u.baseUnit).toBe("each");
    expect(u.perUnit).toBeCloseTo(0.31, 5); // €3.10 for a pack of 10 → €0.31/piece
  });
});

describe("money", () => {
  const olive = [
    { purchasedAt: D("2026-08-01"), qty: 1, packQty: 500, packUnit: "ml", totalPrice: 6.0, brand: "Borges" },
    { purchasedAt: D("2026-09-15"), qty: 1, packQty: 1, packUnit: "L", totalPrice: 8.0, brand: "Store brand" },
    { purchasedAt: D("2026-10-01"), qty: 1, packQty: 500, packUnit: "ml", totalPrice: 6.0, brand: "Borges" },
  ];
  it("finds cheaper variant ≥10% (median, promo-resistant)", () => {
    const ev = findCheaperVariant(olive);
    expect(ev).not.toBeNull();
    expect(ev!.pctCheaper).toBeGreaterThanOrEqual(0.1);
    expect(ev!.expectedSavingPerTrip).toBeGreaterThan(0);
  });
  it("10% boundary: 9% cheaper → silence", () => {
    const ps = [
      { purchasedAt: D("2026-09-01"), qty: 1, packQty: 1, packUnit: "kg", totalPrice: 2.0, brand: "A" },
      { purchasedAt: D("2026-09-15"), qty: 1, packQty: 1, packUnit: "kg", totalPrice: 2.0, brand: "A" },
      { purchasedAt: D("2026-10-01"), qty: 1, packQty: 1, packUnit: "kg", totalPrice: 1.82, brand: "B" },
    ];
    expect(findCheaperVariant(ps)).toBeNull();
  });
  it("single variant → no suggestion", () => {
    expect(findCheaperVariant([olive[0]])).toBeNull();
  });
  it("larger pack: bigger pack cheaper per unit", () => {
    const ps = [
      { purchasedAt: D("2026-09-01"), qty: 1, packQty: 500, packUnit: "g", totalPrice: 3.0, brand: "X" },
      { purchasedAt: D("2026-10-01"), qty: 1, packQty: 1, packUnit: "kg", totalPrice: 4.0, brand: "X" },
    ];
    const ev = findLargerPackSaving(ps);
    expect(ev).not.toBeNull();
    expect(ev!.extraUpfront).toBeCloseTo(1.0, 5); // €4 vs €3
  });
  it("larger pack: smaller pack cheaper → no suggestion", () => {
    const ps = [
      { purchasedAt: D("2026-09-01"), qty: 1, packQty: 500, packUnit: "g", totalPrice: 2.0, brand: "X" },
      { purchasedAt: D("2026-10-01"), qty: 1, packQty: 1, packUnit: "kg", totalPrice: 5.0, brand: "X" },
    ];
    expect(findLargerPackSaving(ps)).toBeNull();
  });
});
