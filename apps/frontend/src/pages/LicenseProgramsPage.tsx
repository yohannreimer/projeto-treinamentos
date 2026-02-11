import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { Section } from '../components/Section';
import type { LicenseProgram } from '../types';

export function LicenseProgramsPage() {
  const [rows, setRows] = useState<LicenseProgram[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  async function load() {
    const response = await api.licensePrograms();
    const list = response as LicenseProgram[];
    setRows(list.map((item) => ({ ...item, usage_count: Number(item.usage_count ?? 0) })));
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const normalized = query.toLowerCase();
    return rows.filter((row) => `${row.name} ${row.notes ?? ''}`.toLowerCase().includes(normalized));
  }, [rows, query]);

  function resetForm() {
    setEditingId(null);
    setName('');
    setNotes('');
  }

  function editProgram(row: LicenseProgram) {
    setEditingId(row.id);
    setName(row.name);
    setNotes(row.notes ?? '');
  }

  async function submitProgram() {
    if (!name.trim()) {
      setError('Informe o nome do programa.');
      return;
    }

    setError('');
    setMessage('');

    try {
      if (editingId) {
        await api.updateLicenseProgram(editingId, {
          name: name.trim(),
          notes: notes.trim() || null
        });
        setMessage('Programa atualizado com sucesso.');
      } else {
        await api.createLicenseProgram({
          name: name.trim(),
          notes: notes.trim() || null
        });
        setMessage('Programa cadastrado com sucesso.');
      }
      resetForm();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteProgram(row: LicenseProgram) {
    const ok = window.confirm(`Excluir programa "${row.name}"?`);
    if (!ok) return;

    setError('');
    setMessage('');

    try {
      await api.deleteLicenseProgram(row.id);
      setMessage('Programa excluído.');
      if (editingId === row.id) {
        resetForm();
      }
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Programas de Licença</h1>
        <p>Catálogo único para padronizar nomes dos softwares e evitar erro de digitação no cadastro de licenças.</p>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="info">{message}</p> : null}

      <Section title={editingId ? 'Editar programa' : 'Novo programa'}>
        <div className="form">
          <div className="two-col">
            <label>
              Nome do programa
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: TopSolid CAM"
              />
            </label>
            <label>
              Observações
              <input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Opcional"
              />
            </label>
          </div>
          <div className="actions">
            <button type="button" onClick={submitProgram}>
              {editingId ? 'Salvar alterações' : 'Adicionar programa'}
            </button>
            {editingId ? (
              <button type="button" onClick={resetForm}>Cancelar edição</button>
            ) : null}
          </div>
        </div>
      </Section>

      <Section
        title="Programas cadastrados"
        action={(
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome..."
          />
        )}
      >
        <table className="table table-hover table-tight">
          <thead>
            <tr>
              <th>Programa</th>
              <th>Observações</th>
              <th>Em uso</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.name}</strong></td>
                <td>{row.notes || '—'}</td>
                <td>{row.usage_count}</td>
                <td className="actions">
                  <button type="button" onClick={() => editProgram(row)}>Editar</button>
                  <button
                    type="button"
                    onClick={() => deleteProgram(row)}
                    disabled={row.usage_count > 0}
                    title={row.usage_count > 0 ? 'Programa em uso por licenças.' : ''}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
