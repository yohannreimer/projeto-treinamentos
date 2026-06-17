export type SelectedProposalService = {
  id: string;
  valuePerDay: number;
  durationDays: number;
};

export type ProposalTotalsInput = {
  selectedServices: SelectedProposalService[];
  discountPercent: number;
  taxPercent: number;
  snapTo54000: boolean;
};

export type ProposalTotals = {
  subtotal: number;
  totalDays: number;
  discountValue: number;
  subtotalAfterDiscount: number;
  taxValue: number;
  finalTotal: number;
  finalTotalDisplay: string;
};

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
  const subtotal = input.selectedServices.reduce(
    (sum, service) => sum + service.valuePerDay * service.durationDays,
    0,
  );
  const totalDays = input.selectedServices.reduce((sum, service) => sum + service.durationDays, 0);
  const discountValue = subtotal * (input.discountPercent / 100);
  const subtotalAfterDiscount = subtotal - discountValue;
  const taxValue = subtotalAfterDiscount * (input.taxPercent / 100);
  const finalTotal = subtotalAfterDiscount + taxValue;

  return {
    subtotal,
    totalDays,
    discountValue,
    subtotalAfterDiscount,
    taxValue,
    finalTotal,
    finalTotalDisplay: input.snapTo54000 ? "54.000,00" : formatCurrency(Math.round(finalTotal * 100) / 100),
  };
}
