import { useState, type FormEvent } from 'react';

type LoginPageProps = {
  onLogin: (username: string, password: string) => boolean;
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = onLogin(username.trim(), password);
    if (!ok) {
      setError('Usuário ou senha inválidos.');
      return;
    }
    setError('');
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand-row">
          <span className="brand-mark" aria-hidden="true" />
          <strong>HOLAND</strong>
        </div>
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

          <button type="submit">Entrar</button>
        </form>
        <small className="login-footnote">Ambiente interno premium para gestão de treinamentos.</small>
      </div>
    </div>
  );
}
