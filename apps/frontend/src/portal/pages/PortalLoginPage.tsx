import { useState, type FormEvent } from 'react';
import holandHorizontalLogo from '../../assets/holand-horizontal.svg';

type PortalLoginPageProps = {
  slug: string;
  onSubmit: (payload: { username: string; password: string; is_internal: boolean }) => Promise<boolean> | boolean;
};

export function PortalLoginPage({ slug, onSubmit }: PortalLoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isInternalLogin, setIsInternalLogin] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const ok = await onSubmit({ username: username.trim(), password, is_internal: isInternalLogin });
      if (!ok) {
        setError('Login ou senha inválidos.');
        return;
      }
      setError('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível entrar no portal.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="portal-login-screen">
      <div className="portal-login-card">
        <div className="portal-login-brand">
          <img src={holandHorizontalLogo} alt="Holand" className="portal-login-logo" />
          <p className="portal-login-kicker">Portal do Cliente Holand</p>
        </div>
        <h1>Acesso da operação</h1>
        <p className="portal-login-subtitle">Ambiente exclusivo do cliente: <strong>{slug}</strong></p>

        <form className="portal-login-form" onSubmit={submit}>
          <label>
            Login
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Seu usuário"
              autoComplete="username"
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Sua senha"
              autoComplete="current-password"
            />
          </label>

          <label className="portal-login-checkbox">
            <input
              type="checkbox"
              checked={isInternalLogin}
              onChange={(event) => setIsInternalLogin(event.target.checked)}
            />
            Acesso interno Holand (operador)
          </label>

          {error ? <p className="error">{error}</p> : null}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
