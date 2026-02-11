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
        <h1>Orquestrador de Jornadas</h1>
        <p>Faça login para acessar a plataforma.</p>

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
      </div>
    </div>
  );
}
