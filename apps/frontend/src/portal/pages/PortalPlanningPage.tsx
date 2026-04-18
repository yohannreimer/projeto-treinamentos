import { useEffect, useMemo, useState } from 'react';
import type { PortalAuthedApi, PortalHoursSummary, PortalOperatorDisplaySettings, PortalPlanningItem } from '../types';

type PortalPlanningPageProps = {
  api: PortalAuthedApi;
  isInternal: boolean;
};

function planningStatusTone(status: string) {
  if (status === 'Concluido') return 'is-success';
  if (status === 'Em_execucao' || status === 'Em_andamento') return 'is-progress';
  return 'is-muted';
}

function planningStatusLabel(status: string) {
  if (status === 'Concluido') return 'Concluído';
  if (status === 'Em_execucao' || status === 'Em_andamento') return 'Em andamento';
  return 'Não iniciado';
}

function deliveryModeLabel(mode: string | undefined) {
  if (mode === 'entregavel') return 'Entregável';
  return 'Treinamento';
}

function deliverableProgressLabel(status: string) {
  if (status === 'Concluido') return 'Entregue';
  if (status === 'Em_execucao' || status === 'Em_andamento') return 'Em execução';
  return 'Pendente';
}

function formatDateBr(dateIso: string | null) {
  if (!dateIso) return '-';
  const [year, month, day] = dateIso.split('-').map(Number);
  if (!year || !month || !day) return dateIso;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function formatDateListBr(values: string[] | undefined) {
  if (!values || values.length === 0) return '';
  return values.slice(0, 3).map((value) => formatDateBr(value)).join(' · ');
}

function formatHours(value: number) {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1
  });
}

const emptySettings: PortalOperatorDisplaySettings = {
  support_intro_text: null,
  hidden_module_ids: [],
  module_date_overrides: [],
  module_status_overrides: []
};

