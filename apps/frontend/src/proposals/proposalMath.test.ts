import { addDays, calculateProposalTotals, formatCurrency, formatLongDate } from "./proposalMath";
import { describe, expect, it } from "vitest";

describe("proposalMath", () => {
  it("formats currency in Brazilian format without the R$ prefix", () => {
    expect(formatCurrency(54000)).toBe("54.000,00");
    expect(formatCurrency(1600.5)).toBe("1.600,50");
  });

  it("formats long proposal dates in Portuguese", () => {
    expect(formatLongDate("2026-06-17")).toBe("17 de Junho de 2026");
    expect(formatLongDate("")).toBe("___/___/______");
  });

  it("adds validity days using the yyyy-mm-dd input format", () => {
    expect(addDays("2026-06-17", 11)).toBe("28/06/2026");
    expect(addDays("", 11)).toBe("___/___/______");
  });

  it("adds validity days across daylight saving boundaries", () => {
    expect(addDays("2026-03-07", 2)).toBe("09/03/2026");
  });

  it("calculates subtotal, discount, taxes, final total, and total days", () => {
    const totals = calculateProposalTotals({
      selectedServices: [
        { id: "s1", valuePerDay: 1700, durationDays: 3 },
        { id: "s2", valuePerDay: 1600, durationDays: 2 },
      ],
      discountPercent: 10,
      taxPercent: 12,
      snapTo54000: false,
    });

    expect(totals.subtotal).toBe(8300);
    expect(totals.totalDays).toBe(5);
    expect(totals.discountValue).toBe(830);
    expect(totals.subtotalAfterDiscount).toBe(7470);
    expect(totals.taxValue).toBeCloseTo(896.4);
    expect(totals.finalTotal).toBeCloseTo(8366.4);
    expect(totals.finalTotalDisplay).toBe("8.366,40");
  });

  it("uses the fixed display total when snap-to-54000 is active", () => {
    const totals = calculateProposalTotals({
      selectedServices: [{ id: "s1", valuePerDay: 60000, durationDays: 1 }],
      discountPercent: 19.64285714,
      taxPercent: 12,
      snapTo54000: true,
    });

    expect(totals.finalTotalDisplay).toBe("54.000,00");
  });
});
