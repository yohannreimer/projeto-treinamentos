import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { internalSessionStore } from '../auth/session';
import { InternalDocsPage } from './InternalDocsPage';

// Documento na pasta /Interna que é exibido por padrão ao abrir a página
const rows = [
  {
    id: 'doc-1',
    title: 'Certificado - Metal Forte - Instalacao TopSolid',
    category: 'Certificados',
    notes: null,
    folder_path: '/Interna',
    file_name: 'certificado-metal-forte.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 1234,
    created_at: '2026-05-08',
    updated_at: '2026-05-08'
  }
];

const emptyJson = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });

// Fábrica — cria nova Response a cada chamada para evitar body already consumed
const makePdfBlob = () =>
  new Response(new Blob(['PDF'], { type: 'application/pdf' }), {
    status: 200,
    headers: { 'Content-Disposition': "attachment; filename*=UTF-8''procedimento.pdf" }
  });

describe('InternalDocsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.spyOn(internalSessionStore, 'read').mockReturnValue({
      token: 'token-documentos',
      expires_at: '2099-01-01T00:00:00.000Z',
      user: {
        id: 'user-1',
        username: 'tester',
        display_name: 'Tester',
        role: 'supremo',
        permissions: ['docs']
      }
    });

    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:documento'),
      revokeObjectURL: vi.fn()
    });
  });

  function setupFetchMock() {
    // loadAll() faz 4 chamadas paralelas + 1 extra silenciosa para doc-pages
    // + 1 para a ação do usuário
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(emptyJson(rows))     // /internal-documents
      .mockResolvedValueOnce(emptyJson([]))        // /internal-document-folders
      .mockResolvedValueOnce(emptyJson([]))        // /companies
      .mockResolvedValueOnce(emptyJson([]))        // /modules
      .mockResolvedValueOnce(emptyJson([]))        // /api/internal/doc-pages (silencioso)
      .mockResolvedValueOnce(makePdfBlob())        // ação do usuário (download / preview)
    );
  }

  test('downloads internal documents with the internal auth token', async () => {
    setupFetchMock();

    const user = userEvent.setup();
    const appendChildSpy = vi.spyOn(document.body, 'appendChild');
    const removeChildSpy = vi.spyOn(document.body, 'removeChild');
    const anchorClick = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement');
    createElementSpy.mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = Document.prototype.createElement.call(document, tagName, options);
      if (tagName.toLowerCase() === 'a') {
        Object.defineProperty(element, 'click', { value: anchorClick });
      }
      return element;
    }) as typeof document.createElement);

    render(<InternalDocsPage />);

    await user.click(await screen.findByRole('button', { name: /Download/i }));

    // 4 chamadas de loadAll + 1 doc-pages + 1 download = 6
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
    const downloadRequest = vi.mocked(fetch).mock.calls[5];
    expect(downloadRequest[0]).toBe('http://localhost:4000/internal-documents/doc-1/download');
    expect((downloadRequest[1]?.headers as Headers).get('Authorization')).toBe('Bearer token-documentos');
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(appendChildSpy).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalled();
  });

  test('previews certificate PDFs without downloading raw document data', async () => {
    setupFetchMock();

    const user = userEvent.setup();

    render(<InternalDocsPage />);

    await user.click(await screen.findByRole('button', { name: /Visualizar/i }));

    // 4 chamadas de loadAll + 1 doc-pages + 1 preview = 6
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
    const previewRequest = vi.mocked(fetch).mock.calls[5];
    expect(previewRequest[0]).toBe('http://localhost:4000/internal-documents/doc-1/download');
    expect((previewRequest[1]?.headers as Headers).get('Authorization')).toBe('Bearer token-documentos');
    expect(screen.getByRole('dialog', { name: /Certificado - Metal Forte/i })).toBeInTheDocument();
    expect(screen.getByTitle('Prévia do documento')).toHaveAttribute('src', 'blob:documento');
  });
});
