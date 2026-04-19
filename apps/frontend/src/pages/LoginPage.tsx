import { useState, type FormEvent } from 'react';
import holandHorizontal from '../assets/holand-horizontal.svg';

type LoginPageProps = {
  onLogin: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const result = await onLogin(username.trim(), password);
    if (!result.ok) {
      setError(result.message || 'Usuário ou senha inválidos.');
      setLoading(false);
      return;
    }
    setError('');
    setLoading(false);
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <img className="login-brand-logo" src={holandHorizontal} alt="Holand" />
        <h1>Orquestrador de Jornadas</h1>
        <p>Transformando complexidade em eficiência operacional.</p>
        <div className="login-direction-accent" aria-hidden="true" />

        <form className="login-form" onSubmit={submit}>
          <label>
            Login
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="Digite o login"
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Digite a senha"
            />
          </label>

          {error ? <p className="error">{error}</p> : null}

          <button type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <small className="login-footnote">Ambiente interno premium para gestão de treinamentos.</small>
      </div>
    </div>
  );
}
