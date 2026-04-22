import type { FormEvent } from 'react';
import type { FinanceAccount, FinanceCategory, FinanceEntity, FinanceTransaction, FinanceTransactionKind, FinanceTransactionStatus } from '../api';
import { formatCurrency, formatDate } from '../utils/financeFormatters';
import { FinanceEmptyState, FinanceMono, FinancePanel } from './FinancePrimitives';

export type FinanceTransactionFormState = {
  financial_entity_id: string;
  financial_account_id: string;
  financial_category_id: string;
  kind: FinanceTransactionKind;
  status: FinanceTransactionStatus;
  amount: string;
  issue_date: string;
  due_date: string;
  competence_date: string;
  settlement_date: string;
  note: string;
};

type TransactionDetailPanelProps = {
  transaction: FinanceTransaction | null;
  canWrite: boolean;
  canApprove: boolean;
  submitting: boolean;
  onCreate: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function kindLabel(kind: FinanceTransactionKind): string {
  if (kind === 'income') return 'Entrada';
  if (kind === 'expense') return 'Saída';
  if (kind === 'transfer') return 'Transferência';
  return 'Ajuste';
}

function statusLabel(status: FinanceTransactionStatus): string {
  if (status === 'planned') return 'Planejado';
  if (status === 'open') return 'Em aberto';
  if (status === 'partial') return 'Parcial';
  if (status === 'settled') return 'Liquidado';
  if (status === 'overdue') return 'Atrasado';
  return 'Cancelado';
}

export function FinanceTransactionDetailPanel({
  transaction,
  canWrite,
  canApprove,
  submitting,
  onCreate,
  onEdit,
  onDelete
}: TransactionDetailPanelProps) {
  return (
    <FinancePanel className="finance-ledger-detail" ariaLabel="Detalhes do lançamento" title="Detalhes da linha" eyebrow="Drill-down">
      {!transaction ? (
        <FinanceEmptyState title="Selecione uma movimentação para ver a rastreabilidade completa aqui." />
      ) : (
        <div className="finance-ledger-detail__body">
          <div className="finance-ledger-detail__headline">
            <strong>{transaction.note || 'Movimentação financeira'}</strong>
            <span><FinanceMono>{formatCurrency(transaction.amount_cents)}</FinanceMono></span>
          </div>
          <div className="finance-ledger-detail__actions">
            <button type="button" className="secondary-button" onClick={onCreate}>
              Novo lançamento
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onEdit}
              disabled={!canWrite || transaction.is_deleted}
            >
              Editar linha
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onDelete}
              disabled={!canApprove || transaction.is_deleted || submitting}
            >
              Excluir
            </button>
          </div>
          {transaction.is_deleted ? (
            <p className="finance-ledger-detail__audit-note">
              Este lançamento já foi excluído do ledger ativo e permanece visível aqui apenas para rastreabilidade.
            </p>
          ) : null}
          <dl className="finance-ledger-detail__list">
            <div>
              <dt>Entidade</dt>
              <dd>{transaction.financial_entity_name || '—'}</dd>
            </div>
            <div>
              <dt>Conta</dt>
              <dd>{transaction.financial_account_name || '—'}</dd>
            </div>
            <div>
              <dt>Categoria</dt>
              <dd>{transaction.financial_category_name || '—'}</dd>
            </div>
            <div>
              <dt>Tipo</dt>
              <dd>{kindLabel(transaction.kind)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{statusLabel(transaction.status)}</dd>
            </div>
            <div>
              <dt>Data de emissão</dt>
              <dd><FinanceMono>{formatDate(transaction.issue_date)}</FinanceMono></dd>
            </div>
            <div>
              <dt>Data de vencimento</dt>
              <dd><FinanceMono>{formatDate(transaction.due_date)}</FinanceMono></dd>
            </div>
            <div>
              <dt>Data de competência</dt>
              <dd><FinanceMono>{formatDate(transaction.competence_date)}</FinanceMono></dd>
            </div>
            <div>
              <dt>Liquidação</dt>
              <dd><FinanceMono>{formatDate(transaction.settlement_date)}</FinanceMono></dd>
            </div>
            <div>
              <dt>Fonte</dt>
              <dd>{transaction.source}</dd>
            </div>
            <div>
              <dt>Referência</dt>
              <dd><FinanceMono>{transaction.source_ref || '—'}</FinanceMono></dd>
            </div>
            <div>
              <dt>Criado por</dt>
              <dd>{transaction.created_by || 'sistema'}</dd>
            </div>
          </dl>
          <div className="finance-ledger-detail__views">
            <div>
              <small>Caixa</small>
              <strong><FinanceMono>{formatCurrency(transaction.views.cash_amount_cents)}</FinanceMono></strong>
            </div>
            <div>
              <small>Competência</small>
              <strong><FinanceMono>{formatCurrency(transaction.views.competence_amount_cents)}</FinanceMono></strong>
            </div>
            <div>
              <small>Projetado</small>
              <strong><FinanceMono>{formatCurrency(transaction.views.projected_amount_cents)}</FinanceMono></strong>
            </div>
            <div>
              <small>Confirmado</small>
              <strong><FinanceMono>{formatCurrency(transaction.views.confirmed_amount_cents)}</FinanceMono></strong>
            </div>
          </div>
          <p className="finance-ledger-detail__note">
            {transaction.source === 'manual'
              ? 'Lançamento manual registrado no ledger central.'
              : 'Lançamento originado por processo operacional do ERP.'}
          </p>
        </div>
      )}
    </FinancePanel>
  );
}

