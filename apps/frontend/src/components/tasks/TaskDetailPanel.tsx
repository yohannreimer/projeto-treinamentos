import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import type { TaskSummary, TaskDetail } from '../../services/api';
import { TaskChecklist } from './TaskChecklist';
import { TaskComments } from './TaskComments';
import { StatusSelect } from './StatusSelect';

type Props = {
  task: TaskSummary;
  onClose: () => void;
  onEdit: (task: TaskSummary) => void;
  onUpdated: () => void;
};

const PRIORITY_LABELS: Record<TaskSummary['priority'], string> = {
  Critica: 'Crítica',
  Alta: 'Alta',
  Normal: 'Normal',
  Baixa: 'Baixa'
};

function isOverdue(task: TaskSummary): boolean {
  return task.status !== 'Concluida' && task.due_date < new Date().toISOString().slice(0, 10);
}

export function TaskDetailPanel({ task, onClose, onEdit, onUpdated }: Props) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [concluding, setConcluding] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDetail(null);
    void api.task(task.id).then(setDetail);
  }, [task.id]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function handleConclude() {
    if (concluding) return;
    setConcluding(true);
    try {
      await api.updateTask(task.id, { status: 'Concluida' });
      onUpdated();
    } finally {
      setConcluding(false);
    }
  }

  async function handleStatusChange(status: TaskSummary['status']) {
    await api.updateTask(task.id, { status });
    onUpdated();
  }

  const overdue = isOverdue(task);

  return (
    <div
      ref={panelRef}
      style={{
        width: 300,
        flexShrink: 0,
        borderLeft: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--surface)'
      }}
    >
      {/* Panel header */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: '1.1rem', padding: '2px 6px' }}
          title="Fechar"
        >
          ✕
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Title + badges */}
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 8, lineHeight: 1.3 }}>{task.title}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {task.priority !== 'Normal' && (
              <span style={{ background: '#ef444422', color: '#ef4444', borderRadius: 4, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                {PRIORITY_LABELS[task.priority]}
              </span>
            )}
            <span style={{ background: 'var(--surface-muted)', borderRadius: 4, padding: '2px 8px', fontSize: '0.72rem', color: 'var(--ink-soft)' }}>
              {task.area_name}
            </span>
            <StatusSelect status={task.status} onChange={(status) => void handleStatusChange(status)} />
          </div>
        </div>

        {/* Metadata */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.8rem' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Responsável</div>
            <div style={{ fontWeight: 600 }}>{task.assignee_name}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Prazo</div>
            <div style={{ fontWeight: 600, color: overdue ? '#ef4444' : 'inherit' }}>
              {task.due_date.split('-').reverse().join('/')}
              {overdue && <span style={{ marginLeft: 4, fontSize: '0.85em' }}>· Atrasado</span>}
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Descrição</div>
          {task.description ? (
            <div style={{ fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--ink-soft)', background: 'var(--surface-muted)', borderRadius: 5, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>
              {task.description}
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', fontStyle: 'italic' }}>Sem descrição</div>
          )}
        </div>

        {/* Checklist */}
        {detail && (
          <TaskChecklist
            taskId={task.id}
            items={detail.checklist}
            onChanged={() => void api.task(task.id).then(setDetail)}
          />
        )}

        {/* Comments */}
        {detail && (
          <TaskComments
            taskId={task.id}
            comments={detail.comments}
            onAdded={() => void api.task(task.id).then(setDetail)}
          />
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8 }}>
        <button
          onClick={() => onEdit(task)}
          style={{ flex: 1, padding: '7px', background: 'var(--surface-muted)', border: '1px solid var(--line)', borderRadius: 5, cursor: 'pointer', color: 'var(--ink)', fontWeight: 500, fontSize: '0.82rem' }}
        >
          Editar
        </button>
        {task.status !== 'Concluida' && (
          <button
            onClick={handleConclude}
            disabled={concluding}
            style={{ flex: 1, padding: '7px', background: '#10b98122', border: '1px solid #10b981', borderRadius: 5, cursor: 'pointer', color: '#10b981', fontWeight: 600, fontSize: '0.82rem' }}
          >
            {concluding ? '...' : 'Concluir'}
          </button>
        )}
      </div>
    </div>
  );
}
