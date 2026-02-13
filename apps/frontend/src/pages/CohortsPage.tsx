import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import type { Cohort, Module } from '../types';
import { Section } from '../components/Section';
import { StatusChip } from '../components/StatusChip';
import { statusLabel } from '../utils/labels';
import { askDestructiveConfirmation } from '../utils/destructive';

type BlockDraft = {
  key: string;
  module_id: string;
  duration_days: number;
};

type CohortBlock = {
  id: string;
  module_id: string;
  module_name: string;
  order_in_cohort: number;
  start_day_offset: number;
  duration_days: number;
};

type CohortAllocation = {
  id: string;
  company_name: string;
  module_name: string;
  entry_day: number;
  status: 'Previsto' | 'Confirmado' | 'Executado' | 'Cancelado';
  override_installation_prereq?: number;
  override_reason?: string | null;
};

type CohortDetail = Cohort & {
  blocks: CohortBlock[];
  allocations: CohortAllocation[];
};

const statuses = ['Planejada', 'Aguardando_quorum', 'Confirmada', 'Concluida', 'Cancelada'];

function randomKey() {
  return Math.random().toString(36).slice(2, 10);
}

function moduleShortLabel(name: string): string {
  return name
    .replace(/^Treinamento\s+/i, '')
    .replace(/^TopSolid'?/i, 'TopSolid')
    .trim();
}

function moduleDurationById(modules: Module[], moduleId: string): number {
  const duration = modules.find((module) => module.id === moduleId)?.duration_days;
  return Math.max(1, Number(duration) || 1);
}

function modulesFromEntry(blocks: CohortBlock[], entryModuleId: string): string[] {
  const entry = blocks.find((block) => block.module_id === entryModuleId);
  if (!entry) return blocks.map((block) => block.module_id);
  return blocks
    .filter((block) => block.order_in_cohort >= entry.order_in_cohort)
    .map((block) => block.module_id);
}

export function CohortsPage() {
  const [searchParams] = useSearchParams();

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [technicians, setTechnicians] = useState<Array<{ id: string; name: string }>>([]);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);

  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDetail, setEditingDetail] = useState<CohortDetail | null>(null);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [technicianId, setTechnicianId] = useState('');
  const [capacity, setCapacity] = useState(8);
  const [status, setStatus] = useState('Planejada');
  const [notes, setNotes] = useState('');
  const [blocks, setBlocks] = useState<BlockDraft[]>([]);

  const [entryModuleId, setEntryModuleId] = useState('');
  const [allocationModuleIds, setAllocationModuleIds] = useState<string[]>([]);
  const [allocationCompanyId, setAllocationCompanyId] = useState('');
  const [allocationNotes, setAllocationNotes] = useState('');
  const [allocationSuggestions, setAllocationSuggestions] = useState<any>(null);
  const [isCheckingTechnicianConflict, setIsCheckingTechnicianConflict] = useState(false);
  const [hasTechnicianConflict, setHasTechnicianConflict] = useState(false);
  const [technicianConflictMessage, setTechnicianConflictMessage] = useState('');
  const [technicianConflictCohortId, setTechnicianConflictCohortId] = useState<string | null>(null);

  function suggestedCode(rows: Cohort[]) {
    const next = rows.length + 1;
    return `TUR-${String(next).padStart(3, '0')}`;
  }

  function toBlockPayload(draft: BlockDraft[]) {
    let day = 1;
    return draft.map((block, index) => {
      const duration = Math.max(1, Number(block.duration_days) || 1);
      const payload = {
        module_id: block.module_id,
        order_in_cohort: index + 1,
        start_day_offset: day,
        duration_days: duration
      };
      day += duration;
      return payload;
    });
  }

  async function loadAll() {
    const [cohortRows, moduleRows, technicianRows, companyRows] = await Promise.all([
      api.cohorts(),
      api.modules(),
      api.technicians(),
      api.companies()
    ]);

    setCohorts(cohortRows as Cohort[]);
    setModules(moduleRows as Module[]);
    setTechnicians(technicianRows as Array<{ id: string; name: string }>);
    setCompanies((companyRows as any[]).map((company) => ({ id: company.id, name: company.name })));

    return {
      cohorts: cohortRows as Cohort[],
      modules: moduleRows as Module[]
    };
  }

  async function loadCohortDetail(cohortId: string) {
    const detail = await api.cohortById(cohortId) as CohortDetail;
    setEditingDetail(detail);

    const firstBlockModuleId = detail.blocks?.[0]?.module_id ?? '';
    const chosenEntryModule = entryModuleId && detail.blocks.some((block) => block.module_id === entryModuleId)
      ? entryModuleId
      : firstBlockModuleId;

    setEntryModuleId(chosenEntryModule);
    setAllocationModuleIds(modulesFromEntry(detail.blocks ?? [], chosenEntryModule));

    return detail;
  }

  function resetForm(availableModules: Module[], existingCohorts: Cohort[]) {
    const requestedCode = (searchParams.get('module') ?? '').toUpperCase();
    const requestedModule = availableModules.find((item) => item.code.toUpperCase() === requestedCode);
    const firstModule = requestedModule ?? availableModules[0];

    setEditingId(null);
    setCode(suggestedCode(existingCohorts));
    setName('Nova turma');
    setStartDate(new Date().toISOString().slice(0, 10));
    setTechnicianId('');
    setCapacity(8);
    setStatus('Planejada');
    setNotes('');
    setBlocks(firstModule ? [{ key: randomKey(), module_id: firstModule.id, duration_days: firstModule.duration_days || 1 }] : []);

    setEditingDetail(null);
    setEntryModuleId('');
    setAllocationModuleIds([]);
    setAllocationCompanyId('');
    setAllocationNotes('');
    setAllocationSuggestions(null);
    setIsCheckingTechnicianConflict(false);
    setHasTechnicianConflict(false);
    setTechnicianConflictMessage('');
    setTechnicianConflictCohortId(null);
  }

  useEffect(() => {
    loadAll()
      .then(({ cohorts: rows, modules: moduleRows }) => resetForm(moduleRows, rows))
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!editingId || !entryModuleId) return;

    api.allocationSuggestions(editingId, entryModuleId)
      .then((response: any) => {
        setAllocationSuggestions(response);
        const rows = response.companies ?? [];
        const firstReady = rows.find((company: any) => !company.block_reason)?.id ?? rows[0]?.id ?? '';
        setAllocationCompanyId((prev) => (rows.some((company: any) => company.id === prev) ? prev : firstReady));
      })
      .catch(() => setAllocationSuggestions(null));
  }, [editingId, entryModuleId]);

  const filtered = useMemo(() => {
    if (!query.trim()) return cohorts;
    const normalized = query.toLowerCase();
    return cohorts.filter((item) =>
      `${item.code} ${item.name} ${item.technician_name ?? ''}`.toLowerCase().includes(normalized)
    );
  }, [cohorts, query]);

  const blockPreview = useMemo(() => toBlockPayload(blocks), [blocks]);

  const allocationBlocks = useMemo(() => {
    if (!editingDetail?.blocks) return [] as CohortBlock[];
    const selected = new Set(allocationModuleIds);
    return editingDetail.blocks
      .filter((block) => selected.has(block.module_id))
      .sort((a, b) => a.order_in_cohort - b.order_in_cohort);
  }, [editingDetail, allocationModuleIds]);

  const selectedCompanySuggestion = useMemo(() => {
    const rows = allocationSuggestions?.companies ?? [];
    return rows.find((company: any) => company.id === allocationCompanyId) ?? null;
  }, [allocationSuggestions, allocationCompanyId]);

  const stats = useMemo(() => {
    const open = cohorts.filter((cohort) => ['Planejada', 'Aguardando_quorum', 'Confirmada'].includes(cohort.status)).length;
    const confirmed = cohorts.filter((cohort) => cohort.status === 'Confirmada').length;
    const noTech = cohorts.filter((cohort) => !cohort.technician_id).length;
    return { total: cohorts.length, open, confirmed, noTech };
  }, [cohorts]);

  useEffect(() => {
    if (!technicianId || !startDate || blockPreview.length === 0 || status === 'Cancelada') {
      setIsCheckingTechnicianConflict(false);
      setHasTechnicianConflict(false);
      setTechnicianConflictMessage('');
      setTechnicianConflictCohortId(null);
      return;
    }

    let active = true;
    setIsCheckingTechnicianConflict(true);
    api.checkTechnicianConflict({
      technician_id: technicianId,
      start_date: startDate,
      status,
      blocks: blockPreview,
      exclude_cohort_id: editingId ?? undefined
    }).then((response: any) => {
      if (!active) return;
      if (response.has_conflict) {
        setHasTechnicianConflict(true);
        setTechnicianConflictMessage(response.message ?? 'Conflito de agenda detectado para o técnico.');
        setTechnicianConflictCohortId(response.conflict?.cohort_id ?? null);
      } else {
        setHasTechnicianConflict(false);
        setTechnicianConflictMessage('');
        setTechnicianConflictCohortId(null);
      }
    }).catch(() => {
      if (!active) return;
      setHasTechnicianConflict(false);
      setTechnicianConflictMessage('Não foi possível validar a agenda agora. O bloqueio será aplicado ao salvar.');
      setTechnicianConflictCohortId(null);
    }).finally(() => {
      if (active) setIsCheckingTechnicianConflict(false);
    });

    return () => {
      active = false;
    };
  }, [technicianId, startDate, status, blockPreview, editingId]);

  function addBlock() {
    const fallbackModuleId = modules[0]?.id ?? '';
    setBlocks((prev) => [
      ...prev,
      {
        key: randomKey(),
        module_id: fallbackModuleId,
        duration_days: moduleDurationById(modules, fallbackModuleId)
      }
    ]);
  }

  function removeBlock(key: string) {
    setBlocks((prev) => prev.filter((block) => block.key !== key));
  }

  function updateBlock(key: string, patch: Partial<BlockDraft>) {
    setBlocks((prev) => prev.map((block) => (block.key === key ? { ...block, ...patch } : block)));
  }

  function setDefaultModulesFromEntry(detail: CohortDetail, nextEntryModuleId: string) {
    setEntryModuleId(nextEntryModuleId);
    setAllocationModuleIds(modulesFromEntry(detail.blocks ?? [], nextEntryModuleId));
  }

  function toggleAllocationModule(moduleId: string) {
    if (moduleId === entryModuleId) return;

    setAllocationModuleIds((prev) => {
      if (prev.includes(moduleId)) {
        return prev.filter((id) => id !== moduleId);
      }
      return [...prev, moduleId];
    });
  }

  async function startEdit(cohortId: string) {
    try {
      setError('');
      setMessage('');

      const detail = await loadCohortDetail(cohortId);

      setEditingId(detail.id);
      setCode(detail.code);
      setName(detail.name);
      setStartDate(detail.start_date);
      setTechnicianId(detail.technician_id ?? '');
      setCapacity(detail.capacity_companies);
      setStatus(detail.status);
      setNotes(detail.notes ?? '');
      setBlocks((detail.blocks ?? []).map((block) => ({
        key: randomKey(),
        module_id: block.module_id,
        duration_days: Number(block.duration_days) || 1
      })));
      setAllocationCompanyId('');
      setAllocationNotes('');
      setShowForm(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteCohort(cohort: Cohort) {
    const confirmationPhrase = askDestructiveConfirmation(`Excluir turma ${cohort.code} - ${cohort.name}`);
    if (!confirmationPhrase) {
      setMessage('Ação cancelada.');
      return;
    }

    try {
      await api.deleteCohort(cohort.id, confirmationPhrase);
      setMessage('Turma excluída com sucesso.');

      const refreshed = await loadAll();
      if (editingId === cohort.id) {
        resetForm(refreshed.modules, refreshed.cohorts);
        setShowForm(false);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function allocateCompanyInCohort() {
    if (!editingId) return;

    if (!allocationCompanyId || !entryModuleId) {
      setError('Selecione empresa e módulo de entrada para alocar.');
      return;
    }

    if (allocationModuleIds.length === 0) {
      setError('Selecione pelo menos um módulo para participação.');
      return;
    }

    const finalModuleIds = Array.from(new Set([...allocationModuleIds, entryModuleId]));

    try {
      const response = await api.allocateCompanyByEntryModule(editingId, {
        company_id: allocationCompanyId,
        entry_module_id: entryModuleId,
        module_ids: finalModuleIds,
        notes: allocationNotes.trim() || null
      }) as any;

      const total = Array.isArray(response.allocations_created) ? response.allocations_created.length : finalModuleIds.length;
      setMessage(`Cliente alocado em ${total} módulo(s), com dias calculados automaticamente.`);
      setAllocationNotes('');

      await loadCohortDetail(editingId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function updateAllocationStatus(allocationId: string, nextStatus: 'Confirmado' | 'Executado' | 'Cancelado') {
    try {
      await api.updateAllocationStatus(allocationId, { status: nextStatus });
      if (editingId) {
        await loadCohortDetail(editingId);
      }
      setMessage(`Status da alocação atualizado para ${nextStatus}.`);
    } catch (err) {
      const apiMessage = (err as Error).message;
      if (nextStatus === 'Executado' && apiMessage.includes('Instala')) {
        const reason = window.prompt('Pré-requisito de Instalação pendente. Informe justificativa para override manual:');
        if (!reason?.trim()) {
          setError(apiMessage);
          return;
        }

        try {
          await api.updateAllocationStatus(allocationId, {
            status: nextStatus,
            override_installation_prereq: true,
            override_reason: reason.trim()
          });
          if (editingId) {
            await loadCohortDetail(editingId);
          }
          setMessage('Status atualizado para Executado com override manual.');
          return;
        } catch (overrideErr) {
          setError((overrideErr as Error).message);
          return;
        }
      }
      setError(apiMessage);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!code.trim() || !name.trim()) {
      setError('Preencha código e nome da turma.');
      return;
    }

    if (blocks.length === 0) {
      setError('Adicione pelo menos um bloco.');
      return;
    }

    if (blocks.some((block) => !block.module_id)) {
      setError('Todos os blocos precisam ter um módulo selecionado.');
      return;
    }

    const uniqueModules = new Set(blocks.map((block) => block.module_id));
    if (uniqueModules.size !== blocks.length) {
      setError('Não repita o mesmo módulo na mesma turma.');
      return;
    }

    if (isCheckingTechnicianConflict) {
      setError('Aguarde a validação da agenda do técnico.');
      return;
    }
    if (hasTechnicianConflict) {
      setError(technicianConflictMessage || 'Conflito de agenda detectado para o técnico.');
      return;
    }

    const payload = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      start_date: startDate,
      technician_id: technicianId || null,
      status,
      capacity_companies: Math.max(1, Number(capacity) || 1),
      notes: notes.trim() || null,
      blocks: blockPreview
    };

    try {
      if (editingId) {
        await api.updateCohort(editingId, payload);
        setMessage('Turma atualizada com sucesso.');
        await loadCohortDetail(editingId);
        await loadAll();
      } else {
        const created = await api.createCohort(payload) as { id: string };
        setMessage('Turma criada com sucesso. Agora você já pode incluir clientes.');
        await loadAll();

        if (created?.id) {
          await startEdit(created.id);
          setShowForm(true);
          return;
        }
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="page cohorts-page">
      <header className="page-header">
        <h1>Turmas</h1>
        <p>Crie a sequência, atribua técnico e inclua clientes por módulo de entrada. O dia de entrada é calculado automaticamente.</p>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="info">{message}</p> : null}

      <div className="stats-grid stats-grid--cohorts">
        <article className="mini-stat">
          <span>Total de turmas</span>
          <strong>{stats.total}</strong>
        </article>
        <article className="mini-stat">
          <span>Turmas em operação</span>
          <strong>{stats.open}</strong>
        </article>
        <article className="mini-stat">
          <span>Confirmadas</span>
          <strong>{stats.confirmed}</strong>
        </article>
        <article className="mini-stat">
          <span>Sem técnico</span>
          <strong>{stats.noTech}</strong>
        </article>
      </div>

      <Section
        title="Turmas cadastradas"
        action={
          <div className="actions">
            <input
              placeholder="Buscar por código, nome ou técnico"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                setShowForm(true);
                resetForm(modules, cohorts);
              }}
            >
              Criar turma
            </button>
          </div>
        }
      >
        <table className="table table-hover">
          <thead>
            <tr>
              <th>Turma</th>
              <th>Data de início</th>
              <th>Técnico</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((cohort) => (
              <tr key={cohort.id} className={editingId === cohort.id ? 'row-selected' : ''}>
                <td>
                  <strong>{cohort.code}</strong>
                  <div>{cohort.name}</div>
                </td>
                <td>{cohort.start_date}</td>
                <td>{cohort.technician_name ?? 'Sem técnico'}</td>
                <td><StatusChip value={cohort.status} /></td>
                <td className="actions">
                  <button type="button" onClick={() => startEdit(cohort.id)}>Editar</button>
                  <button type="button" onClick={() => deleteCohort(cohort)}>Excluir</button>
                  <Link to={`/turmas/${cohort.id}`}>Abrir</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {showForm ? (
        <Section title={editingId ? `Editar turma ${code}` : 'Criar nova turma'}>
          <form className="form form-spacious" onSubmit={submit}>
            <div className="wizard-step">
              <h3>1. Informações principais</h3>
              <div className="three-col">
                <label>
                  Código
                  <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
                </label>
                <label>
                  Nome
                  <input value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label>
                  Data de início
                  <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                </label>
              </div>
              <div className="three-col">
                <label>
                  Técnico
                  <select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}>
                    <option value="">Sem técnico</option>
                    {technicians.map((technician) => (
                      <option key={technician.id} value={technician.id}>{technician.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Capacidade da turma
                  <input
                    type="number"
                    min={1}
                    value={capacity}
                    onChange={(event) => setCapacity(Math.max(1, Number(event.target.value) || 1))}
                  />
                </label>
                <label>
                  Status
                  <select value={status} onChange={(event) => setStatus(event.target.value)}>
                    {statuses.map((statusItem) => (
                      <option key={statusItem} value={statusItem}>{statusLabel(statusItem)}</option>
                    ))}
                  </select>
                </label>
              </div>
              {technicianId && status !== 'Cancelada' ? (
                <div className="form-subcard">
                  {isCheckingTechnicianConflict ? (
                    <p className="muted">Verificando conflito de agenda do técnico...</p>
                  ) : hasTechnicianConflict ? (
                    <div className="stack">
                      <p className="error">{technicianConflictMessage}</p>
                      {technicianConflictCohortId ? (
                        <Link to={`/turmas/${technicianConflictCohortId}`}>Abrir turma conflitante</Link>
                      ) : null}
                    </div>
                  ) : technicianConflictMessage ? (
                    <p className="warn-text">{technicianConflictMessage}</p>
                  ) : (
                    <p className="ok-text">Agenda do técnico disponível para esta turma.</p>
                  )}
                </div>
              ) : null}
              <label>
                Observações
                <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>
            </div>

            <div className="wizard-step">
              <h3>2. Sequência de módulos da turma</h3>
              <p className="muted">A ordem abaixo define automaticamente o início de cada módulo em diárias úteis.</p>
              <div className="stack">
                {blocks.map((block, index) => (
                  <div key={block.key} className="form-subcard block-card">
                    <strong>Bloco {index + 1}</strong>
                    <label>
                      Módulo
                      <select
                        value={block.module_id}
                        onChange={(event) => {
                          const nextModuleId = event.target.value;
                          updateBlock(block.key, {
                            module_id: nextModuleId,
                            duration_days: moduleDurationById(modules, nextModuleId)
                          });
                        }}
                      >
                        {modules.map((module) => (
                          <option key={module.id} value={module.id}>
                            {moduleShortLabel(module.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Diárias
                      <input
                        type="number"
                        min={1}
                        value={block.duration_days}
                        onChange={(event) => {
                          updateBlock(block.key, { duration_days: Math.max(1, Number(event.target.value) || 1) });
                        }}
                      />
                    </label>
                    <button type="button" onClick={() => removeBlock(block.key)} disabled={blocks.length <= 1}>
                      Remover bloco
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addBlock}>Adicionar bloco</button>
              </div>
            </div>

            <div className="wizard-step">
              <h3>3. Prévia da sequência</h3>
              <table className="table table-tight">
                <thead>
                  <tr>
                    <th>Ordem</th>
                    <th>Módulo</th>
                    <th>Início</th>
                    <th>Diárias</th>
                    <th>Fim</th>
                  </tr>
                </thead>
                <tbody>
                  {blockPreview.map((block) => {
                    const module = modules.find((item) => item.id === block.module_id);
                    const endDay = block.start_day_offset + block.duration_days - 1;
                    return (
                      <tr key={block.order_in_cohort}>
                        <td>{block.order_in_cohort}</td>
                        <td>{module ? moduleShortLabel(module.name) : block.module_id}</td>
                        <td>Dia {block.start_day_offset}</td>
                        <td>{block.duration_days}</td>
                        <td>Dia {endDay}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {editingId && editingDetail ? (
              <div className="wizard-step">
                <h3>4. Participantes (por módulo de entrada)</h3>
                <p className="muted">Você escolhe o módulo de entrada e os módulos que o cliente vai fazer. O sistema calcula os dias sozinho.</p>

                <div className="three-col">
                  <label>
                    Cliente
                    <select
                      value={allocationCompanyId}
                      onChange={(event) => setAllocationCompanyId(event.target.value)}
                    >
                      {(allocationSuggestions?.companies ?? companies).map((company: any) => (
                        <option
                          key={company.id}
                          value={company.id}
                          disabled={Boolean(company.block_reason)}
                        >
                          {company.name}{company.block_reason ? ` (${company.block_reason})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Módulo de entrada
                    <select
                      value={entryModuleId}
                      onChange={(event) => setDefaultModulesFromEntry(editingDetail, event.target.value)}
                    >
                      {(editingDetail.blocks ?? []).map((block) => (
                        <option key={block.id} value={block.module_id}>
                          {block.order_in_cohort}. {moduleShortLabel(block.module_name)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Observação da alocação
                    <input
                      value={allocationNotes}
                      onChange={(event) => setAllocationNotes(event.target.value)}
                      placeholder="Opcional"
                    />
                  </label>
                </div>

                {selectedCompanySuggestion?.block_reason ? (
                  <p className="error">Esta empresa está bloqueada para o módulo de entrada selecionado: {selectedCompanySuggestion.block_reason}</p>
                ) : null}

                <div className="allocation-module-grid">
                  {(editingDetail.blocks ?? []).map((block) => {
                    const checked = allocationModuleIds.includes(block.module_id);
                    const locked = block.module_id === entryModuleId;
                    return (
                      <label
                        key={block.id}
                        className={`allocation-module-option ${checked ? 'is-checked' : ''} ${locked ? 'is-locked' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAllocationModule(block.module_id)}
                          disabled={locked}
                        />
                        <span className="allocation-module-title">
                          {block.order_in_cohort}. {moduleShortLabel(block.module_name)}
                        </span>
                        <small>Dia {block.start_day_offset} • {block.duration_days} diária(s)</small>
                      </label>
                    );
                  })}
                </div>

                {allocationBlocks.length > 0 ? (
                  <div className="form-subcard">
                    <strong>Prévia dos dias que serão gravados:</strong>
                    <div className="event-list">
                      {allocationBlocks.map((block) => (
                        <div key={block.id} className="event-item">
                          <span>{moduleShortLabel(block.module_name)}</span>
                          <span>Dia {block.start_day_offset}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={allocateCompanyInCohort}
                  disabled={!allocationCompanyId || !entryModuleId || allocationBlocks.length === 0 || Boolean(selectedCompanySuggestion?.block_reason)}
                >
                  Adicionar cliente na turma
                </button>

                {editingDetail.allocations.length === 0 ? (
                  <p>Nenhum cliente alocado ainda nesta turma.</p>
                ) : (
                  <table className="table table-tight">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Módulo</th>
                        <th>Dia automático</th>
                        <th>Status</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editingDetail.allocations.map((allocation) => (
                        <tr key={allocation.id}>
                          <td>{allocation.company_name}</td>
                          <td>{moduleShortLabel(allocation.module_name)}</td>
                          <td>Dia {allocation.entry_day}</td>
                          <td>
                            <StatusChip value={allocation.status} />
                            {allocation.override_installation_prereq ? (
                              <p className="muted" style={{ marginTop: '4px' }}>
                                Override MOD-01: {allocation.override_reason ?? 'Sem justificativa'}
                              </p>
                            ) : null}
                          </td>
                          <td className="actions">
                            <button type="button" onClick={() => updateAllocationStatus(allocation.id, 'Confirmado')}>
                              Confirmar
                            </button>
                            <button type="button" onClick={() => updateAllocationStatus(allocation.id, 'Executado')}>
                              Executar
                            </button>
                            <button type="button" onClick={() => updateAllocationStatus(allocation.id, 'Cancelado')}>
                              Cancelar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : null}

            <div className="actions">
              <button type="submit" disabled={isCheckingTechnicianConflict || hasTechnicianConflict}>
                {editingId ? 'Salvar alterações' : 'Salvar turma'}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetForm(modules, cohorts);
                  setShowForm(false);
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </Section>
      ) : null}
    </div>
  );
}
