import { Outlet } from 'react-router-dom';
import { hasAnyPermission, internalSessionStore } from '../auth/session';
import { FinanceFloatingQuickLauncher } from './components/FinanceFloatingQuickLauncher';
import { FinanceWhisperFlow } from './components/FinanceWhisperFlow';
import { FinanceSidebar } from './components/FinanceSidebar';
import { useFinanceContext } from './hooks/useFinanceContext';
import './finance.css';

export function FinanceWorkspace() {
  const { context, loading, error } = useFinanceContext();
  const session = internalSessionStore.read();
  const canWrite = hasAnyPermission(session?.user, ['finance.write']);

  return (
    <div className="finance-shell">
      <FinanceSidebar context={context} loading={loading} error={error} />
      <main className="finance-workspace__main">
        <Outlet />
      </main>
      {canWrite ? <FinanceWhisperFlow /> : null}
      {canWrite ? <FinanceFloatingQuickLauncher /> : null}
    </div>
  );
}
