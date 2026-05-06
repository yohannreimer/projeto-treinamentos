import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { Section } from '../components/Section';
import { StatusChip } from '../components/StatusChip';
import { askDestructiveConfirmation } from '../utils/destructive';
import { statusLabel } from '../utils/labels';

const stageOptions = ['Triagem', 'Primeira_entrevista', 'Segunda_fase', 'Final'] as const;
const statusOptions = ['Em_processo', 'Stand_by', 'Aprovado', 'Reprovado', 'Banco_de_talentos'] as const;
type RecruitmentSortKey = 'name' | 'stage' | 'process_status' | 'updated_at';

type Candidate = {
  id: string;
  name: string;
  process_status: (typeof statusOptions)[number];
  stage: (typeof stageOptions)[number];
  strengths: string | null;
  concerns: string | null;
  specialties: string | null;
  equipment_notes: string | null;
  career_plan: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function RecruitmentPage() {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [sortKey, setSortKey] = useState<RecruitmentSortKey>('updated_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showCandidateFormSection, setShowCandidateFormSection] = useState(false);
  const [detailRow, setDetailRow] = useState<Candidate | null>(null);

  const [name, setName] = useState('');
  const [processStatus, setProcessStatus] = useState<(typeof statusOptions)[number]>('Em_processo');
  const [stage, setStage] = useState<(typeof stageOptions)[number]>('Triagem');
  const [strengths, setStrengths] = useState('');
  const [concerns, setConcerns] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [equipmentNotes, setEquipmentNotes] = useState('');
  const [careerPlan, setCareerPlan] = useState('');
  const [notes, setNotes] = useState('');

  async function load() {
    const data = await api.recruitmentCandidates() as Candidate[];
    setRows(data ?? []);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!detailRow) return undefined;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDetailRow(null);
      }
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [detailRow]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.process_status !== statusFilter) return false;
      if (stageFilter && row.stage !== stageFilter) return false;
      if (!normalized) return true;
      return `${row.name} ${row.strengths ?? ''} ${row.specialties ?? ''} ${row.notes ?? ''}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [rows, query, statusFilter, stageFilter]);

  const ordered = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      const left = String((a as any)[sortKey] ?? '');
      const right = String((b as any)[sortKey] ?? '');
      return left.localeCompare(right) * direction;
    });
    return list;
  }, [filtered, sortKey, sortDirection]);

  function toggleSort(nextKey: RecruitmentSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === 'name' ? 'asc' : 'desc');
  }

  function sortIndicator(nextKey: RecruitmentSortKey) {
    if (sortKey !== nextKey) return '';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  }

  const stats = useMemo(() => {
    return {
      total: rows.length,
      inProcess: rows.filter((row) => row.process_status === 'Em_processo').length,
      approved: rows.filter((row) => row.process_status === 'Aprovado').length,
      standby: rows.filter((row) => row.process_status === 'Stand_by').length
    };
  }, [rows]);

  function resetForm() {
    setEditingId(null);
    setName('');
    setProcessStatus('Em_processo');
    setStage('Triagem');
    setStrengths('');
    setConcerns('');
    setSpecialties('');
    setEquipmentNotes('');
    setCareerPlan('');
    setNotes('');
  }

  function editCandidate(row: Candidate) {
    setShowCandidateFormSection(true);
    setEditingId(row.id);
    setName(row.name);
    setProcessStatus(row.process_status);
    setStage(row.stage);
    setStrengths(row.strengths ?? '');
    setConcerns(row.concerns ?? '');
    setSpecialties(row.specialties ?? '');
    setEquipmentNotes(row.equipment_notes ?? '');
    setCareerPlan(row.career_plan ?? '');
    setNotes(row.notes ?? '');
  }

  async function saveCandidate() {
    if (!name.trim()) {
      setError('Informe o nome do candidato.');
      return;
    }
    setError('');
    setMessage('');
    const payload = {
      name: name.trim(),
      process_status: processStatus,
      stage,
      strengths: strengths.trim() || null,
      concerns: concerns.trim() || null,
      specialties: specialties.trim() || null,
      equipment_notes: equipmentNotes.trim() || null,
      career_plan: careerPlan.trim() || null,
      notes: notes.trim() || null
    };

    try {
      if (editingId) {
        await api.updateRecruitmentCandidate(editingId, payload);
        setMessage('Candidato atualizado.');
      } else {
        await api.createRecruitmentCandidate(payload);
        setMessage('Candidato cadastrado.');
      }
      resetForm();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteCandidate(row: Candidate) {
    const confirmationPhrase = askDestructiveConfirmation(`Excluir candidato "${row.name}"`);
    if (!confirmationPhrase) {
      setMessage('Ação cancelada.');
      return;
    }

    setError('');
    setMessage('');
    try {
      await api.deleteRecruitmentCandidate(row.id, confirmationPhrase);
      setMessage('Candidato removido.');
      if (editingId === row.id) {
        resetForm();
      }
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function openCandidateDetail(row: Candidate) {
    setDetailRow(row);
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Processos Seletivos</h1>
        <p>Acompanhe evolução por etapa, pontos fortes, limitações, especialidades e plano de carreira.</p>
      </header>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="info">{message}</p> : null}

      <div className="stats-grid">
        <article className="mini-stat"><span>Total</span><strong>{stats.total}</strong></article>
        <article className="mini-stat"><span>Em processo</span><strong>{stats.inProcess}</strong></article>
        <article className="mini-stat"><span>Aprovados</span><strong>{stats.approved}</strong></article>
        <article className="mini-stat"><span>Stand by</span><strong>{stats.standby}</strong></article>
      </div>

      <Section
        title={editingId ? 'Editar candidato' : 'Cadastrar candidato'}
        action={(
          <button
            type="button"
            className="section-collapse-btn"
            onClick={() => setShowCandidateFormSection((prev) => !prev)}
            aria-expanded={showCandidateFormSection}
            aria-label={showCandidateFormSection ? 'Minimizar cadastro de candidato' : 'Expandir cadastro de candidato'}
          >
            {showCandidateFormSection ? '−' : '+'}
          </button>
        )}
      >
        {showCandidateFormSection ? (
          <div className="form form-spacious">
          <div className="three-col">
            <label>
              Nome
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Etapa atual
              <select value={stage} onChange={(event) => setStage(event.target.value as (typeof stageOptions)[number])}>
                {stageOptions.map((option) => (
                  <option key={option} value={option}>{statusLabel(option)}</option>
                ))}
              </select>
            </label>
            <label>
              Status do processo
              <select value={processStatus} onChange={(event) => setProcessStatus(event.target.value as (typeof statusOptions)[number])}>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>{statusLabel(option)}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="three-col">
            <label>
              Pontos fortes
              <input value={strengths} onChange={(event) => setStrengths(event.target.value)} placeholder="Ex.: Muito bom em CAD" />
            </label>
            <label>
              Pontos de atenção
              <input value={concerns} onChange={(event) => setConcerns(event.target.value)} placeholder="Ex.: Equipamento fraco" />
            </label>
            <label>
              Especialidades
              <input value={specialties} onChange={(event) => setSpecialties(event.target.value)} placeholder="Ex.: CAD/CAM" />
            </label>
          </div>
          <div className="two-col">
            <label>
              Observação de equipamento/infra
              <textarea rows={2} value={equipmentNotes} onChange={(event) => setEquipmentNotes(event.target.value)} />
            </label>
            <label>
              Plano de carreira
              <textarea rows={2} value={careerPlan} onChange={(event) => setCareerPlan(event.target.value)} />
            </label>
          </div>
          <label>
            Notas gerais
            <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>

          <div className="actions">
            <button type="button" onClick={saveCandidate}>{editingId ? 'Salvar alterações' : 'Cadastrar candidato'}</button>
            {editingId ? <button type="button" onClick={resetForm}>Cancelar edição</button> : null}
          </div>
          </div>
        ) : null}
      </Section>

      <Section title="Filtros">
        <div className="actions">
          <input
            placeholder="Buscar por nome, especialidade ou notas"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Todos os status</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>{statusLabel(option)}</option>
            ))}
          </select>
          <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
            <option value="">Todas as etapas</option>
            {stageOptions.map((option) => (
              <option key={option} value={option}>{statusLabel(option)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setStatusFilter('');
              setStageFilter('');
            }}
          >
            Limpar filtros
          </button>
        </div>
      </Section>

      <Section title="Candidatos">
        <div className="table-wrap table-wrap-wide">
        <table className="table table-hover table-tight table-readable-grid recruitment-table">
          <colgroup>
            <col className="recruitment-col-candidate" />
            <col className="recruitment-col-stage" />
            <col className="recruitment-col-status" />
            <col className="recruitment-col-text" />
            <col className="recruitment-col-text" />
            <col className="recruitment-col-specialties" />
            <col className="recruitment-col-plan" />
            <col className="recruitment-col-date" />
            <col className="recruitment-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('name')}>Candidato{sortIndicator('name')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('stage')}>Etapa{sortIndicator('stage')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('process_status')}>Status{sortIndicator('process_status')}</button></th>
              <th>Pontos fortes</th>
              <th>Pontos de atenção</th>
              <th>Especialidades</th>
              <th>Plano de carreira</th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('updated_at')}>Atualizado{sortIndicator('updated_at')}</button></th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((row) => (
              <tr key={row.id} className="row-openable" onDoubleClick={() => openCandidateDetail(row)}>
                <td>
                  <strong className="table-cell-clamp table-cell-clamp-title">{row.name}</strong>
                  {row.notes ? <div className="muted table-cell-clamp table-cell-clamp-tall">{row.notes}</div> : null}
                </td>
                <td><StatusChip value={row.stage} /></td>
                <td><StatusChip value={row.process_status} /></td>
                <td><div className="table-cell-clamp table-cell-clamp-tall">{row.strengths ?? '-'}</div></td>
                <td><div className="table-cell-clamp table-cell-clamp-tall">{row.concerns ?? '-'}</div></td>
                <td><div className="table-cell-clamp">{row.specialties ?? '-'}</div></td>
                <td><div className="table-cell-clamp table-cell-clamp-tall">{row.career_plan ?? '-'}</div></td>
                <td>{row.updated_at}</td>
                <td className="actions" onDoubleClick={(event) => event.stopPropagation()}>
                  <button type="button" onClick={() => editCandidate(row)}>Editar</button>
                  <button type="button" onClick={() => deleteCandidate(row)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Section>

      {detailRow ? (
        <div className="read-detail-overlay" role="dialog" aria-modal="true" aria-label="Detalhes do candidato">
          <button type="button" className="read-detail-backdrop" onClick={() => setDetailRow(null)} aria-label="Fechar detalhes do candidato" />
          <section className="read-detail-panel">
            <header className="read-detail-header">
              <div>
                <p>Processo seletivo</p>
                <h2>{detailRow.name}</h2>
              </div>
              <button type="button" className="read-detail-close" onClick={() => setDetailRow(null)} aria-label="Fechar">✕</button>
            </header>
            <div className="read-detail-body">
              <article className="read-detail-block">
                <span>Etapa</span>
                <p>{statusLabel(detailRow.stage)}</p>
              </article>
              <article className="read-detail-block">
                <span>Status</span>
                <p>{statusLabel(detailRow.process_status)}</p>
              </article>
              <article className="read-detail-block">
                <span>Atualizado</span>
                <p>{detailRow.updated_at}</p>
              </article>
              <article className="read-detail-block read-detail-block-wide">
                <span>Notas gerais</span>
                <p>{detailRow.notes || '-'}</p>
              </article>
              <article className="read-detail-block read-detail-block-wide">
                <span>Pontos fortes</span>
                <p>{detailRow.strengths || '-'}</p>
              </article>
              <article className="read-detail-block read-detail-block-wide">
                <span>Pontos de atenção</span>
                <p>{detailRow.concerns || '-'}</p>
              </article>
              <article className="read-detail-block">
                <span>Especialidades</span>
                <p>{detailRow.specialties || '-'}</p>
              </article>
              <article className="read-detail-block read-detail-block-wide">
                <span>Equipamento/infra</span>
                <p>{detailRow.equipment_notes || '-'}</p>
              </article>
              <article className="read-detail-block read-detail-block-wide">
                <span>Plano de carreira</span>
                <p>{detailRow.career_plan || '-'}</p>
              </article>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
