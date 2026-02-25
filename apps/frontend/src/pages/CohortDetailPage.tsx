import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import { StatusChip } from '../components/StatusChip';
import { Section } from '../components/Section';
import { statusLabel } from '../utils/labels';

function modulesFromEntry(blocks: any[], entryModuleId: string): string[] {
  const entry = blocks.find((block) => block.module_id === entryModuleId);
  if (!entry) return blocks.map((block) => block.module_id);
  return blocks
    .filter((block) => block.order_in_cohort >= entry.order_in_cohort)
    .map((block) => block.module_id);
}

export function CohortDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [entryModule, setEntryModule] = useState('');
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [suggestions, setSuggestions] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [allocationSortKey, setAllocationSortKey] = useState<'company_name' | 'entry_day' | 'status'>('entry_day');
  const [allocationSortDirection, setAllocationSortDirection] = useState<'asc' | 'desc'>('asc');

  function load() {
    if (!id) return;
    api.cohortById(id)
      .then((d) => {
        setData(d);
        const firstModule = d.blocks?.[0]?.module_id ?? '';
        setEntryModule((prev) => {
          const chosen = prev && d.blocks?.some((block: any) => block.module_id === prev) ? prev : firstModule;
          setSelectedModules(modulesFromEntry(d.blocks ?? [], chosen));
          return chosen;
        });
        setError('');
      })
      .catch((err: Error) => {
        setData(null);
        setError(err.message);
      });

    api.companies()
      .then((rows: any) => setCompanies(rows.map((x: any) => ({ id: x.id, name: x.name }))))
      .catch(() => setCompanies([]));
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!id || !entryModule) return;
    api.allocationSuggestions(id, entryModule).then((s: any) => {
      setSuggestions(s);
      const firstReady = s.companies?.find((company: any) => !company.block_reason)?.id ?? s.companies?.[0]?.id ?? '';
      setSelectedCompany((prev) => (s.companies?.some((company: any) => company.id === prev) ? prev : firstReady));
    });
  }, [id, entryModule]);

  const selectedCompanySuggestion = useMemo(() => {
    const rows = suggestions?.companies ?? [];
    return rows.find((company: any) => company.id === selectedCompany) ?? null;
  }, [suggestions, selectedCompany]);

  const grouped = useMemo(() => {
    if (!data) return {};
    return data.allocations.reduce((acc: Record<string, any[]>, item: any) => {
      const key = item.module_name ?? item.module_code;
      acc[key] = acc[key] ?? [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [data]);

  function sortedAllocations(allocations: any[]) {
    const rows = [...allocations];
    rows.sort((a, b) => {
      const direction = allocationSortDirection === 'asc' ? 1 : -1;
      if (allocationSortKey === 'entry_day') {
        return (Number(a.entry_day ?? 0) - Number(b.entry_day ?? 0)) * direction;
      }
      return String(a[allocationSortKey] ?? '').localeCompare(String(b[allocationSortKey] ?? '')) * direction;
    });
    return rows;
  }

  function toggleAllocationSort(nextKey: 'company_name' | 'entry_day' | 'status') {
    if (allocationSortKey === nextKey) {
      setAllocationSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setAllocationSortKey(nextKey);
    setAllocationSortDirection(nextKey === 'entry_day' ? 'asc' : 'desc');
  }

  function allocationSortIndicator(nextKey: 'company_name' | 'entry_day' | 'status') {
    if (allocationSortKey !== nextKey) return '';
    return allocationSortDirection === 'asc' ? ' ↑' : ' ↓';
  }

  const selectedBlocks = useMemo(() => {
    if (!data?.blocks) return [];
    const selected = new Set(selectedModules);
    return data.blocks
      .filter((block: any) => selected.has(block.module_id))
      .sort((a: any, b: any) => a.order_in_cohort - b.order_in_cohort);
  }, [data, selectedModules]);

  function toggleSelectedModule(moduleId: string) {
    if (moduleId === entryModule) return;
    setSelectedModules((prev) => (prev.includes(moduleId) ? prev.filter((id) => id !== moduleId) : [...prev, moduleId]));
  }

  async function createAllocation() {
    if (!id) return;
    try {
      await api.allocateCompanyByEntryModule(id, {
        company_id: selectedCompany,
        entry_module_id: entryModule,
        module_ids: Array.from(new Set([...selectedModules, entryModule]))
      });
      setMessage('Alocações criadas com dia automático por módulo.');
      setError('');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function updateStatus(allocationId: string, status: string) {
    try {
      await api.updateAllocationStatus(allocationId, { status });
      setMessage(`Status atualizado para ${status}.`);
      setError('');
      load();
    } catch (err) {
      const apiMessage = (err as Error).message;
      if (status === 'Executado' && apiMessage.includes('Instala')) {
        const reason = window.prompt('Pré-requisito de Instalação pendente. Informe justificativa para override manual:');
        if (!reason?.trim()) {
          setError(apiMessage);
          return;
        }

        try {
          await api.updateAllocationStatus(allocationId, {
            status,
            override_installation_prereq: true,
            override_reason: reason.trim()
          });
          setMessage('Status atualizado para Executado com override manual.');
          setError('');
          load();
          return;
        } catch (overrideErr) {
          setError((overrideErr as Error).message);
          return;
        }
      }

      setError(apiMessage);
    }
  }

  if (!data && !error) return <p>Carregando turma...</p>;

  return (
    <div className="page">
      <header className="page-header">
        <h1>{data ? `${data.code} - ${data.name}` : 'Turma'}</h1>
      </header>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="info">{message}</p> : null}

      {!data ? null : (
      <>
      <div className="two-col">
        <Section title="Dados gerais">
          <p><strong>Início:</strong> {data.start_date}</p>
          <p><strong>Técnico:</strong> {data.technician_name ?? '-'}</p>
          <p><strong>Formato:</strong> {statusLabel(data.delivery_mode ?? 'Online')} · {statusLabel(data.period ?? 'Integral')}</p>
          <p><strong>Capacidade:</strong> {data.capacity_companies}</p>
          <StatusChip value={data.status} />

          <h3>Blocos</h3>
          <ul>
            {data.blocks.map((b: any) => (
              <li key={b.id}>{b.order_in_cohort}. {b.module_name} (dia {b.start_day_offset}, {b.duration_days} diárias)</li>
            ))}
          </ul>
        </Section>

        <Section title="Alocar empresa por módulo">
          <div className="form">
            <label>Módulo de entrada
              <select
                value={entryModule}
                onChange={(e) => {
                  const next = e.target.value;
                  setEntryModule(next);
                  setSelectedModules(modulesFromEntry(data.blocks ?? [], next));
                }}
              >
                {data.blocks.map((b: any) => (
                  <option key={b.id} value={b.module_id}>{b.module_name}</option>
                ))}
              </select>
            </label>
            <label>Empresa
              <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}>
                {(suggestions?.companies ?? companies).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {typeof c.priority === 'number' ? ` [P${c.priority}]` : ''}
                    {c.block_reason ? ` (${c.block_reason})` : ''}
                  </option>
                ))}
              </select>
            </label>
            {selectedCompanySuggestion?.block_reason ? (
              <p className="error">Empresa bloqueada para este módulo de entrada: {selectedCompanySuggestion.block_reason}</p>
            ) : null}

            <div className="allocation-module-grid">
              {data.blocks.map((block: any) => {
                const checked = selectedModules.includes(block.module_id);
                const locked = block.module_id === entryModule;
                return (
                  <label
                    key={block.id}
                    className={`allocation-module-option ${checked ? 'is-checked' : ''} ${locked ? 'is-locked' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelectedModule(block.module_id)}
                      disabled={locked}
                    />
                    <span className="allocation-module-title">{block.order_in_cohort}. {block.module_name}</span>
                    <small>Dia {block.start_day_offset} • {block.duration_days} diária(s)</small>
                  </label>
                );
              })}
            </div>

            <div className="form-subcard">
              <strong>Prévia dos dias:</strong>
              <div className="event-list">
                {selectedBlocks.map((block: any) => (
                  <div key={block.id} className="event-item">
                    <span>{block.module_name}</span>
                    <span>Dia {block.start_day_offset}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={createAllocation}
              disabled={!selectedCompany || !entryModule || selectedBlocks.length === 0 || Boolean(selectedCompanySuggestion?.block_reason)}
            >
              Adicionar alocação
            </button>
          </div>
        </Section>
      </div>

      <Section title="Alocações">
        {Object.entries(grouped).map(([moduleCode, allocations]) => (
          <div key={moduleCode} className="allocation-group">
            <h3>{moduleCode}</h3>
            <table className="table">
              <thead><tr>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleAllocationSort('company_name')}>Empresa{allocationSortIndicator('company_name')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleAllocationSort('entry_day')}>Dia de entrada{allocationSortIndicator('entry_day')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleAllocationSort('status')}>Status{allocationSortIndicator('status')}</button></th>
                <th>Ações</th>
              </tr></thead>
              <tbody>
                {sortedAllocations(allocations as any[]).map((a) => (
                  <tr key={a.id}>
                    <td>{a.company_name}</td>
                    <td>{a.entry_day}</td>
                    <td>
                      <StatusChip value={a.status} />
                      {a.override_installation_prereq ? (
                        <p className="allocation-override-note">
                          Override MOD-01: {a.override_reason ?? 'Sem justificativa'}
                        </p>
                      ) : null}
                    </td>
                    <td className="actions">
                      <button onClick={() => updateStatus(a.id, 'Confirmado')}>Confirmar</button>
                      <button onClick={() => updateStatus(a.id, 'Executado')}>Executado</button>
                      <button onClick={() => updateStatus(a.id, 'Cancelado')}>Cancelar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Section>
      </>
      )}
    </div>
  );
}
