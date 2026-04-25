import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  financeApi,
  type FinanceImportJob,
  type FinanceQualityInbox,
  type FinanceQualityIssue,
  type FinanceReconciliationInbox,
  type FinanceReconciliationInboxEntry,
  type FinanceReconciliationLearnedRule,
  type FinanceReconciliationMatch,
  type FinanceReconciliationSuggestion
} from '../api';
import { FinancePeriodFilter } from '../components/FinancePeriodFilter';
import { FinanceQualityBadge } from '../components/FinanceQualityBadge';
import { FinanceEmptyState, FinanceErrorState, FinanceLoadingState, FinanceMono, FinancePageHeader } from '../components/FinancePrimitives';
import { useFinancePeriod } from '../hooks/useFinancePeriod';

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(dateIso?: string | null): string {
  if (!dateIso) return '-';
  const [year, month, day] = dateIso.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return dateIso;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function Card({
  children,
  padding = 20,
  style
}: {
  children: ReactNode;
  padding?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding,
        ...style
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({
  children,
  action,
  onAction
}: {
  children: ReactNode;
  action?: ReactNode;
  onAction?: () => void;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>{children}</h2>
      {action ? (
        <button
          type="button"
          onClick={onAction}
          style={{
            fontSize: 12,
            color: 'var(--accent)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 600
          }}
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}

function Badge({
  children,
  color = '#64748b',
  bg = '#f1f5f9',
  size = 11
}: {
  children: ReactNode;
  color?: string;
  bg?: string;
  size?: number;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 20,
        fontSize: size,
        fontWeight: 600,
        background: bg,
        color,
        lineHeight: 1.7,
        whiteSpace: 'nowrap'
      }}
    >
      {children}
    </span>
  );
}

function statusMeta(status: string): { label: string; color: string; bg: string } {
  if (status === 'completed' || status === 'matched' || status === 'confirmado') {
    return { label: 'Confirmado', color: '#059669', bg: '#d1fae5' };
  }
  if (status === 'processing') {
    return { label: 'Processando', color: '#2563eb', bg: '#dbeafe' };
  }
  if (status === 'queued' || status === 'pendente' || status === 'unmatched') {
    return { label: 'Pendente', color: '#d97706', bg: '#fef3c7' };
  }
  if (status === 'failed') {
    return { label: 'Falhou', color: '#dc2626', bg: '#fee2e2' };
  }
  if (status === 'ignored') {
    return { label: 'Ignorado', color: '#94a3b8', bg: '#f1f5f9' };
  }
  return { label: status, color: '#64748b', bg: '#f1f5f9' };
}

function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta(status);
  return <Badge color={meta.color} bg={meta.bg}>{meta.label}</Badge>;
}

function bucketLabel(entry: FinanceReconciliationInboxEntry): string {
  return `${entry.financial_account_name ?? 'Conta sem nome'} · ${formatDate(entry.posted_at ?? entry.statement_date)} · ${entry.age_days}d na fila`;
}

function suggestionSourceLabel(source?: string): string {
  if (source === 'learned_rule') return 'Regra aprendida';
  if (source === 'description') return 'Descrição';
  return 'Valor/Data';
}

function MatchSuggestionCard(props: { suggestion: FinanceReconciliationSuggestion }) {
  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{props.suggestion.description}</span>
        <Badge color="#059669" bg="#d1fae5">{Math.round(props.suggestion.confidence_score * 100)}%</Badge>
      </div>
      <div style={{ fontSize: 11, color: '#64748b' }}>
        {props.suggestion.financial_entity_name ?? 'Sem entidade'} · vence {formatDate(props.suggestion.due_date)}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
        <Badge color="#2563eb" bg="#dbeafe">{suggestionSourceLabel(props.suggestion.source)}</Badge>
        {(props.suggestion.reasons ?? []).slice(0, 2).map((reason) => (
          <Badge key={`${props.suggestion.financial_transaction_id}-${reason.label}`} color={reason.tone === 'warning' ? '#92400e' : '#047857'} bg={reason.tone === 'warning' ? '#fef3c7' : '#d1fae5'}>
            {reason.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function InboxEntryCard(props: {
  entry: FinanceReconciliationInboxEntry;
  onMatch?: (entry: FinanceReconciliationInboxEntry, suggestion: FinanceReconciliationSuggestion) => void;
  onCreateTransaction?: (entry: FinanceReconciliationInboxEntry) => void;
  matching?: boolean;
  creating?: boolean;
}) {
  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{props.entry.description}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{bucketLabel(props.entry)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 15, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: '#0f172a' }}>
            <FinanceMono>{formatCurrency(props.entry.amount_cents)}</FinanceMono>
          </div>
          <Badge
            color={props.entry.suggestion_count > 0 ? '#059669' : '#94a3b8'}
            bg={props.entry.suggestion_count > 0 ? '#d1fae5' : '#f1f5f9'}
          >
            {props.entry.suggestion_count} sugestão
          </Badge>
        </div>
      </div>

      {props.entry.suggested_matches.map((suggestion, index) => (
        <div
          key={`${props.entry.id}-${suggestion.financial_transaction_id}-${index}`}
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 7,
            padding: '8px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#065f46' }}>{suggestion.description}</div>
            <div style={{ fontSize: 10, color: '#059669' }}>
              {suggestion.financial_entity_name ?? 'Sem entidade'} · vence {formatDate(suggestion.due_date)}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
              <Badge color="#2563eb" bg="#dbeafe" size={10}>{suggestionSourceLabel(suggestion.source)}</Badge>
              {(suggestion.reasons ?? []).slice(0, 3).map((reason) => (
                <Badge key={`${suggestion.financial_transaction_id}-${reason.label}`} color={reason.tone === 'warning' ? '#92400e' : '#047857'} bg={reason.tone === 'warning' ? '#fef3c7' : '#d1fae5'} size={10}>
                  {reason.label}
                </Badge>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>
              {Math.round(suggestion.confidence_score * 100)}%
            </div>
            <button
              type="button"
              onClick={() => props.onMatch?.(props.entry, suggestion)}
              disabled={props.matching}
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '3px 10px',
                background: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: 5,
                cursor: props.matching ? 'default' : 'pointer',
                fontFamily: 'inherit',
                opacity: props.matching ? 0.7 : 1
              }}
            >
              {props.matching ? 'Aplicando…' : 'Match'}
            </button>
          </div>
        </div>
      ))}

      {props.entry.suggested_matches.length === 0 ? (
        <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Sem sugestão automática — match manual necessário.</div>
      ) : null}

      <button
        type="button"
        onClick={() => props.onCreateTransaction?.(props.entry)}
        disabled={props.creating || props.matching}
        style={{
          height: 28,
          border: '1px solid #cbd5e1',
          borderRadius: 7,
          background: 'white',
          color: '#334155',
          cursor: props.creating || props.matching ? 'default' : 'pointer',
          fontSize: 11,
          fontWeight: 700,
          fontFamily: 'inherit',
          padding: '0 10px',
          marginTop: 2,
          opacity: props.creating || props.matching ? 0.7 : 1
        }}
      >
        {props.creating ? 'Criando...' : 'Criar lançamento conciliado'}
      </button>
    </div>
  );
}

function ImportRow(props: { job: FinanceImportJob }) {
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 2, overflowWrap: 'anywhere' }}>{props.job.source_file_name}</div>
        <div style={{ fontSize: 11, color: '#64748b', overflowWrap: 'anywhere' }}>
          Tipo: {props.job.import_type.toUpperCase()} · {props.job.total_rows} linhas · {formatDate(props.job.created_at)}
        </div>
      </div>
      <div style={{ justifySelf: 'end' }}>
        <StatusBadge status={props.job.status} />
      </div>
    </div>
  );
}

function RecentMatchRow(props: { match: FinanceReconciliationMatch }) {
  const kindLabel = props.match.source === 'manual'
    ? 'Manual'
    : props.match.source === 'statement_create'
      ? 'Criado pelo extrato'
      : props.match.source === 'rule'
        ? 'Regra'
        : 'Automático';
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{kindLabel}</div>
        <div style={{ fontSize: 11, color: '#64748b', overflowWrap: 'anywhere' }}>
          Transação vinculada: {props.match.financial_transaction_id ?? 'Sem transação'} · revisado {formatDate(props.match.reviewed_at ?? props.match.created_at)}
        </div>
      </div>
      <div style={{ justifySelf: 'end', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'end' }}>
        {props.match.confidence_score != null ? <Badge color="#2563eb" bg="#dbeafe">{Math.round(props.match.confidence_score * 100)}%</Badge> : null}
        <StatusBadge status={props.match.match_status} />
      </div>
    </div>
  );
}

function LearnedRuleRow(props: { rule: FinanceReconciliationLearnedRule }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', overflowWrap: 'anywhere' }}>{props.rule.label}</div>
          <div style={{ fontSize: 11, color: '#64748b', overflowWrap: 'anywhere' }}>{props.rule.pattern}</div>
        </div>
        <Badge color="#2563eb" bg="#dbeafe">{props.rule.usage_count}x</Badge>
      </div>
    </div>
  );
}

