import { useState, type FormEvent } from 'react';
import type { CreateFinanceEntityPayload, FinanceEntityKind } from '../api';

type FinanceEntityFormProps = {
  onSubmit: (payload: CreateFinanceEntityPayload) => Promise<void>;
};

const entityKindOptions: Array<{ value: FinanceEntityKind; label: string }> = [
  { value: 'customer', label: 'Cliente' },
  { value: 'supplier', label: 'Fornecedor' },
  { value: 'both', label: 'Ambos' }
];

export function FinanceEntityForm({ onSubmit }: FinanceEntityFormProps) {
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [kind, setKind] = useState<FinanceEntityKind>('both');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    const payload: CreateFinanceEntityPayload = {
      legal_name: legalName.trim(),
      trade_name: tradeName.trim() || null,
      document_number: documentNumber.trim() || null,
      kind,
      email: email.trim() || null,
      phone: phone.trim() || null,
      is_active: isActive
    };

    try {
      await onSubmit(payload);
      setLegalName('');
      setTradeName('');
      setDocumentNumber('');
      setEmail('');
      setPhone('');
      setKind('both');
      setIsActive(true);
      setMessage('Entidade cadastrada na base única.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Falha ao cadastrar entidade.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="finance-entity-form" aria-label="Cadastro de entidade financeira">
      <header className="panel-header">
        <div>
          <small className="finance-panel-eyebrow">Base única</small>
          <h2>Nova entidade financeira</h2>
        </div>
      </header>

      <div className="panel-content">
        <label>
          Razão social
          <input
            value={legalName}
            onChange={(event) => setLegalName(event.target.value)}
            type="text"
            autoComplete="organization"
            placeholder="Ex.: ACME Serviços Ltda"
            required
          />
        </label>

        <label>
          Nome fantasia
          <input
            value={tradeName}
            onChange={(event) => setTradeName(event.target.value)}
            type="text"
            autoComplete="organization"
            placeholder="Ex.: ACME"
          />
        </label>

        <label>
          Documento
          <input
            value={documentNumber}
            onChange={(event) => setDocumentNumber(event.target.value)}
            type="text"
            autoComplete="off"
            placeholder="CNPJ ou documento interno"
          />
        </label>

        <label>
          Tipo
          <select value={kind} onChange={(event) => setKind(event.target.value as FinanceEntityKind)}>
            {entityKindOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          E-mail
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            placeholder="contato@empresa.com"
          />
        </label>

        <label>
          Telefone
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            autoComplete="tel"
            placeholder="(47) 99999-9999"
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <input
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            type="checkbox"
          />
          Entidade ativa
        </label>

        <button type="submit" disabled={isSubmitting || legalName.trim().length === 0}>
          {isSubmitting ? 'Salvando...' : 'Cadastrar entidade'}
        </button>

        {message ? <p role="status">{message}</p> : null}
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </form>
  );
}
