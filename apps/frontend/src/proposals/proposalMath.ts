export type SelectedProposalService = {
  id: string;
  valuePerDay: number;
  durationDays: number;
};

export type SelectedProposalProduct = {
  id: string;
  unitValueUsd: number;
  quantity: number;
  maintenancePercent?: number;
  maintenanceYears?: number;
};

export type ProposalTotalsInput = {
  selectedServices: SelectedProposalService[];
  selectedProducts?: SelectedProposalProduct[];
  exchangeRate?: number;
  softwareDiscountPercent?: number;
  discountPercent: number;
  taxPercent: number;
  snapTo54000: boolean;
  serviceTargetTotal?: number;
};

export type SoftwareTotals = {
  totalUsd: number;
  totalBrl: number;
  discountValue: number;
  finalTotal: number;
};

export type ServiceTotals = {
  subtotal: number;
  totalDays: number;
  discountValue: number;
  subtotalAfterDiscount: number;
  taxValue: number;
  finalTotal: number;
  finalTotalDisplay: string;
};

export type ProposalTotals = {
  subtotal: number;
  totalDays: number;
  discountValue: number;
  subtotalAfterDiscount: number;
  taxValue: number;
  finalTotal: number;
  finalTotalDisplay: string;
  services: ServiceTotals;
  software: SoftwareTotals;
  grandTotal: number;
  grandTotalDisplay: string;
};

export type TargetDiscountInput = {
  serviceSubtotal: number;
  taxPercent: number;
  softwareFinalTotal: number;
  grandTarget: number;
};

export type TargetDiscountResult =
  | { kind: "no-services" }
  | { kind: "software-exceeds-target" }
  | { kind: "no-discount-needed"; serviceTarget: number }
  | { kind: "discount"; serviceTarget: number; discountPercent: number };

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatUsdCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatLongDate(value: string): string {
  if (!value) return "___/___/______";
  const [year, month, day] = value.split("-");
  return `${Number.parseInt(day, 10)} de ${MONTHS[Number.parseInt(month, 10) - 1]} de ${year}`;
}

export function addDays(value: string, days: number): string {
  if (!value) return "___/___/______";
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const resultYear = date.getUTCFullYear();
  const resultMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const resultDay = String(date.getUTCDate()).padStart(2, "0");
  return `${resultDay}/${resultMonth}/${resultYear}`;
}

export function calculateProposalTotals(input: ProposalTotalsInput): ProposalTotals {
  const softwareTotalUsd = (input.selectedProducts ?? []).reduce((sum, product) => {
    const maintenancePercent = Math.max(product.maintenancePercent ?? 0, 0);
    const maintenanceYears = Math.max(product.maintenanceYears ?? 0, 0);
    const maintenanceValue = product.unitValueUsd * (maintenancePercent / 100) * maintenanceYears;
    return sum + (product.unitValueUsd + maintenanceValue) * product.quantity;
  }, 0);
  const softwareTotalBrl = softwareTotalUsd * (input.exchangeRate ?? 0);
  const softwareDiscountValue = softwareTotalBrl * ((input.softwareDiscountPercent ?? 0) / 100);
  const softwareFinalTotal = softwareTotalBrl - softwareDiscountValue;

  const subtotal = input.selectedServices.reduce(
    (sum, service) => sum + service.valuePerDay * service.durationDays,
    0,
  );
  const totalDays = input.selectedServices.reduce((sum, service) => sum + service.durationDays, 0);
  const discountValue = subtotal * (input.discountPercent / 100);
  const subtotalAfterDiscount = subtotal - discountValue;
  const taxValue = subtotalAfterDiscount * (input.taxPercent / 100);
  const finalTotal = subtotalAfterDiscount + taxValue;

  const services = {
    subtotal,
    totalDays,
    discountValue,
    subtotalAfterDiscount,
    taxValue,
    finalTotal,
    finalTotalDisplay: input.snapTo54000
      ? formatCurrency(input.serviceTargetTotal ?? 54000)
      : formatCurrency(Math.round(finalTotal * 100) / 100),
  };
  const software = {
    totalUsd: softwareTotalUsd,
    totalBrl: softwareTotalBrl,
    discountValue: softwareDiscountValue,
    finalTotal: softwareFinalTotal,
  };
  const grandTotal = softwareFinalTotal + (input.snapTo54000 ? (input.serviceTargetTotal ?? 54000) : finalTotal);
  const grandTotalDisplay = formatCurrency(Math.round(grandTotal * 100) / 100);

  return {
    ...services,
    services,
    software,
    grandTotal,
    grandTotalDisplay,
  };
}

export function calculateServiceDiscountForGrandTarget(input: TargetDiscountInput): TargetDiscountResult {
  if (input.serviceSubtotal <= 0) {
    return { kind: "no-services" };
  }

  const serviceTarget = input.grandTarget - input.softwareFinalTotal;
  if (serviceTarget <= 0) {
    return { kind: "software-exceeds-target" };
  }

  const targetBeforeTax = serviceTarget / (1 + input.taxPercent / 100);
  if (input.serviceSubtotal <= targetBeforeTax) {
    return { kind: "no-discount-needed", serviceTarget };
  }

  return {
    kind: "discount",
    serviceTarget,
    discountPercent: ((input.serviceSubtotal - targetBeforeTax) / input.serviceSubtotal) * 100,
  };
}
