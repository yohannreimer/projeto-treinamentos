import { Outlet } from 'react-router-dom';
import { FinanceSidebar } from './components/FinanceSidebar';
import { useFinanceContext } from './hooks/useFinanceContext';

export function FinanceWorkspace() {
  const { context, loading, error } = useFinanceContext();

  return (
    <div className="finance-shell">
      <FinanceSidebar context={context} loading={loading} error={error} />
      <main className="finance-workspace__main">
        <Outlet />
      </main>
    </div>
  );
}
