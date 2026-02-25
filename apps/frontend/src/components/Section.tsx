import type { PropsWithChildren, ReactNode } from 'react';

export function Section({
  title,
  action,
  children,
  className
}: PropsWithChildren<{ title: string; action?: ReactNode; className?: string }>) {
  return (
    <section className={`panel ${className ?? ''}`.trim()}>
      <header className="panel-header">
        <h2>{title}</h2>
        {action}
      </header>
      <div className="panel-content">{children}</div>
    </section>
  );
}
