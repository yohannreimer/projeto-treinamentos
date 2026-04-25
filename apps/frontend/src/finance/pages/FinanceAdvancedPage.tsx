import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  financeApi,
  financeApiUrl,
  type FinanceAdvancedApproval,
  type FinanceAdvancedDashboard,
  type FinanceAdvancedSeverity,
  type FinanceAttachment,
  type FinanceAutomationRule
} from '../api';
import { FinanceEmptyState, FinanceErrorState, FinanceLoadingState, FinanceMono, FinancePageHeader } from '../components/FinancePrimitives';

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(dateIso?: string | null): string {
  if (!dateIso) return '-';
  const [year, month, day] = dateIso.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return dateIso;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function parseCurrencyToCents(raw: string): number {
  const normalized = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function severityTone(severity: FinanceAdvancedSeverity): 'success' | 'warning' | 'danger' {
  if (severity === 'critical') return 'danger';
  if (severity === 'warning') return 'warning';
  return 'success';
}

function humanAuditAction(action: string) {
  const labels: Record<string, string> = {
    approve_payment: 'Pagamento aprovado',
    settle: 'Baixa registrada',
    attachment_created: 'Comprovante anexado',
    canceled: 'Cancelamento registrado'
  };
  return labels[action] ?? 'Movimento registrado';
}

function resourceLabel(resourceType: string) {
  const labels: Record<string, string> = {
    payable: 'Conta a pagar',
    receivable: 'Conta a receber',
    transaction: 'Movimentação',
    reconciliation: 'Conciliação'
  };
  return labels[resourceType] ?? 'Registro financeiro';
}

function AdvancedBadge({ tone, children }: { tone: 'neutral' | 'success' | 'warning' | 'danger' | 'accent'; children: string }) {
  return <span className={`finance-badge finance-badge--${tone}`}>{children}</span>;
}

type AdvancedToolTab = 'rules' | 'proofs' | 'audit' | 'exports' | 'connections' | 'access';

const advancedToolTabs: Array<{ id: AdvancedToolTab; label: string }> = [
  { id: 'rules', label: 'Regras' },
  { id: 'proofs', label: 'Comprovantes' },
  { id: 'audit', label: 'Auditoria' },
  { id: 'exports', label: 'Exportações' },
  { id: 'connections', label: 'Integrações' },
  { id: 'access', label: 'Permissões' }
];

export function FinanceAdvancedPage() {
  const [dashboard, setDashboard] = useState<FinanceAdvancedDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [activeToolTab, setActiveToolTab] = useState<AdvancedToolTab>('rules');
  const [ruleForm, setRuleForm] = useState({
    name: 'Aprovação para pagamentos altos',
    minAmount: '5.000,00'
  });
  const [attachmentForm, setAttachmentForm] = useState({
    resource_type: 'payable' as FinanceAttachment['resource_type'],
    resource_id: '',
    file_name: '',
    mime_type: 'application/pdf',
    file_size_bytes: 0
  });
  const [integrationForm, setIntegrationForm] = useState({
    provider: 'Open Finance Sandbox',
    account_name: 'Conta operacional sandbox'
  });

  async function loadDashboard() {
    setLoading(true);
    setError('');
    try {
      setDashboard(await financeApi.getAdvancedDashboard());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar painel avançado.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  const firstApproval = useMemo(() => dashboard?.approval_queue[0] ?? null, [dashboard]);
  const selectedTemplate = useMemo(() => {
    if (!dashboard?.assisted_rule_templates.length) return null;
    return dashboard.assisted_rule_templates.find((template) => template.id === selectedTemplateId)
      ?? dashboard.assisted_rule_templates[0];
  }, [dashboard, selectedTemplateId]);

  useEffect(() => {
    if (!dashboard?.assisted_rule_templates.length || selectedTemplateId) return;
    setSelectedTemplateId(dashboard.assisted_rule_templates[0].id);
  }, [dashboard, selectedTemplateId]);

  useEffect(() => {
    if (!firstApproval || attachmentForm.resource_id) return;
    setAttachmentForm((current) => ({ ...current, resource_id: firstApproval.payable_id }));
  }, [attachmentForm.resource_id, firstApproval]);

  async function runAction(key: string, action: () => Promise<unknown>, success: string) {
    setBusyKey(key);
    setMessage('');
    setError('');
    try {
      await action();
      setMessage(success);
      await loadDashboard();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Falha ao executar ação avançada.');
    } finally {
      setBusyKey('');
    }
  }

  function createRule() {
    if (!selectedTemplate) return Promise.resolve();
    const minAmountCents = parseCurrencyToCents(ruleForm.minAmount);
    const conditions = {
      ...selectedTemplate.default_conditions,
      ...(minAmountCents > 0 ? { min_amount_cents: minAmountCents } : {})
    };

    return runAction('rule', () => financeApi.createAutomationRule({
      name: ruleForm.name.trim() || selectedTemplate.label,
      trigger_type: selectedTemplate.trigger_type,
      conditions,
      action_type: selectedTemplate.action_type,
      action_payload: selectedTemplate.action_payload,
      is_active: true
    }), 'Regra assistida criada e ativada.');
  }

  function toggleRule(rule: FinanceAutomationRule) {
    return runAction(`rule-${rule.id}`, () => financeApi.toggleAutomationRule(rule.id, !rule.is_active), rule.is_active ? 'Regra pausada.' : 'Regra ativada.');
  }

  function approvePayment(approval: FinanceAdvancedApproval) {
    return runAction(`approve-${approval.payable_id}`, () => financeApi.approvePayable(approval.payable_id, 'Pagamento aprovado pelo cockpit avançado.'), 'Pagamento aprovado com trilha de auditoria.');
  }

  function handleAttachmentFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setAttachmentForm((current) => ({
      ...current,
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      file_size_bytes: file.size
    }));
  }

  function createAttachment() {
    return runAction('attachment', () => financeApi.createAttachment({
      resource_type: attachmentForm.resource_type,
      resource_id: attachmentForm.resource_id.trim() || firstApproval?.payable_id || 'manual-reference',
      file_name: attachmentForm.file_name.trim() || 'comprovante-financeiro.pdf',
      mime_type: attachmentForm.mime_type.trim() || 'application/pdf',
      file_size_bytes: attachmentForm.file_size_bytes,
      storage_ref: `finance://comprovantes/${attachmentForm.file_name.trim() || 'comprovante-financeiro.pdf'}`
    }), 'Comprovante registrado no histórico.');
  }

  function createIntegration() {
    return runAction('integration', () => financeApi.createBankIntegration({
      provider: integrationForm.provider.trim() || 'Open Finance Sandbox',
      status: 'sandbox',
      account_name: integrationForm.account_name.trim() || null
    }), 'Integração sandbox registrada.');
  }

  function renderToolPanel() {
    if (!dashboard) return null;

    if (activeToolTab === 'rules') {
      return dashboard.automation_rules.length === 0 ? (
        <FinanceEmptyState title="Nenhuma regra ativa." description="Crie uma regra assistida para começar a proteger a operação." />
      ) : (
        <div className="finance-advanced-rule-list">
          {dashboard.automation_rules.map((rule) => (
            <article key={rule.id} className="finance-advanced-rule">
              <div>
                <strong>{rule.name}</strong>
                <p>{rule.human_trigger}</p>
                <ul>
                  {rule.human_conditions.map((condition) => <li key={condition}>{condition}</li>)}
                </ul>
              </div>
              <div className="finance-advanced-rule__side">
                <AdvancedBadge tone={rule.is_active ? 'success' : 'neutral'}>{rule.is_active ? 'Ativa' : 'Pausada'}</AdvancedBadge>
                <span>{rule.human_action}</span>
                {rule.recommended_action ? <small>{rule.recommended_action}</small> : null}
                <button type="button" className="finance-advanced-button" onClick={() => { void toggleRule(rule); }} disabled={busyKey === `rule-${rule.id}`}>
                  {rule.is_active ? 'Pausar' : 'Ativar'}
                </button>
              </div>
            </article>
          ))}
        </div>
      );
    }

    if (activeToolTab === 'proofs') {
      return (
        <div className="finance-advanced-form-stack finance-advanced-tool-split">
          <div className="finance-advanced-tool-form">
            <label>
              <span>Tipo de vínculo</span>
              <select value={attachmentForm.resource_type} onChange={(event) => setAttachmentForm((current) => ({ ...current, resource_type: event.target.value as FinanceAttachment['resource_type'] }))}>
                <option value="payable">Conta a pagar</option>
                <option value="receivable">Conta a receber</option>
                <option value="transaction">Movimentação</option>
                <option value="reconciliation">Conciliação</option>
              </select>
            </label>
            <label>
              <span>Registro relacionado</span>
              <input aria-label="Registro relacionado ao anexo" value={attachmentForm.resource_id} onChange={(event) => setAttachmentForm((current) => ({ ...current, resource_id: event.target.value }))} />
            </label>
            <label>
              <span>Arquivo</span>
              <input aria-label="Arquivo do comprovante" type="file" onChange={handleAttachmentFile} />
            </label>
            {attachmentForm.file_name ? <small>Selecionado: {attachmentForm.file_name}</small> : null}
            <button type="button" className="finance-advanced-button finance-advanced-button--primary" onClick={() => { void createAttachment(); }} disabled={busyKey === 'attachment'}>
              {busyKey === 'attachment' ? 'Registrando...' : 'Registrar comprovante'}
            </button>
          </div>
          <div className="finance-advanced-mini-list">
            {dashboard.attachments.length === 0 ? <span>Nenhum comprovante registrado ainda.</span> : dashboard.attachments.slice(0, 5).map((attachment) => (
              <span key={attachment.id}>{attachment.file_name} · {resourceLabel(attachment.resource_type)}</span>
            ))}
          </div>
        </div>
      );
    }

    if (activeToolTab === 'audit') {
      return (
        <div className="finance-advanced-audit">
          {dashboard.audit_entries.length === 0 ? <FinanceEmptyState title="Nenhum registro recente." /> : dashboard.audit_entries.slice(0, 6).map((entry) => (
            <article key={entry.id}>
              <strong>{humanAuditAction(entry.action)}</strong>
              <span>{resourceLabel(entry.resource_type)} · {entry.note ?? 'Sem observação'}</span>
              <small>{entry.created_by ?? 'Sistema'} · {formatDate(entry.created_at)}</small>
            </article>
          ))}
        </div>
      );
    }

    if (activeToolTab === 'exports') {
      return (
        <div className="finance-advanced-export-list">
          {dashboard.export_options.map((option) => (
            <div key={option.dataset}>
              <span>{option.label}</span>
              <a href={financeApiUrl(option.csv_url)}>CSV</a>
              <a href={financeApiUrl(option.pdf_url)}>PDF</a>
            </div>
          ))}
        </div>
      );
    }

    if (activeToolTab === 'connections') {
      return (
        <div className="finance-advanced-form-stack finance-advanced-tool-split">
          <div className="finance-advanced-tool-form">
            <label>
              <span>Provedor</span>
              <input value={integrationForm.provider} onChange={(event) => setIntegrationForm((current) => ({ ...current, provider: event.target.value }))} />
            </label>
            <label>
              <span>Conta</span>
              <input value={integrationForm.account_name} onChange={(event) => setIntegrationForm((current) => ({ ...current, account_name: event.target.value }))} />
            </label>
            <button type="button" className="finance-advanced-button" onClick={() => { void createIntegration(); }} disabled={busyKey === 'integration'}>
              {busyKey === 'integration' ? 'Conectando...' : 'Conectar sandbox'}
            </button>
          </div>
          <div className="finance-advanced-mini-list">
            {dashboard.bank_integrations.length === 0 ? <span>Nenhuma integração registrada.</span> : dashboard.bank_integrations.map((integration) => (
              <span key={integration.id}>{integration.provider} · {integration.account_name ?? 'Sem conta vinculada'}</span>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="finance-advanced-permissions">
        {dashboard.permission_matrix.map((permission) => (
          <div key={permission.permission}>
            <span>{permission.label}</span>
            <AdvancedBadge tone={permission.enabled_for_current_user ? 'success' : 'neutral'}>
              {permission.enabled_for_current_user ? 'Liberado' : 'Bloqueado'}
            </AdvancedBadge>
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className="page finance-page finance-advanced-page">
      <FinancePageHeader
        eyebrow="Poder avançado"
        title="Cockpit de controle"
        description="Decisões, regras, comprovantes, auditoria e conexões em uma central operacional sem linguagem técnica."
        meta={dashboard ? (
          <>
            <span>Atualizado: <strong>{formatDate(dashboard.generated_at)}</strong></span>
            <span>Regras ativas: <strong>{dashboard.summary.active_rule_count}</strong></span>
          </>
        ) : undefined}
      />

      {loading ? <FinanceLoadingState title="Carregando cockpit avançado..." /> : null}
      {error ? <FinanceErrorState title="Falha no painel avançado." description={error} /> : null}

      {!loading && dashboard ? (
        <div className="finance-advanced">
          {message ? <div className="finance-advanced__notice">{message}</div> : null}

          <div className="finance-advanced-command-strip" aria-label="Resumo da central avançada">
            {Object.entries(dashboard.cockpit.sections).map(([key, section]) => (
              <article key={key} className={`finance-advanced-command-chip finance-advanced-command-chip--${section.severity}`}>
                <span>{section.label}</span>
                <strong>{section.count}</strong>
                <AdvancedBadge tone={severityTone(section.severity)}>
                  {section.severity === 'critical' ? 'Atenção' : section.severity === 'warning' ? 'Monitorar' : 'Estável'}
                </AdvancedBadge>
              </article>
            ))}
          </div>

          <div className="finance-advanced-command-center">
            <section className="finance-panel finance-advanced-panel finance-advanced-automation">
              <div className="finance-panel__header">
                <div className="finance-panel__header-copy">
                  <small>Automação inteligente</small>
                  <h2>Quando isso acontecer, faça isso</h2>
                  <p>Monte regras operacionais em linguagem de gestão. O sistema cuida da fila, das exigências e da trilha de auditoria.</p>
                </div>
              </div>
              <div className="finance-panel__content finance-advanced-automation__content">
                <div className="finance-advanced-template-rail" aria-label="Modelos de automação">
                  {dashboard.assisted_rule_templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className={`finance-advanced-template ${selectedTemplate?.id === template.id ? 'is-selected' : ''}`}
                      onClick={() => {
                        setSelectedTemplateId(template.id);
                        setRuleForm((current) => ({ ...current, name: template.label }));
                      }}
                    >
                      <strong>{template.label}</strong>
                      <span>{template.description}</span>
                    </button>
                  ))}
                </div>

                <div className="finance-advanced-rule-composer">
                  <article>
                    <small>Quando</small>
                    <strong>{selectedTemplate?.description ?? 'Escolha um modelo de automação'}</strong>
                    <span>Origem: operação financeira</span>
                  </article>
                  <article>
                    <small>Se</small>
                    <label>
                      <span>Valor de atenção</span>
                      <input aria-label="Valor de atenção da regra" value={ruleForm.minAmount} onChange={(event) => setRuleForm((current) => ({ ...current, minAmount: event.target.value }))} />
                    </label>
                  </article>
                  <article>
                    <small>Então</small>
                    <strong>{selectedTemplate?.label ?? 'Criar regra assistida'}</strong>
                    <span>Sem código, sem campo técnico exposto.</span>
                  </article>
                </div>

                <div className="finance-advanced-rule-form finance-advanced-rule-form--composer">
                  <label>
                    <span>Nome da regra</span>
                    <input value={ruleForm.name} onChange={(event) => setRuleForm((current) => ({ ...current, name: event.target.value }))} />
                  </label>
                  <button type="button" className="finance-advanced-button finance-advanced-button--primary" onClick={() => { void createRule(); }} disabled={!selectedTemplate || busyKey === 'rule'}>
                    {busyKey === 'rule' ? 'Criando...' : 'Ativar automação'}
                  </button>
                </div>
              </div>
            </section>

            <aside className="finance-panel finance-advanced-panel finance-advanced-decisions" aria-label="Decisões geradas pelas automações">
              <div className="finance-panel__header">
                <div className="finance-panel__header-copy">
                  <small>Fila de decisão</small>
                  <h2>O que precisa de você</h2>
                  <p>Itens aparecem aqui porque uma regra pediu revisão, aprovação ou comprovante.</p>
                </div>
              </div>
              <div className="finance-panel__content finance-advanced-decision-list">
                {dashboard.approval_queue.length === 0 ? (
                  <FinanceEmptyState title="Nenhuma decisão pendente." description="Quando uma regra pedir aprovação, ela aparece aqui." />
                ) : dashboard.approval_queue.map((approval) => (
                  <article key={approval.id} className="finance-advanced-decision">
                    <div>
                      <div className="finance-advanced-decision__title">
                        <strong>{approval.description}</strong>
                        {approval.severity === 'high' ? <AdvancedBadge tone="danger">Alta atenção</AdvancedBadge> : <AdvancedBadge tone="warning">Revisar</AdvancedBadge>}
                      </div>
                      <span>{approval.supplier_name ?? 'Fornecedor sem cadastro'} · vence em {formatDate(approval.due_date)}</span>
                    </div>
                    <div className="finance-advanced-decision__action">
                      <FinanceMono>{formatCurrency(approval.amount_cents)}</FinanceMono>
                      <button type="button" className="finance-advanced-button finance-advanced-button--primary" onClick={() => { void approvePayment(approval); }} disabled={busyKey === `approve-${approval.payable_id}`}>
                        Aprovar
                      </button>
                    </div>
                  </article>
                ))}

                {dashboard.cockpit.recommended_actions.slice(0, 1).map((action) => (
                  <article key={action.id} className="finance-advanced-recommendation-inline">
                    <small>Sugestão</small>
                    <strong>{action.label}</strong>
                    <span>{action.description}</span>
                  </article>
                ))}
              </div>
            </aside>
          </div>

          <section className="finance-panel finance-advanced-panel finance-advanced-toolbox">
            <div className="finance-panel__header">
              <div className="finance-panel__header-copy">
                <small>Controle operacional</small>
                <h2>Base de suporte</h2>
                <p>Regras existentes, comprovantes, auditoria, exportações, integrações e acesso ficam organizados por contexto.</p>
              </div>
            </div>
            <div className="finance-panel__content finance-advanced-toolbox__content">
              <div className="finance-advanced-tool-tabs" aria-label="Ferramentas avançadas">
                {advancedToolTabs.map((tab) => (
                  <button key={tab.id} type="button" aria-pressed={activeToolTab === tab.id} onClick={() => setActiveToolTab(tab.id)}>
                    {tab.label}
                  </button>
                ))}
              </div>
              {renderToolPanel()}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
