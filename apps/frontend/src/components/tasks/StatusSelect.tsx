import type { TaskSummary } from '../../services/api';

export const STATUS_LABELS: Record<TaskSummary['status'], string> = {
  A_fazer: 'A fazer',
  Em_andamento: 'Em andamento',
  Concluida: 'Concluída'
};

export const STATUS_COLORS: Record<TaskSummary['status'], string> = {
  A_fazer: '#3b82f6',
  Em_andamento: '#f59e0b',
  Concluida: '#10b981'
};

export const STATUS_ORDER: Record<TaskSummary['status'], number> = {
  A_fazer: 0,
  Em_andamento: 1,
  Concluida: 2
};

type Props = {
  status: TaskSummary['status'];
  onChange: (status: TaskSummary['status']) => void;
  onClick?: (e: React.MouseEvent) => void;
  size?: 'sm' | 'md';
};

export function StatusSelect({ status, onChange, onClick, size = 'md' }: Props) {
  const color = STATUS_COLORS[status];
  const fontSize = size === 'sm' ? '0.78em' : '0.72rem';
  const padding = size === 'sm' ? '3px 22px 3px 10px' : '2px 20px 2px 8px';

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <select
        value={status}
        onClick={onClick}
        onChange={(e) => onChange(e.target.value as TaskSummary['status'])}
        className="status-select-native"
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          border: `1px solid ${color}55`,
          backgroundColor: `${color}18`,
          color,
          borderRadius: 10,
          padding,
          fontSize,
          fontWeight: 600,
          textAlign: 'left',
          cursor: 'pointer'
        }}
      >
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <span style={{
        position: 'absolute',
        right: 8,
        top: '50%',
        transform: 'translateY(-50%)',
        pointerEvents: 'none',
        fontSize: '0.65em',
        color
      }}>
        ▾
      </span>
    </span>
  );
}
