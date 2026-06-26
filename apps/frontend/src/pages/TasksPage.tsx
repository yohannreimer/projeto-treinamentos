import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import type { TaskArea, TaskSummary } from '../services/api';
import { TaskDetailPanel } from '../components/tasks/TaskDetailPanel';
import { TaskFormModal } from '../components/tasks/TaskFormModal';

type TaskTab = 'todas' | 'minhas' | 'atrasadas' | 'por-area';

function isOverdue(task: TaskSummary): boolean {
  return task.status !== 'Concluida' && task.due_date < new Date().toISOString().slice(0, 10);
}

function priorityBadge(priority: TaskSummary['priority']): string | null {
  if (priority === 'Critica') return 'Crítica';
  if (priority === 'Alta') return 'Alta';
  return null;
}

const STATUS_LABELS: Record<TaskSummary['status'], string> = {
  A_fazer: 'A fazer',
  Em_andamento: 'Em andamento',
  Concluida: 'Concluída'
};

const STATUS_COLORS: Record<TaskSummary['status'], string> = {
  A_fazer: '#3b82f6',
  Em_andamento: '#f59e0b',
  Concluida: '#10b981'
};

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [areas, setAreas] = useState<TaskArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskSummary | null>(null);
  const [activeTab, setActiveTab] = useState<TaskTab>('todas');
  const [filterArea, setFilterArea] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [tasksData, areasData] = await Promise.all([api.tasks(), api.taskAreas()]);
      setTasks(tasksData);
      setAreas(areasData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const currentUserId = useMemo(() => {
    try {
      const raw = sessionStorage.getItem('orquestrador_internal_auth_v2');
      if (!raw) return null;
      return (JSON.parse(raw) as { user?: { id?: string } }).user?.id ?? null;
    } catch {
      return null;
    }
  }, []);

  const overdueCount = useMemo(() => tasks.filter(isOverdue).length, [tasks]);

  const visibleTasks = useMemo(() => {
    let list = tasks;

    if (activeTab === 'minhas' && currentUserId) {
      list = list.filter((t) => t.assignee_id === currentUserId);
    } else if (activeTab === 'atrasadas') {
      list = list.filter(isOverdue);
    }

    if (filterArea) list = list.filter((t) => t.area_id === filterArea);
    if (filterPriority) list = list.filter((t) => t.priority === filterPriority);
    if (searchQuery) list = list.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()));

    return list;
  }, [tasks, activeTab, currentUserId, filterArea, filterPriority, searchQuery]);

  const tasksByArea = useMemo(() => {
    if (activeTab !== 'por-area') return null;
    const map = new Map<string, { area: TaskArea; tasks: TaskSummary[] }>();
    visibleTasks.forEach((task) => {
      if (!map.has(task.area_id)) {
        const area = areas.find((a) => a.id === task.area_id);
        if (area) map.set(task.area_id, { area, tasks: [] });
      }
      map.get(task.area_id)?.tasks.push(task);
    });
    return Array.from(map.values());
  }, [activeTab, visibleTasks, areas]);

  const selectedTask = useMemo(() => tasks.find((t) => t.id === selectedId) ?? null, [tasks, selectedId]);

  function handleRowClick(task: TaskSummary) {
    setSelectedId((prev) => (prev === task.id ? null : task.id));
  }

  function handleOpenCreate() {
    setEditingTask(null);
    setShowModal(true);
  }

  function handleOpenEdit(task: TaskSummary) {
    setEditingTask(task);
    setShowModal(true);
  }

  async function handleModalSave() {
    setShowModal(false);
    setEditingTask(null);
    setLoading(true);
    await loadData();
  }

  async function handleTaskUpdated() {
    await loadData();
  }

  const TABS: Array<{ id: TaskTab; label: string; badge?: number }> = [
    { id: 'todas', label: 'Todas' },
    { id: 'minhas', label: 'Minhas' },
    { id: 'atrasadas', label: 'Atrasadas', badge: overdueCount > 0 ? overdueCount : undefined },
    { id: 'por-area', label: 'Por área' }
  ];

  if (loading) {
    return <div style={{ padding: 32, color: 'var(--text-secondary)' }}>Carregando tarefas...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Tarefas</h1>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Gestão interna da equipe</p>
        </div>
        <button
          onClick={handleOpenCreate}
          style={{ padding: '7px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
        >
          + Nova tarefa
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px', flexShrink: 0 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab.id === 'atrasadas' && overdueCount > 0 ? '#ef4444' : (activeTab === tab.id ? 'var(--accent)' : 'var(--text-secondary)'),
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? 700 : 400,
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span style={{ background: '#ef444422', color: '#ef4444', borderRadius: 10, padding: '1px 7px', fontSize: '0.75em', fontWeight: 700 }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
        <select
          value={filterArea}
          onChange={(e) => setFilterArea(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
        >
          <option value="">Área: Todas</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
        >
          <option value="">Prioridade: Todas</option>
          <option value="Critica">Crítica</option>
          <option value="Alta">Alta</option>
          <option value="Normal">Normal</option>
          <option value="Baixa">Baixa</option>
        </select>

        <input
          type="text"
          placeholder="Buscar tarefa..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem', flex: 1, minWidth: 160 }}
        />
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Task List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 100px 120px', gap: 8, padding: '8px 20px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
            <span>Tarefa</span>
            <span>Área</span>
            <span>Responsável</span>
            <span>Prazo</span>
            <span>Status</span>
          </div>

          {activeTab === 'por-area' && tasksByArea ? (
            tasksByArea.map(({ area, tasks: areaTasks }) => (
              <div key={area.id}>
                <div style={{ padding: '8px 20px', fontSize: '0.75rem', fontWeight: 700, color: area.color, borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                  {area.name} <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({areaTasks.length})</span>
                </div>
                {areaTasks.map((task) => (
                  <TaskRow key={task.id} task={task} selected={selectedId === task.id} onClick={() => handleRowClick(task)} />
                ))}
              </div>
            ))
          ) : (
            visibleTasks.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Nenhuma tarefa encontrada.
              </div>
            ) : (
              visibleTasks.map((task) => (
                <TaskRow key={task.id} task={task} selected={selectedId === task.id} onClick={() => handleRowClick(task)} />
              ))
            )
          )}
        </div>

        {/* Detail Panel */}
        {selectedTask && (
          <TaskDetailPanel
            task={selectedTask}
            onClose={() => setSelectedId(null)}
            onEdit={handleOpenEdit}
            onUpdated={handleTaskUpdated}
          />
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <TaskFormModal
          areas={areas}
          editingTask={editingTask}
          onSave={handleModalSave}
          onClose={() => { setShowModal(false); setEditingTask(null); }}
        />
      )}
    </div>
  );
}

type TaskRowProps = {
  task: TaskSummary;
  selected: boolean;
  onClick: () => void;
};

function TaskRow({ task, selected, onClick }: TaskRowProps) {
  const overdue = isOverdue(task);
  const badge = priorityBadge(task.priority);

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 90px 110px 100px 120px',
        gap: 8,
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        background: selected ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
        alignItems: 'center',
        fontSize: '0.82rem'
      }}
    >
      <div>
        <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {badge && (
            <span style={{ background: '#ef444422', color: '#ef4444', borderRadius: 3, padding: '1px 6px', fontSize: '0.72em', fontWeight: 700 }}>
              {badge}
            </span>
          )}
          {task.title}
        </div>
        {task.checklist_total > 0 && (
          <div style={{ fontSize: '0.75em', color: 'var(--text-secondary)', marginTop: 2 }}>
            {task.checklist_done}/{task.checklist_total} itens
          </div>
        )}
      </div>
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.8em' }}>{task.area_name}</span>
      <span>{task.assignee_name}</span>
      <span style={{ color: overdue ? '#ef4444' : 'inherit', fontWeight: overdue ? 600 : 400 }}>
        {task.due_date.split('-').reverse().join('/')}
        {overdue && ' ⚠'}
      </span>
      <span style={{
        display: 'inline-block',
        background: `${STATUS_COLORS[task.status]}22`,
        color: STATUS_COLORS[task.status],
        borderRadius: 10,
        padding: '3px 10px',
        fontSize: '0.78em',
        fontWeight: 500,
        textAlign: 'center'
      }}>
        {STATUS_LABELS[task.status]}
      </span>
    </div>
  );
}
