import type { ReactNode } from 'react';

export function KpiCard({ title, value, helper }: { title: string; value: ReactNode; helper?: string }) {
  return (
    <article className="kpi-card">
      <h3>{title}</h3>
      <strong>{value}</strong>
      {helper ? <p>{helper}</p> : null}
    </article>
  );
}
