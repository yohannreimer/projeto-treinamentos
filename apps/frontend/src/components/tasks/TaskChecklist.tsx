import { useState } from 'react';
import { api } from '../../services/api';
import type { TaskChecklistItem } from '../../services/api';

type Props = {
  taskId: string;
  items: TaskChecklistItem[];
  onChanged: () => void;
};

export function TaskChecklist({ taskId, items, onChanged }: Props) {
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);

  const done = items.filter((i) => i.completed).length;

  async function handleToggle(item: TaskChecklistItem) {
    if (toggling === item.id) return;
    setToggling(item.id);
    try {
      await api.updateTaskChecklistItem(taskId, item.id, { completed: item.completed !== 1 });
      onChanged();
    } finally {
      setToggling(null);
    }
  }

  async function handleAdd() {
    if (!newLabel.trim() || adding) return;
    setAdding(true);
    try {
      await api.addTaskChecklistItem(taskId, newLabel.trim());
      setNewLabel('');
      setShowInput(false);
      onChanged();
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(itemId: string) {
    await api.deleteTaskChecklistItem(taskId, itemId);
    onChanged();
  }

  return (
    <div>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', justifyContent: 'space-between' }}>
        <span>Checklist</span>
        {items.length > 0 && <span style={{ fontWeight: 400 }}>{done}/{items.length}</span>}
      </div>

      {items.length === 0 && !showInput && (
        <div style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', fontStyle: 'italic', marginBottom: 6 }}>Sem itens</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map((item) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
            <input
              type="checkbox"
              checked={item.completed === 1}
              onChange={() => handleToggle(item)}
              disabled={toggling === item.id}
              style={{ accentColor: 'var(--brand)', width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }}
            />
            <span style={{ flex: 1, textDecoration: item.completed === 1 ? 'line-through' : 'none', color: item.completed === 1 ? 'var(--ink-soft)' : 'inherit' }}>
              {item.label}
            </span>
            <button
              onClick={() => handleDelete(item.id)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: '0.8em', padding: '0 2px', opacity: 0.6 }}
              title="Remover item"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {showInput ? (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            autoFocus
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); if (e.key === 'Escape') { setShowInput(false); setNewLabel(''); } }}
            placeholder="Novo item..."
            style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--surface-muted)', color: 'var(--ink)', fontSize: '0.8rem' }}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newLabel.trim()}
            style={{ padding: '4px 10px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}
          >
            {adding ? '...' : 'Ok'}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          style={{ marginTop: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--brand)', fontSize: '0.78rem', padding: 0 }}
        >
          + Adicionar item
        </button>
      )}
    </div>
  );
}
