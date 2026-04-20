import type { FinanceComputeViewsInput, FinanceLedgerViews } from './types.js';

function signedAmount(kind: FinanceComputeViewsInput['kind'], amountCents: number): number {
  if (kind === 'income') {
    return amountCents;
  }
  if (kind === 'expense') {
    return -amountCents;
  }
  if (kind === 'adjustment') {
    return amountCents;
  }
  return 0;
}

export function computeViews(input: FinanceComputeViewsInput): FinanceLedgerViews {
  const active = !input.isDeleted && input.status !== 'canceled';
  const signed = signedAmount(input.kind, input.amountCents);
  const competenceAnchorDate = input.competenceDate ?? input.dueDate ?? input.issueDate ?? input.settlementDate ?? null;
  const cashAnchorDate = input.settlementDate ?? null;
  const projectedAnchorDate = input.settlementDate ? null : input.dueDate ?? competenceAnchorDate;
  const isConfirmed = Boolean(input.settlementDate) || input.status === 'settled';

  return {
    signed_amount_cents: signed,
    cash_amount_cents: active && cashAnchorDate ? signed : 0,
    competence_amount_cents: active && competenceAnchorDate ? signed : 0,
    projected_amount_cents: active && !isConfirmed ? signed : 0,
    confirmed_amount_cents: active && isConfirmed ? signed : 0,
    competence_anchor_date: competenceAnchorDate,
    cash_anchor_date: cashAnchorDate,
    projected_anchor_date: projectedAnchorDate
  };
}