function QualityIssueCard(props: { issue: FinanceQualityIssue; onReview: (issue: FinanceQualityIssue) => void; applying?: boolean }) {
  const fieldLabels: Record<string, string> = {
    financial_entity_id: 'cliente/fornecedor',
    financial_category_id: 'categoria',
    financial_cost_center_id: 'centro de custo',
    financial_account_id: 'conta financeira',
    due_date: 'vencimento',
    competence_date: 'competência'
  };
  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'start', marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <FinanceQualityBadge severity={props.issue.severity} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{props.issue.title}</span>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.45 }}>{props.issue.detail}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', fontFamily: "'DM Mono', monospace" }}>
            <FinanceMono>{formatCurrency(props.issue.amount_cents)}</FinanceMono>
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>{formatDate(props.issue.reference_date)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {props.issue.missing_fields.map((field) => (
          <Badge key={field} color="#92400e" bg="#fef3c7">{fieldLabels[field] ?? field}</Badge>
        ))}
      </div>

      {props.issue.suggestions.length > 0 ? (
        <div style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
          {props.issue.suggestions.slice(0, 3).map((suggestion) => (
            <div key={`${suggestion.field}-${suggestion.value}`} style={{ fontSize: 11, color: '#475569' }}>
              {suggestion.field}: <strong>{suggestion.label}</strong> · {Math.round(suggestion.confidence * 100)}%
            </div>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => props.onReview(props.issue)}
        disabled={props.applying || props.issue.suggestions.length === 0}
        style={{
          height: 28,
          border: 'none',
          borderRadius: 7,
          background: props.issue.suggestions.length === 0 ? '#e2e8f0' : '#2563eb',
          color: props.issue.suggestions.length === 0 ? '#64748b' : 'white',
          cursor: props.applying || props.issue.suggestions.length === 0 ? 'default' : 'pointer',
          fontSize: 11,
          fontWeight: 700,
          fontFamily: 'inherit',
          padding: '0 12px'
        }}
      >
        {props.applying ? 'Aplicando...' : 'Revisar pendência'}
      </button>
    </div>
  );
}

type TabKey = 'fila' | 'quality' | 'importados' | 'matches';

export function FinanceReconciliationPage() {
  const { period, setPeriod } = useFinancePeriod();
  const [inbox, setInbox] = useState<FinanceReconciliationInbox | null>(null);
  const [qualityInbox, setQualityInbox] = useState<FinanceQualityInbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [inlineError, setInlineError] = useState('');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<TabKey>('fila');
  const [matchingEntryId, setMatchingEntryId] = useState<string | null>(null);
  const [creatingEntryId, setCreatingEntryId] = useState<string | null>(null);
  const [correctingIssueId, setCorrectingIssueId] = useState<string | null>(null);
  const [reviewIssue, setReviewIssue] = useState<FinanceQualityIssue | null>(null);
  const [reviewCorrection, setReviewCorrection] = useState<Record<string, string>>({});
  const [saveAsDefault, setSaveAsDefault] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([financeApi.getReconciliationInbox(), financeApi.getQualityInbox()])
      .then(([reconciliationResult, qualityResult]) => {
        if (cancelled) return;

        if (reconciliationResult.status === 'fulfilled') {
          setInbox(reconciliationResult.value);
        } else {
          setLoadError(reconciliationResult.reason instanceof Error ? reconciliationResult.reason.message : 'Falha ao carregar a inbox de conciliação.');
          return;
        }

        if (qualityResult.status === 'fulfilled') {
          setQualityInbox(qualityResult.value);
        } else {
          setQualityInbox(null);
        }

        setLoadError('');
      })
      .catch((loadError) => {
        if (cancelled) return;
        setLoadError((loadError as Error).message || 'Falha ao carregar a inbox de conciliação.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const queueEntries = useMemo(() => inbox?.inbox ?? [], [inbox]);
  const importedJobs = useMemo(() => inbox?.imported_jobs ?? [], [inbox]);
  const recentMatches = useMemo(() => inbox?.recent_matches ?? [], [inbox]);
  const learnedRules = useMemo(() => inbox?.learned_rules ?? [], [inbox]);
  const qualityIssues = useMemo(() => qualityInbox?.issues ?? [], [qualityInbox]);
  const suggestionRows = useMemo(() => queueEntries.flatMap((entry) => entry.suggested_matches).slice(0, 3), [queueEntries]);

  const tabs: Array<{ id: TabKey; label: string; count: number }> = [
    { id: 'fila', label: 'Na fila', count: queueEntries.length },
    { id: 'quality', label: 'Dados incompletos', count: qualityIssues.length },
    { id: 'importados', label: 'Importados', count: importedJobs.length },
    { id: 'matches', label: 'Matches recentes', count: recentMatches.length }
  ];

  async function handleApplyMatch(entry: FinanceReconciliationInboxEntry, suggestion: FinanceReconciliationSuggestion) {
    setMessage('');
    setInlineError('');
    setMatchingEntryId(entry.id);
    try {
      const created = await financeApi.createReconciliation({
        financial_bank_statement_entry_id: entry.id,
        financial_transaction_id: suggestion.financial_transaction_id,
        confidence_score: suggestion.confidence_score,
        match_status: 'matched',
        source: 'manual'
      });

      setInbox((current) => {
        if (!current) return current;

        const nextInbox = current.inbox.filter((item) => item.id !== entry.id);
        const nextBuckets = current.buckets.map((bucket) => {
          const nextEntries = bucket.entries.filter((item) => item.id !== entry.id);
          const nextAmount = nextEntries.reduce((total, item) => total + Math.abs(item.amount_cents), 0);
          return {
            ...bucket,
            entries: nextEntries,
            count: nextEntries.length,
            amount_cents: nextAmount
          };
        });

        return {
          ...current,
          inbox: nextInbox,
          buckets: nextBuckets,
          recent_matches: [created, ...current.recent_matches],
          summary: {
            ...current.summary,
            pending_count: Math.max(0, current.summary.pending_count - 1),
            pending_amount_cents: Math.max(0, current.summary.pending_amount_cents - Math.abs(entry.amount_cents)),
            matched_today_count: current.summary.matched_today_count + 1,
            with_suggestion_count: Math.max(0, current.summary.with_suggestion_count - 1)
          }
        };
      });
      setMessage('Match aplicado com sucesso.');
    } catch (matchError) {
      setInlineError(matchError instanceof Error ? matchError.message : 'Falha ao aplicar o match manual.');
    } finally {
      setMatchingEntryId(null);
    }
  }

  async function handleCreateTransactionFromStatement(entry: FinanceReconciliationInboxEntry) {
    setMessage('');
    setInlineError('');
    setCreatingEntryId(entry.id);
    try {
      const created = await financeApi.createTransactionFromStatement(entry.id, {
        note: entry.description
      });

      setInbox((current) => {
        if (!current) return current;

        const nextInbox = current.inbox.filter((item) => item.id !== entry.id);
        const nextBuckets = current.buckets.map((bucket) => {
          const nextEntries = bucket.entries.filter((item) => item.id !== entry.id);
          const nextAmount = nextEntries.reduce((total, item) => total + Math.abs(item.amount_cents), 0);
          return {
            ...bucket,
            entries: nextEntries,
            count: nextEntries.length,
            amount_cents: nextAmount
          };
        });

        return {
          ...current,
          inbox: nextInbox,
          buckets: nextBuckets,
          recent_matches: [created.match, ...current.recent_matches],
          summary: {
            ...current.summary,
            pending_count: Math.max(0, current.summary.pending_count - 1),
            pending_amount_cents: Math.max(0, current.summary.pending_amount_cents - Math.abs(entry.amount_cents)),
            matched_today_count: current.summary.matched_today_count + 1,
            without_suggestion_count: entry.suggestion_count === 0
              ? Math.max(0, current.summary.without_suggestion_count - 1)
              : current.summary.without_suggestion_count,
            with_suggestion_count: entry.suggestion_count > 0
              ? Math.max(0, current.summary.with_suggestion_count - 1)
              : current.summary.with_suggestion_count
          }
        };
      });
      setMessage('Lançamento criado e conciliado com sucesso.');
    } catch (createError) {
      setInlineError(createError instanceof Error ? createError.message : 'Falha ao criar lançamento pelo extrato.');
    } finally {
      setCreatingEntryId(null);
    }
  }

  function handleOpenQualityIssue(issue: FinanceQualityIssue) {
    setReviewIssue(issue);
    setReviewCorrection(issue.suggestions.reduce<Record<string, string>>((next, suggestion) => {
      next[suggestion.field] = suggestion.value;
      return next;
    }, {}));
    setSaveAsDefault(true);
  }

  async function handleApplyQualityIssue(issue: FinanceQualityIssue) {
    setMessage('');
    setInlineError('');
    setCorrectingIssueId(issue.id);

    try {
      await financeApi.applyQualityCorrection({
        resource_type: issue.resource_type,
        resource_id: issue.resource_id,
        financial_entity_id: reviewCorrection.financial_entity_id ?? null,
        financial_category_id: reviewCorrection.financial_category_id ?? null,
        financial_cost_center_id: reviewCorrection.financial_cost_center_id ?? null,
        financial_account_id: reviewCorrection.financial_account_id ?? null,
        financial_payment_method_id: reviewCorrection.financial_payment_method_id ?? null,
        due_date: reviewCorrection.due_date ?? null,
        competence_date: reviewCorrection.competence_date ?? null,
        save_as_default: saveAsDefault
      });

      setQualityInbox((current) => {
        if (!current) return current;
        const remainingIssues = current.issues.filter((item) => item.id !== issue.id);
        return {
          ...current,
          issues: remainingIssues,
          summary: {
            total_count: remainingIssues.length,
            critical_count: remainingIssues.filter((item) => item.severity === 'critical').length,
            warning_count: remainingIssues.filter((item) => item.severity === 'warning').length,
            suggestion_count: remainingIssues.filter((item) => item.severity === 'suggestion').length
          }
        };
      });
      setMessage('Pendência revisada e correção aplicada.');
      setReviewIssue(null);
      setReviewCorrection({});
    } catch (qualityError) {
      setInlineError(qualityError instanceof Error ? qualityError.message : 'Falha ao revisar a pendência.');
    } finally {
      setCorrectingIssueId(null);
    }
  }

  return (
    <section className="page finance-page finance-reconciliation-page">
      <FinancePageHeader
        eyebrow="Conciliação & Revisão"
        title="Inbox operacional financeira"
        description="Gerencie pendências bancárias, sugestões de match, importações de extratos e qualidade dos lançamentos."
        meta={<FinancePeriodFilter value={period} onChange={setPeriod} />}
      />

      {loading ? (
        <FinanceLoadingState title="Carregando painel de conciliação..." />
      ) : loadError ? (
        <FinanceErrorState title="Falha ao carregar a inbox de conciliação." description={loadError} />
      ) : inbox ? (
        <div style={{ display: 'grid', gap: 24 }}>
          {message ? (
            <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#065f46' }}>
              {message}
            </div>
          ) : null}
          {inlineError ? (
            <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#9f1239' }}>
              {inlineError}
            </div>
          ) : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>
            <Card padding={0}>
              <div style={{ padding: '16px 20px 0' }}>
                <SectionTitle>Pendências de conciliação</SectionTitle>
                <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', paddingBottom: 0 }} role="tablist" aria-label="Buckets de conciliação">
                  {tabs.map((item) => {
                    const selected = tab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => setTab(item.id)}
                        style={{
                          padding: '7px 14px',
                          fontSize: 12,
                          fontWeight: selected ? 700 : 400,
                          color: selected ? 'var(--accent)' : '#64748b',
                          background: 'none',
                          border: 'none',
                          borderBottom: selected ? '2px solid var(--accent)' : '2px solid transparent',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          marginBottom: -1,
                          gap: 6,
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        {item.label}
                        <Badge color={selected ? 'var(--accent)' : '#94a3b8'} bg={selected ? '#dbeafe' : '#f1f5f9'}>
                          {item.count}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ padding: '0 0 4px' }}>
                {tab === 'fila' ? (
                  queueEntries.length > 0 ? (
                    queueEntries.map((entry) => (
                      <InboxEntryCard
                        key={entry.id}
                        entry={entry}
                        onMatch={handleApplyMatch}
                        onCreateTransaction={handleCreateTransactionFromStatement}
                        matching={matchingEntryId === entry.id}
                        creating={creatingEntryId === entry.id}
                      />
                    ))
                  ) : (
                    <div style={{ padding: '32px 0' }}>
                      <FinanceEmptyState title="Nenhuma pendência nesta aba." />
                    </div>
                  )
                ) : null}

                {tab === 'quality' ? (
                  qualityIssues.length > 0 ? (
                    qualityIssues.map((issue) => (
                      <QualityIssueCard
                        key={issue.id}
                        issue={issue}
                        onReview={handleOpenQualityIssue}
                        applying={correctingIssueId === issue.id}
                      />
                    ))
                  ) : (
                    <div style={{ padding: '32px 0' }}>
                      <FinanceEmptyState title="Nenhum dado incompleto nesta aba." />
                    </div>
                  )
                ) : null}

                {tab === 'importados' ? (
                  importedJobs.length > 0 ? (
                    importedJobs.map((job) => <ImportRow key={job.id} job={job} />)
                  ) : (
                    <div style={{ padding: '32px 0' }}>
                      <FinanceEmptyState title="Nenhum importado nesta aba." />
                    </div>
                  )
                ) : null}

                {tab === 'matches' ? (
                  recentMatches.length > 0 ? (
                    recentMatches.map((match) => <RecentMatchRow key={match.id} match={match} />)
                  ) : (
                    <div style={{ padding: '32px 0' }}>
                      <FinanceEmptyState title="Nenhum match recente nesta aba." />
                    </div>
                  )
                ) : null}
              </div>
            </Card>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Card>
                <SectionTitle>Sugestões de match</SectionTitle>
                {suggestionRows.length === 0 ? (
                  <FinanceEmptyState title="Nenhuma sugestão disponível no momento." />
                ) : (
                  suggestionRows.map((suggestion, index) => <MatchSuggestionCard key={`${suggestion.financial_transaction_id}-${index}`} suggestion={suggestion} />)
                )}
              </Card>

              <Card>
                <SectionTitle>Extratos importados</SectionTitle>
                {importedJobs.length === 0 ? <FinanceEmptyState title="Nenhum extrato importado." /> : importedJobs.slice(0, 2).map((job) => <ImportRow key={job.id} job={job} />)}
              </Card>

              <Card>
                <SectionTitle>Matches recentes</SectionTitle>
                {recentMatches.length === 0 ? <FinanceEmptyState title="Nenhum match recente." /> : recentMatches.map((match) => <RecentMatchRow key={match.id} match={match} />)}
              </Card>

              {learnedRules.length > 0 ? (
                <Card>
                  <SectionTitle>Regras aprendidas</SectionTitle>
                  {learnedRules.slice(0, 4).map((rule) => <LearnedRuleRow key={rule.id} rule={rule} />)}
                </Card>
              ) : null}
            </div>
          </div>

          {reviewIssue ? (
            <aside
              role="dialog"
              aria-label="Revisar pendência"
              style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: 420,
                maxWidth: 'calc(100vw - 24px)',
                background: 'white',
                borderLeft: '1px solid #e2e8f0',
                boxShadow: '-20px 0 40px rgba(15, 23, 42, 0.16)',
                padding: 20,
                zIndex: 80,
                overflow: 'auto'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 18 }}>
                <div>
                  <small style={{ display: 'block', color: 'var(--accent)', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Revisão operacional</small>
                  <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a', lineHeight: 1.2 }}>{reviewIssue.title}</h2>
                </div>
                <button
                  type="button"
                  aria-label="Fechar revisão"
                  onClick={() => setReviewIssue(null)}
                  style={{ border: '1px solid #e2e8f0', background: 'white', borderRadius: 8, height: 30, minWidth: 30, cursor: 'pointer', color: '#64748b' }}
                >
                  ×
                </button>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#f8fafc' }}>
                  <FinanceQualityBadge severity={reviewIssue.severity} />
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: '#475569', lineHeight: 1.45 }}>{reviewIssue.detail}</p>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                    {reviewIssue.entity_name ?? 'Sem entidade'} · <FinanceMono>{formatCurrency(reviewIssue.amount_cents)}</FinanceMono> · {formatDate(reviewIssue.reference_date)}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Problemas detectados</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {reviewIssue.missing_fields.map((field) => <Badge key={field} color="#92400e" bg="#fef3c7">{
                      ({
                        financial_entity_id: 'cliente/fornecedor',
                        financial_category_id: 'categoria',
                        financial_cost_center_id: 'centro de custo',
                        financial_account_id: 'conta financeira',
                        due_date: 'vencimento',
                        competence_date: 'competência'
                      } as Record<string, string>)[field] ?? field
                    }</Badge>)}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  {reviewIssue.suggestions.map((suggestion) => (
                    <label key={`${suggestion.field}-${suggestion.value}`} style={{ display: 'grid', gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{suggestion.field}</span>
                      <input
                        aria-label={`Correção ${suggestion.field}`}
                        value={reviewCorrection[suggestion.field] ?? ''}
                        onChange={(event) => setReviewCorrection((current) => ({ ...current, [suggestion.field]: event.target.value }))}
                        style={{ height: 34, border: '1px solid #e2e8f0', borderRadius: 8, padding: '0 10px', fontSize: 12, color: '#0f172a', outline: 'none' }}
                      />
                      <span style={{ fontSize: 11, color: '#64748b' }}>Sugestão: {suggestion.label} · {Math.round(suggestion.confidence * 100)}%</span>
                    </label>
                  ))}
                </div>

                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#475569' }}>
                  <input
                    type="checkbox"
                    checked={saveAsDefault}
                    onChange={(event) => setSaveAsDefault(event.target.checked)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  Salvar padrão para esta entidade
                </label>

                <button
                  type="button"
                  onClick={() => handleApplyQualityIssue(reviewIssue)}
                  disabled={correctingIssueId === reviewIssue.id}
                  style={{ height: 36, border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'white', cursor: correctingIssueId === reviewIssue.id ? 'default' : 'pointer', fontSize: 12, fontWeight: 800, fontFamily: 'inherit' }}
                >
                  {correctingIssueId === reviewIssue.id ? 'Aplicando correção...' : 'Aplicar correção'}
                </button>
              </div>
            </aside>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
