import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { CalendarPage } from './pages/CalendarPage';
import { CohortsPage } from './pages/CohortsPage';
import { CohortDetailPage } from './pages/CohortDetailPage';
import { ClientsPage } from './pages/ClientsPage';
import { ClientDetailPage } from './pages/ClientDetailPage';
import { TechniciansPage } from './pages/TechniciansPage';
import { LicensesPage } from './pages/LicensesPage';
import { LicenseProgramsPage } from './pages/LicenseProgramsPage';
import { LoginPage } from './pages/LoginPage';
import { AdminPage } from './pages/AdminPage';

const AUTH_STORAGE_KEY = 'orquestrador_auth_v1';
const AUTH_USER = 'holand';
const AUTH_PASSWORD = 'Holand2026!@#';

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => (
    window.localStorage.getItem(AUTH_STORAGE_KEY) === '1'
  ));

  function handleLogin(username: string, password: string): boolean {
    const isValid = username === AUTH_USER && password === AUTH_PASSWORD;
    if (isValid) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, '1');
      setIsAuthenticated(true);
    }
    return isValid;
  }

  function handleLogout() {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    setIsAuthenticated(false);
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <Layout onLogout={handleLogout} loggedUser={AUTH_USER}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/calendario" element={<CalendarPage />} />
        <Route path="/turmas" element={<CohortsPage />} />
        <Route path="/turmas/:id" element={<CohortDetailPage />} />
        <Route path="/clientes" element={<ClientsPage />} />
        <Route path="/clientes/:id" element={<ClientDetailPage />} />
        <Route path="/tecnicos" element={<TechniciansPage />} />
        <Route path="/licencas" element={<LicensesPage />} />
        <Route path="/licencas/programas" element={<LicenseProgramsPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
