import type { FinanceTransaction } from '../api';
import { FinanceEmptyState, FinanceMono, FinanceStatusPill } from './FinancePrimitives';

type FinanceLedgerTableProps = {
  rows: FinanceTransaction[];
  selectedTransactionId: string | null;
  onSelectTransaction: (transactionId: string) => void;
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(cents / 100);
}

function formatDate(dateIso?: string | null): string {
  if (!dateIso) {
    return '—';
  }

  const [year, month, day] = dateIso.split('-').map(Number);
  if (!year || !month || !day) {
    return dateIso;
  }

  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function kindLabel(kind: FinanceTransaction['kind']): string {
  if (kind === 'income') return 'Entrada';
  if (kind === 'expense') return 'Saída';
  if (kind === 'transfer') return 'Transferência';
  return 'Ajuste';
}

function statusLabel(status: FinanceTransaction['status']): string {
  if (status === 'planned') return 'Planejado';
  if (status === 'open') return 'Em aberto';
  if (status === 'partial') return 'Parcial';
  if (status === 'settled') return 'Liquidado';
  if (status === 'overdue') return 'Atrasado';
  return 'Cancelado';
}

function statusTone(status: FinanceTransaction['status'] | 'deleted') {
  if (status === 'deleted') return 'neutral' as const;
  if (status === 'settled') return 'success' as const;
  if (status === 'overdue') return 'danger' as const;
  if (status === 'planned') return 'accent' as const;
  if (status === 'partial') return 'warning' as const;
  return 'neutral' as const;
}

export function FinanceLedgerTable({
  rows,
  selectedTransactionId,
  onSelectTransaction
}: FinanceLedgerTableProps) {
  if (rows.length === 0) {
    return (
      <FinanceEmptyState
        title="Nenhuma movimentação encontrada."
        description="Ajuste os filtros para localizar lançamentos no ledger."
      />
    );
  }

  return (
    <table className="finance-ledger-table" aria-label="Ledger financeiro">
      <thead>
        <tr>
          <th scope="col">Lançamento</th>
          <th scope="col">Entidade</th>
          <th scope="col">Conta</th>
          <th scope="col">Categoria</th>
          <th scope="col">Tipo</th>
          <th scope="col">Status</th>
          <th scope="col">Data-base</th>
          <th scope="col">Valor</th>
          <th scope="col">Drill-down</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isSelected = row.id === selectedTransactionId;
          const label = row.note?.trim() || row.financial_entity_name || 'Movimentação financeira';
          const statusText = row.is_deleted ? 'Excluído' : statusLabel(row.status);

          return (
            <tr key={row.id} className={`${isSelected ? 'is-selected' : ''} ${row.is_deleted ? 'is-deleted' : ''}`.trim()}>
              <td>
                <button
                  type="button"
                  className="finance-ledger-table__row-button"
                  onClick={() => onSelectTransaction(row.id)}
                >
                  <strong>{label}</strong>
                  <span>
                    <FinanceMono>#{row.id.slice(-6)}</FinanceMono>
                    {row.is_deleted ? ' • histórico' : ''}
                  </span>
                </button>
              </td>
              <td>{row.financial_entity_name || '—'}</td>
              <td>{row.financial_account_name || '—'}</td>
              <td>{row.financial_category_name || '—'}</td>
              <td>{kindLabel(row.kind)}</td>
              <td>
                <FinanceStatusPill tone={statusTone(row.is_deleted ? 'deleted' : row.status)}>{statusText}</FinanceStatusPill>
              </td>
              <td><FinanceMono>{formatDate(row.competence_date || row.due_date || row.issue_date)}</FinanceMono></td>
              <td><FinanceMono>{formatCurrency(row.amount_cents)}</FinanceMono></td>
              <td>
                <div className="finance-ledger-table__drilldown">
                  <span><FinanceMono>{formatCurrency(row.views.signed_amount_cents)}</FinanceMono></span>
                  <small>
                    Caixa <FinanceMono>{formatCurrency(row.views.cash_amount_cents)}</FinanceMono> • Competência <FinanceMono>{formatCurrency(row.views.competence_amount_cents)}</FinanceMono>
                  </small>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
