import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { TaskArea, TaskSummary } from '../../services/api';

type Props = {
  areas: TaskArea[];
  editingTask: TaskSummary | null;
  onSave: () => void;
  onClose: () => void;
};

type Technician = { id: string; name: string };

const PRIORITY_OPTIONS = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Baixa', label: 'Baixa' },
  { value: 'Alta', label: 'Alta' },
  { value: 'Critica', label: 'Crítica' }
];

export function TaskFormModal({ areas, editingTask, onSave, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [areaId, setAreaId] = useState('');
  const [newAreaName, setNewAreaName] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [assigneeName, setAssigneeName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [description, setDescription] = useState('');
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isCreatingArea = areaId === '__new__';

  useEffect(() => {
    void api.technicians().then((data: unknown) => {
      const list = data as Array<{ id: string; name: string }>;
      setTechnicians(list.map((t) => ({ id: t.id, name: t.name })));
    }).catch(() => setTechnicians([]));
  }, []);

  useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title);
      setAreaId(editingTask.area_id);
      setAssigneeId(editingTask.assignee_id);
      setAssigneeName(editingTask.assignee_name);
      setDueDate(editingTask.due_date);
      setPriority(editingTask.priority);
      setDescription(editingTask.description ?? '');
    } else {
      setTitle('');
      setAreaId(areas[0]?.id ?? '');
      setAssigneeId('');
      setAssigneeName('');
      setDueDate('');
      setPriority('Normal');
      setDescription('');
    }
  }, [editingTask, areas]);

  function handleAssigneeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setAssigneeId(id);
    const tech = technicians.find((t) => t.id === id);
    setAssigneeName(tech?.name ?? id);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!title.trim() || !dueDate || !assigneeId) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }

    setSaving(true);
    try {
      let resolvedAreaId = areaId;

      if (isCreatingArea) {
        if (!newAreaName.trim()) {
          setError('Informe o nome da nova área.');
          setSaving(false);
          return;
        }
        const result = await api.createTaskArea({ name: newAreaName.trim() });
        resolvedAreaId = result.id;
      }

      if (editingTask) {
        await api.updateTask(editingTask.id, {
          title: title.trim(),
          area_id: resolvedAreaId,
          assignee_id: assigneeId,
          assignee_name: assigneeName,
          due_date: dueDate,
          priority,
          description: description.trim() || null
        });
      } else {
        await api.createTask({
          title: title.trim(),
          area_id: resolvedAreaId,
          assignee_id: assigneeId,
          assignee_name: assigneeName,
          due_date: dueDate,
          priority,
          description: description.trim() || null
        });
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  const labelStyle: React.CSSProperties = { fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: '#00000066', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg-primary)', borderRadius: 10, padding: 24, width: 440, maxWidth: '95vw', boxShadow: '0 8px 32px #0005' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{editingTask ? 'Editar tarefa' : 'Nova tarefa'}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1.2rem' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Título *</label>
            <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Descreva a tarefa..." required />
          </div>

          <div>
            <label style={labelStyle}>Área *</label>
            <select style={inputStyle} value={areaId} onChange={(e) => setAreaId(e.target.value)} required>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value="__new__">+ Criar nova área</option>
            </select>
            {isCreatingArea && (
              <input
                style={{ ...inputStyle, marginTop: 6 }}
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                placeholder="Nome da nova área..."
                autoFocus
              />
            )}
          </div>

          <div>
            <label style={labelStyle}>Responsável *</label>
            <select style={inputStyle} value={assigneeId} onChange={handleAssigneeChange} required>
              <option value="">Selecionar...</option>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Prazo *</label>
              <input type="date" style={inputStyle} value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Prioridade</label>
              <select style={inputStyle} value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Descrição</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes opcionais..."
            />
          </div>

          {error && <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} style={{ padding: '8px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
              {saving ? 'Salvando...' : (editingTask ? 'Salvar' : 'Criar tarefa')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
