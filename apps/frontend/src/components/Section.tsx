import type { PropsWithChildren, ReactNode } from 'react';

export function Section({ title, action, children }: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>{title}</h2>
        {action}
      </header>
      <div className="panel-content">{children}</div>
    </section>
  );
}
