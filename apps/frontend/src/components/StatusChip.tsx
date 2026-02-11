import { statusLabel } from '../utils/labels';

export function StatusChip({ value }: { value: string | null | undefined }) {
  const raw = value ?? 'N/A';
  const text = statusLabel(raw);
  const key = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
  return <span className={`chip chip-${key}`}>{text}</span>;
}