export function PortalPlanningPage({ api, isInternal }: PortalPlanningPageProps) {
  const [items, setItems] = useState<PortalPlanningItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settings, setSettings] = useState<PortalOperatorDisplaySettings>(emptySettings);
  const [hoursSummary, setHoursSummary] = useState<PortalHoursSummary | null>(null);

  async function load() {
    const planningResponse = await api.planning();
    setItems(planningResponse.items ?? []);
    setHoursSummary(planningResponse.hours_summary ?? null);
    if (isInternal) {
      const displaySettings = await api.operatorDisplaySettings();
      setSettings({
        support_intro_text: displaySettings.support_intro_text ?? null,
        hidden_module_ids: displaySettings.hidden_module_ids ?? [],
        module_date_overrides: displaySettings.module_date_overrides ?? [],
        module_status_overrides: displaySettings.module_status_overrides ?? []
      });
    }
  }

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    load()
      .then(() => {
        if (!mounted) return;
        setError('');
      })
      .catch((loadError) => {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar planejamento.');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [api, isInternal]);

  const hiddenSet = useMemo(() => new Set(settings.hidden_module_ids), [settings.hidden_module_ids]);
  const dateOverrideMap = useMemo(
    () => new Map(settings.module_date_overrides.map((entry) => [entry.module_id, entry.next_date])),
    [settings.module_date_overrides]
  );
  const statusOverrideMap = useMemo(
    () => new Map(settings.module_status_overrides.map((entry) => [entry.module_id, entry.status])),
    [settings.module_status_overrides]
  );
  const summary = hoursSummary ?? {
    available_hours: 0,
    consumed_hours: 0,
    balance_hours: 0,
    remaining_diarias: 0
  };

  function setModuleDateOverride(moduleId: string, nextDate: string) {
    setSettings((prev) => ({
      ...prev,
      module_date_overrides: [
        ...prev.module_date_overrides.filter((entry) => entry.module_id !== moduleId),
        ...(nextDate ? [{ module_id: moduleId, next_date: nextDate }] : [])
      ]
    }));
  }

  function setModuleStatusOverride(moduleId: string, status: '' | 'Planejado' | 'Em_execucao' | 'Concluido') {
    setSettings((prev) => ({
      ...prev,
      module_status_overrides: [
        ...prev.module_status_overrides.filter((entry) => entry.module_id !== moduleId),
        ...(status ? [{ module_id: moduleId, status }] : [])
      ]
    }));
  }

  function toggleModuleHidden(moduleId: string, checked: boolean) {
    setSettings((prev) => ({
      ...prev,
      hidden_module_ids: checked
        ? Array.from(new Set([...prev.hidden_module_ids, moduleId]))
        : prev.hidden_module_ids.filter((value) => value !== moduleId)
    }));
  }

  async function saveOperatorSettings() {
    setSavingSettings(true);
    try {
      await api.updateOperatorDisplaySettings(settings);
      await load();
      setError('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar ajustes internos de planejamento.');
    } finally {
      setSavingSettings(false);
    }
  }

  if (loading) return <p>Carregando planejamento...</p>;
  if (error) return <p className="error">{error}</p>;

  return (
    <section className="portal-panel">
      <header className="portal-panel-header">
        <h2>Planejamento</h2>
        <p>Acompanhe os módulos previstos, concluídos e em andamento com leitura rápida por status.</p>
      </header>
      <section className="portal-hours-summary">
        <div className="portal-hours-summary-head">
          <span className="portal-support-kicker">Banco de horas</span>
          <strong>{formatHours(summary.balance_hours)} h de saldo disponível</strong>
        </div>
        <div className="portal-hours-summary-grid">
          <article className="portal-hours-summary-item">
            <span>Disponível</span>
            <strong>{formatHours(summary.available_hours)} h</strong>
          </article>
          <article className="portal-hours-summary-item">
            <span>Consumido</span>
            <strong>{formatHours(summary.consumed_hours)} h</strong>
          </article>
          <article className="portal-hours-summary-item portal-hours-summary-item-accent">
            <span>Saldo</span>
            <strong>{formatHours(summary.balance_hours)} h</strong>
          </article>
          <article className="portal-hours-summary-item">
            <span>Diárias restantes</span>
            <strong>{formatHours(summary.remaining_diarias)}</strong>
          </article>
        </div>
      </section>

      {isInternal ? (
        <section className="portal-operator-panel">
          <h3>Ajustes internos da visão do cliente</h3>
          <label>
            Texto de abertura do suporte
            <textarea
              rows={2}
              value={settings.support_intro_text ?? ''}
              onChange={(event) => setSettings((prev) => ({ ...prev, support_intro_text: event.target.value || null }))}
              placeholder="Texto visível na aba de suporte do cliente."
            />
          </label>
          <div className="actions actions-compact">
            <button type="button" className="portal-primary-btn" onClick={() => void saveOperatorSettings()} disabled={savingSettings}>
              {savingSettings ? 'Salvando...' : 'Salvar ajustes do planejamento'}
            </button>
          </div>
          <p className="form-hint">Esses ajustes são de mão única no portal do cliente e não alteram o planejamento principal no orquestrador.</p>
        </section>
      ) : null}

      {items.length === 0 ? (
        <div className="portal-empty-state">
          <strong>Nenhum módulo disponível no planejamento.</strong>
          <p>Assim que o plano for publicado pela equipe Holand, ele aparece aqui automaticamente.</p>
        </div>
      ) : null}
      {items.length > 0 ? (
        <div className="portal-table-wrap">
          <table className="portal-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Execução</th>
                <th>Status</th>
                <th>Concluído em</th>
                {isInternal ? <th>Ajustes internos</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={`${item.module_code}-${item.module_name}`}
                  className={(item.delivery_mode ?? 'ministrado') === 'entregavel' ? 'portal-row-deliverable' : 'portal-row-training'}
                >
                  <td>
                    <div className="portal-planning-name">
                      <strong>{item.module_name}</strong>
                      <span className="portal-planning-code">{item.module_code}</span>
                    </div>
                    {(item.delivery_mode ?? 'ministrado') === 'ministrado' && item.total_encounters ? (
                      <p className="portal-table-subline">
                        {item.completed_encounters ?? 0}/{item.total_encounters} encontros
                        {' · '}
                        faltam {item.remaining_encounters ?? 0}
                        {item.next_dates && item.next_dates.length > 0 ? ` · próximas: ${formatDateListBr(item.next_dates)}` : ''}
                      </p>
                    ) : null}
                    {item.delivery_mode === 'entregavel' ? (
                      <p className="portal-table-subline">
                        Entrega acompanhada pela equipe Holand com atualização contínua de status.
                      </p>
                    ) : null}
                  </td>
                  <td>
                    <span className={`portal-table-mode-chip ${(item.delivery_mode ?? 'ministrado') === 'entregavel' ? 'is-deliverable' : 'is-training'}`}>
                      {deliveryModeLabel(item.delivery_mode)}
                    </span>
                  </td>
                  <td>
                    {item.delivery_mode === 'entregavel' ? (
                      <div className="portal-table-exec">
                        <strong>{deliverableProgressLabel(item.status)}</strong>
                        <span>Atualizado pela equipe Holand</span>
                      </div>
                    ) : (
                      (() => {
                        const plannedHours = Math.max(0, Number(item.planned_hours ?? 0));
                        const actualHours = Math.max(0, Number(item.actual_client_consumed_hours ?? 0));
                        const remainingHours = Math.max(0, plannedHours - actualHours);
                        const plannedDiarias = Math.max(0, Number(item.planned_diarias ?? (plannedHours / 8)));
                        return (
                          <div className="portal-table-exec">
                            <strong>{formatHours(plannedDiarias)} diária(s) planejadas · {formatHours(plannedHours)} h</strong>
                            <span>{formatHours(actualHours)} h realizadas · saldo {formatHours(remainingHours)} h</span>
                          </div>
                        );
                      })()
                    )}
                  </td>
                  <td>
                    <span className={`portal-status-chip ${planningStatusTone(item.status)}`}>
                      {planningStatusLabel(item.status)}
                    </span>
                  </td>
                  <td>{formatDateBr(item.completed_at)}</td>
                  {isInternal ? (
                    <td>
                      <div className="portal-inline-operator-grid">
                        <label>
                          Status
                          <select
                            value={statusOverrideMap.get(item.module_id) ?? ''}
                            onChange={(event) => setModuleStatusOverride(item.module_id, event.target.value as '' | 'Planejado' | 'Em_execucao' | 'Concluido')}
                          >
                            <option value="">Automático</option>
                            <option value="Planejado">Não iniciado</option>
                            <option value="Em_execucao">Em andamento</option>
                            <option value="Concluido">Concluído</option>
                          </select>
                        </label>
                        <label>
                          Próxima data
                          <input
                            type="date"
                            value={dateOverrideMap.get(item.module_id) ?? ''}
                            onChange={(event) => setModuleDateOverride(item.module_id, event.target.value)}
                          />
                        </label>
                        <label className="portal-inline-check">
                          <input
                            type="checkbox"
                            checked={hiddenSet.has(item.module_id)}
                            onChange={(event) => toggleModuleHidden(item.module_id, event.target.checked)}
                          />
                          Ocultar no portal
                        </label>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
