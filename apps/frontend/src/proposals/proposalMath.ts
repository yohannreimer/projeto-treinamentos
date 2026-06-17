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
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  const [year, month, day] = date.toISOString().split("T")[0].split("-");
  return `${day}/${month}/${year}`;
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
