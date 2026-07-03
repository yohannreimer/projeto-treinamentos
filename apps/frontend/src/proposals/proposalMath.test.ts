import {
  addDays,
  calculateProposalTotals,
  calculateServiceDiscountForGrandTarget,
  formatCurrency,
  formatLongDate,
  formatUsdCurrency,
} from "./proposalMath";
import { describe, expect, it } from "vitest";

describe("proposalMath", () => {
  it("formats currency in Brazilian format without the R$ prefix", () => {
    expect(formatCurrency(54000)).toBe("54.000,00");
    expect(formatCurrency(1600.5)).toBe("1.600,50");
    expect(formatUsdCurrency(1500)).toBe("1,500.00");
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

  it("calculates software totals in USD and BRL alongside service totals", () => {
    const totals = calculateProposalTotals({
      selectedProducts: [
        { id: "p1", unitValueUsd: 1000, quantity: 1 },
        { id: "p2", unitValueUsd: 500, quantity: 2 },
      ],
      exchangeRate: 5.8,
      softwareDiscountPercent: 10,
      selectedServices: [{ id: "s1", valuePerDay: 1700, durationDays: 3 }],
      discountPercent: 0,
      taxPercent: 12,
      snapTo54000: false,
    });

    expect(totals.software.totalUsd).toBe(2000);
    expect(totals.software.totalBrl).toBe(11600);
    expect(totals.software.discountValue).toBe(1160);
    expect(totals.software.finalTotal).toBe(10440);
    expect(totals.services.finalTotal).toBe(5712);
    expect(totals.grandTotal).toBe(16152);
    expect(totals.grandTotalDisplay).toBe("16.152,00");
  });

  it("adds simple maintenance to software unit values before totals", () => {
    const totals = calculateProposalTotals({
      selectedProducts: [
        {
          id: "p1",
          unitValueUsd: 6500,
          quantity: 1,
          maintenancePercent: 10,
          maintenanceYears: 3,
        },
      ],
      exchangeRate: 5.8,
      softwareDiscountPercent: 0,
      selectedServices: [],
      discountPercent: 0,
      taxPercent: 12,
      snapTo54000: false,
    });

    expect(totals.software.totalUsd).toBe(8450);
    expect(totals.software.totalBrl).toBe(49010);
    expect(totals.software.finalTotal).toBe(49010);
    expect(totals.grandTotalDisplay).toBe("49.010,00");
  });

  it("calculates service discount needed to hit a grand target after software", () => {
    const discount = calculateServiceDiscountForGrandTarget({
      serviceSubtotal: 60000,
      taxPercent: 12,
      softwareFinalTotal: 10440,
      grandTarget: 54000,
    });

    expect(discount.kind).toBe("discount");
    if (discount.kind !== "discount") {
      throw new Error("Expected discount result");
    }
    expect(discount.discountPercent).toBeCloseTo(35.17857142);
    expect(discount.serviceTarget).toBeCloseTo(43560);
  });

  it("reports when software alone is above the grand target", () => {
    const discount = calculateServiceDiscountForGrandTarget({
      serviceSubtotal: 60000,
      taxPercent: 12,
      softwareFinalTotal: 56000,
      grandTarget: 54000,
    });

    expect(discount.kind).toBe("software-exceeds-target");
  });
});
