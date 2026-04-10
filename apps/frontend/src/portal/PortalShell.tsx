import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useParams } from 'react-router-dom';
import { portalApi } from './api';
import { portalSessionStore } from './auth';
import type { PortalMe, PortalSessionData } from './types';
import { PortalAgendaPage } from './pages/PortalAgendaPage';
import { PortalLoginPage } from './pages/PortalLoginPage';
import { PortalOverviewPage } from './pages/PortalOverviewPage';
import { PortalPlanningPage } from './pages/PortalPlanningPage';
import { PortalTicketsPage } from './pages/PortalTicketsPage';
import holandHorizontalLogo from '../assets/holand-horizontal.svg';

export function PortalShell() {
  const { slug = '' } = useParams();
  const [session, setSession] = useState<PortalSessionData | null>(() => portalSessionStore.read(slug));
  const [profile, setProfile] = useState<PortalMe | null>(null);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    setSession(portalSessionStore.read(slug));
    setProfile(null);
    setAuthError('');
  }, [slug]);

  const clearSession = useCallback(() => {
    portalSessionStore.clear(slug);
    setSession(null);
    setProfile(null);
  }, [slug]);

  const apiClient = useMemo(() => {
    if (!session?.token) return null;
    return portalApi.createAuthedClient(session.token, clearSession);
  }, [session?.token, clearSession]);

  useEffect(() => {
    if (!apiClient) return;
    let mounted = true;
    apiClient.me()
      .then((response) => {
        if (!mounted) return;
        setProfile(response);
      })
      .catch((error) => {
        if (!mounted) return;
        setAuthError(error instanceof Error ? error.message : 'Falha ao validar sessão.');
      });
    return () => {
      mounted = false;
    };
  }, [apiClient]);

  async function handleLogin(payload: { username: string; password: string }) {
    const result = await portalApi.login({
      slug,
      username: payload.username,
      password: payload.password
    });
    const nextSession = { token: result.token, expires_at: result.expires_at };
    portalSessionStore.save(slug, nextSession);
    setSession(nextSession);
    setAuthError('');
    return true;
  }

  if (!slug) {
    return <p className="error">Slug do portal não informado.</p>;
  }

  if (!session || !apiClient) {
    return <PortalLoginPage slug={slug} onSubmit={handleLogin} />;
  }

  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <div className="portal-sidebar-head">
          <div className="portal-brand">
            <img src={holandHorizontalLogo} alt="Holand" className="portal-brand-image" />
            <small>Portal do Cliente</small>
          </div>
          <p className="portal-sidebar-caption">
            Central de operação do seu time com visão clara de planejamento, agenda e suporte.
          </p>
        </div>
        <nav className="portal-nav">
          <NavLink end to="" className={({ isActive }) => isActive ? 'is-active' : ''}>Visão Geral</NavLink>
          <NavLink to="planejamento" className={({ isActive }) => isActive ? 'is-active' : ''}>Planejamento</NavLink>
          <NavLink to="agenda" className={({ isActive }) => isActive ? 'is-active' : ''}>Agenda</NavLink>
          <NavLink to="chamados" className={({ isActive }) => isActive ? 'is-active' : ''}>Chamados</NavLink>
        </nav>
        <div className="portal-sidebar-footer">
          <small>{profile?.username ? `Acesso: ${profile.username}` : 'Sessão ativa'}</small>
          <button type="button" className="portal-logout-btn" onClick={clearSession}>Sair</button>
        </div>
      </aside>
      <main className="portal-main">
        <header className="portal-topbar">
          <div className="portal-topbar-copy">
            <span className="portal-topbar-kicker">Operação do cliente</span>
            <strong>{profile?.company_name ?? 'Cliente'}</strong>
          </div>
          <div className="portal-topbar-meta">
            <span className="portal-live-dot">Sessão segura ativa</span>
          </div>
        </header>
        {authError ? <p className="error">{authError}</p> : null}
        <Routes>
          <Route index element={<PortalOverviewPage api={apiClient} />} />
          <Route path="planejamento" element={<PortalPlanningPage api={apiClient} />} />
          <Route path="agenda" element={<PortalAgendaPage api={apiClient} />} />
          <Route path="chamados" element={<PortalTicketsPage api={apiClient} />} />
          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      </main>
    </div>
  );
}
