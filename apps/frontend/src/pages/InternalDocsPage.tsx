import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Section } from '../components/Section';
import { api } from '../services/api';
import { askDestructiveConfirmation } from '../utils/destructive';

type InternalDocumentRow = {
  id: string;
  title: string;
  category: string | null;
  notes: string | null;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
  updated_at: string;
};

type FileDraft = {
  file_name: string;
  mime_type: string;
  file_data_base64: string;
  file_size_bytes: number;
} | null;

const MAX_DOC_UPLOAD_BYTES = 6_000_000;

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function formatDateBr(dateIso?: string | null): string {
  if (!dateIso) return '-';
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateIso;
  return date.toLocaleDateString('pt-BR');
}

function formatBytes(bytes?: number): string {
  const value = Number(bytes ?? 0);
  if (value <= 0) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function InternalDocsPage() {
  const [rows, setRows] = useState<InternalDocumentRow[]>([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [fileDraft, setFileDraft] = useState<FileDraft>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadAll() {
    const data = await api.internalDocuments() as InternalDocumentRow[];
    setRows(data ?? []);
  }

  useEffect(() => {
    loadAll().catch((err: Error) => setError(err.message));
  }, []);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => (
      row.title.toLowerCase().includes(term)
      || row.file_name.toLowerCase().includes(term)
      || String(row.category ?? '').toLowerCase().includes(term)
    ));
  }, [rows, query]);

  async function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    if (!isPdf && !isImage) {
      setError('Envie apenas PDF ou imagem.');
      return;
    }
    if (file.size > MAX_DOC_UPLOAD_BYTES) {
      setError('Arquivo muito grande. Limite de 6 MB por upload.');
      return;
    }

    try {
      const dataUrl = await toDataUrl(file);
      setFileDraft({
        file_name: file.name,
        mime_type: file.type || (isPdf ? 'application/pdf' : 'image/*'),
        file_data_base64: dataUrl,
        file_size_bytes: file.size
      });
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function createDocument() {
    if (!title.trim()) {
      setError('Informe o título da documentação.');
      return;
    }
    if (!fileDraft) {
      setError('Selecione um arquivo PDF ou imagem.');
      return;
    }

    setError('');
    setMessage('');
    try {
      await api.createInternalDocument({
        title: title.trim(),
        category: category.trim() || null,
        notes: notes.trim() || null,
        file_name: fileDraft.file_name,
        mime_type: fileDraft.mime_type,
        file_data_base64: fileDraft.file_data_base64
      });
      setTitle('');
      setCategory('');
      setNotes('');
      setFileDraft(null);
      setMessage('Documento interno cadastrado.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteDocument(row: InternalDocumentRow) {
    const confirmationPhrase = askDestructiveConfirmation(`Excluir documento "${row.title}"`);
    if (!confirmationPhrase) return;

    setError('');
    setMessage('');
    try {
      await api.deleteInternalDocument(row.id, confirmationPhrase);
      setMessage('Documento removido.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="page internal-docs-page">
      <header className="page-header">
        <h1>Documentação Interna</h1>
        <p>Centralize PDFs e imagens com contexto de uso e download rápido para operação.</p>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="info">{message}</p> : null}

      <Section title="Cadastrar documentação">
        <div className="form form-spacious">
          <label>Título
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Procedimento de suporte CAM" />
          </label>
          <label>Categoria
            <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Ex.: Suporte, Implantação, Comercial" />
          </label>
          <label>Descrição / finalidade
            <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Para que serve este documento e quando usar." />
          </label>
          <label>Arquivo (PDF ou imagem)
            <input type="file" accept="application/pdf,image/*" onChange={onPickFile} />
          </label>
          {fileDraft ? (
            <p className="form-hint">
              Arquivo selecionado: <strong>{fileDraft.file_name}</strong> ({formatBytes(fileDraft.file_size_bytes)})
            </p>
          ) : null}
          <div className="actions actions-compact">
            <button type="button" onClick={createDocument}>Salvar documentação</button>
          </div>
        </div>
      </Section>

      <Section title="Base documental">
        <div className="actions actions-compact">
          <input
            placeholder="Buscar por título, categoria ou arquivo"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="table-wrap">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Título</th>
                <th>Categoria</th>
                <th>Arquivo</th>
                <th>Tamanho</th>
                <th>Atualizado</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td title={row.notes ?? undefined}>{row.title}</td>
                  <td>{row.category ?? '-'}</td>
                  <td>{row.file_name}</td>
                  <td>{formatBytes(row.file_size_bytes)}</td>
                  <td>{formatDateBr(row.updated_at)}</td>
                  <td className="actions">
                    <a href={api.internalDocumentDownloadUrl(row.id)}>Download</a>
                    <button type="button" onClick={() => deleteDocument(row)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