export function FinanceTransactionEditorPanel({
  form,
  accounts,
  categories,
  entities,
  editorMode,
  editorDisabled,
  submitting,
  onUpdateForm,
  onStartCreate,
  onSubmit
}: {
  form: FinanceTransactionFormState;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  entities: FinanceEntity[];
  editorMode: 'create' | 'edit';
  editorDisabled: boolean;
  submitting: boolean;
  onUpdateForm: <K extends keyof FinanceTransactionFormState>(key: K, value: FinanceTransactionFormState[K]) => void;
  onStartCreate: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="finance-ledger-editor" onSubmit={onSubmit}>
      <div className="finance-ledger-editor__header">
        <div>
          <small className="finance-panel-eyebrow">Operação manual</small>
          <h3>{editorMode === 'edit' ? 'Editar lançamento' : 'Novo lançamento'}</h3>
        </div>
        {editorMode === 'edit' ? (
          <button type="button" className="secondary-button" onClick={onStartCreate}>
            Limpar editor
          </button>
        ) : null}
      </div>

      <div className="finance-ledger-editor__grid">
        <label className="finance-ledger-field">
          <span>Entidade</span>
          <select
            value={form.financial_entity_id}
            onChange={(event) => onUpdateForm('financial_entity_id', event.target.value)}
            disabled={editorDisabled}
          >
            <option value="">Sem vínculo</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.trade_name || entity.legal_name}
              </option>
            ))}
          </select>
        </label>

        <label className="finance-ledger-field">
          <span>Conta</span>
          <select
            value={form.financial_account_id}
            onChange={(event) => onUpdateForm('financial_account_id', event.target.value)}
            disabled={editorDisabled}
          >
            <option value="">Sem vínculo</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
        </label>

        <label className="finance-ledger-field">
          <span>Categoria</span>
          <select
            value={form.financial_category_id}
            onChange={(event) => onUpdateForm('financial_category_id', event.target.value)}
            disabled={editorDisabled}
          >
            <option value="">Sem vínculo</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>

        <label className="finance-ledger-field">
          <span>Tipo</span>
          <select value={form.kind} onChange={(event) => onUpdateForm('kind', event.target.value as FinanceTransactionKind)} disabled={editorDisabled}>
            <option value="income">Entrada</option>
            <option value="expense">Saída</option>
            <option value="transfer">Transferência</option>
            <option value="adjustment">Ajuste</option>
          </select>
        </label>

        <label className="finance-ledger-field">
          <span>Status</span>
          <select value={form.status} onChange={(event) => onUpdateForm('status', event.target.value as FinanceTransactionStatus)} disabled={editorDisabled}>
            <option value="planned">Planejado</option>
            <option value="open">Em aberto</option>
            <option value="partial">Parcial</option>
            <option value="settled">Liquidado</option>
            <option value="overdue">Atrasado</option>
            <option value="canceled">Cancelado</option>
          </select>
        </label>

        <label className="finance-ledger-field">
          <span>Valor</span>
          <input
            value={form.amount}
            onChange={(event) => onUpdateForm('amount', event.target.value)}
            placeholder="0,00"
            disabled={editorDisabled}
          />
        </label>

        <label className="finance-ledger-field">
          <span>Emissão</span>
          <input type="date" value={form.issue_date} onChange={(event) => onUpdateForm('issue_date', event.target.value)} disabled={editorDisabled} />
        </label>

        <label className="finance-ledger-field">
          <span>Vencimento</span>
          <input type="date" value={form.due_date} onChange={(event) => onUpdateForm('due_date', event.target.value)} disabled={editorDisabled} />
        </label>

        <label className="finance-ledger-field">
          <span>Competência</span>
          <input type="date" value={form.competence_date} onChange={(event) => onUpdateForm('competence_date', event.target.value)} disabled={editorDisabled} />
        </label>

        <label className="finance-ledger-field">
          <span>Liquidação</span>
          <input type="date" value={form.settlement_date} onChange={(event) => onUpdateForm('settlement_date', event.target.value)} disabled={editorDisabled} />
        </label>

        <label className="finance-ledger-field finance-ledger-field--wide">
          <span>Observação</span>
          <textarea
            value={form.note}
            onChange={(event) => onUpdateForm('note', event.target.value)}
            placeholder="Descreva o contexto financeiro desta movimentação."
            disabled={editorDisabled}
            rows={4}
          />
        </label>
      </div>

      <div className="finance-ledger-editor__footer">
        <button type="submit" className="primary-button" disabled={editorDisabled}>
          {submitting ? 'Salvando...' : editorMode === 'edit' ? 'Salvar alteração' : 'Registrar lançamento'}
        </button>
        <span>{editorDisabled ? 'Seu perfil atual pode ler, mas não alterar lançamentos.' : 'Edite com cuidado: cada linha afeta caixa, competência, projetado e confirmado.'}</span>
      </div>
    </form>
  );
}
