import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PortalShell } from './portal/PortalShell';
import { DashboardPage } from './pages/DashboardPage';
import { CalendarPage } from './pages/CalendarPage';
import { CohortsPage } from './pages/CohortsPage';
import { CohortDetailPage } from './pages/CohortDetailPage';
import { ClientsPage } from './pages/ClientsPage';
import { ClientDetailPage } from './pages/ClientDetailPage';
import { TechniciansPage } from './pages/TechniciansPage';
import { ImplementationPage } from './pages/ImplementationPage';
import { LicensesPage } from './pages/LicensesPage';
import { LicenseProgramsPage } from './pages/LicenseProgramsPage';
import { RecruitmentPage } from './pages/RecruitmentPage';
import { LoginPage } from './pages/LoginPage';
import { AdminPage } from './pages/AdminPage';
import { InternalDocsPage } from './pages/InternalDocsPage';
import { FinanceWorkspace } from './finance/FinanceWorkspace';
import { api } from './services/api';
import {
  INTERNAL_AUTH_CHANGED_EVENT,
  hasAnyPermission,
  internalSessionStore,
  type InternalPermission,
  type InternalSessionData,
  type InternalSessionUser
} from './auth/session';
import { defaultRouteForUser, visibleNavItemsForUser } from './auth/navigation';
const INTERNAL_TAB_INITIALIZED_KEY = 'orquestrador_internal_tab_initialized_v1';

function ProtectedRoute({
  user,
  permissions,
  fallback,
  children
}: {
  user: InternalSessionUser;
  permissions: InternalPermission[];
  fallback: string;
  children: ReactNode;
}) {
  if (!hasAnyPermission(user, permissions)) {
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}

function InternalApp() {
  const [session, setSession] = useState<InternalSessionData | null>(() => internalSessionStore.read());
  const [loadingSession, setLoadingSession] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const sync = () => setSession(internalSessionStore.read());
    window.addEventListener(INTERNAL_AUTH_CHANGED_EVENT, sync);
    return () => window.removeEventListener(INTERNAL_AUTH_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const current = internalSessionStore.read();
    if (!current) {
      setLoadingSession(false);
      return;
    }

    api.internalMe()
      .then((response) => {
        if (cancelled) return;
        const mergedSession: InternalSessionData = {
          token: current.token,
          expires_at: current.expires_at,
          user: response.user
        };
        internalSessionStore.save(mergedSession);
        setSession(mergedSession);
      })
      .catch(() => {
        if (cancelled) return;
        internalSessionStore.clear();
        setSession(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(username: string, password: string): Promise<{ ok: boolean; message?: string }> {
    try {
      const response = await api.internalLogin({ username, password });
      internalSessionStore.save(response);
      setSession(response);
      window.sessionStorage.setItem(INTERNAL_TAB_INITIALIZED_KEY, '1');
      navigate('/calendario', { replace: true });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  function handleLogout() {
    api.internalLogout().catch(() => null).finally(() => {
      internalSessionStore.clear();
      window.sessionStorage.removeItem(INTERNAL_TAB_INITIALIZED_KEY);
      setSession(null);
    });
  }

  const user = session?.user ?? null;
  const navItems = useMemo(() => visibleNavItemsForUser(user), [user]);
  const defaultRoute = defaultRouteForUser(user);

  useEffect(() => {
    if (!session || !user) return;
    const tabInitialized = window.sessionStorage.getItem(INTERNAL_TAB_INITIALIZED_KEY) === '1';
    if (tabInitialized) return;
    window.sessionStorage.setItem(INTERNAL_TAB_INITIALIZED_KEY, '1');
    if (location.pathname !== '/calendario') {
      navigate('/calendario', { replace: true });
    }
  }, [session, user, location.pathname, navigate]);

  if (loadingSession) {
    return <p style={{ padding: '24px' }}>Carregando sessão...</p>;
  }

  if (!session || !user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <Layout
      onLogout={handleLogout}
      loggedUser={user.display_name || user.username}
      navItems={navItems}
    >
      <Routes>
        <Route path="/" element={<Navigate to={defaultRoute} replace />} />
        <Route
          path="/dashboard"
          element={(
            <ProtectedRoute user={user} permissions={['dashboard']} fallback={defaultRoute}>
              <DashboardPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/calendario"
          element={(
            <ProtectedRoute user={user} permissions={['calendar']} fallback={defaultRoute}>
              <CalendarPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/turmas"
          element={(
            <ProtectedRoute user={user} permissions={['cohorts']} fallback={defaultRoute}>
              <CohortsPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/turmas/:id"
          element={(
            <ProtectedRoute user={user} permissions={['cohorts']} fallback={defaultRoute}>
              <CohortDetailPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/clientes"
          element={(
            <ProtectedRoute user={user} permissions={['clients']} fallback={defaultRoute}>
              <ClientsPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/clientes/:id"
          element={(
            <ProtectedRoute user={user} permissions={['clients']} fallback={defaultRoute}>
              <ClientDetailPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/tecnicos"
          element={(
            <ProtectedRoute user={user} permissions={['technicians']} fallback={defaultRoute}>
              <TechniciansPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/implementacao"
          element={(
            <ProtectedRoute user={user} permissions={['implementation']} fallback={defaultRoute}>
              <ImplementationPage boardMode="implementation" />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/suporte"
          element={(
            <ProtectedRoute user={user} permissions={['support', 'implementation']} fallback={defaultRoute}>
              <ImplementationPage boardMode="support" />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/processos-seletivos"
          element={(
            <ProtectedRoute user={user} permissions={['recruitment']} fallback={defaultRoute}>
              <RecruitmentPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/licencas"
          element={(
            <ProtectedRoute user={user} permissions={['licenses']} fallback={defaultRoute}>
              <LicensesPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/licencas/programas"
          element={(
            <ProtectedRoute user={user} permissions={['license_programs']} fallback={defaultRoute}>
              <LicenseProgramsPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/financeiro/*"
          element={(
            <ProtectedRoute user={user} permissions={['finance.read']} fallback={defaultRoute}>
              <FinanceWorkspace />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/documentacao"
          element={(
            <ProtectedRoute user={user} permissions={['docs']} fallback={defaultRoute}>
              <InternalDocsPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/admin"
          element={(
            <ProtectedRoute user={user} permissions={['admin']} fallback={defaultRoute}>
              <AdminPage />
            </ProtectedRoute>
          )}
        />
        <Route path="*" element={<Navigate to={defaultRoute} replace />} />
      </Routes>
    </Layout>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/portal/:slug/*" element={<PortalShell />} />
      <Route path="*" element={<InternalApp />} />
    </Routes>
  );
}
