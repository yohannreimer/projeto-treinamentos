import { readFileSync } from 'node:fs';
import { render, screen, waitFor, within } from '@testing-library/react';
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

const companies = [
  { id: 'company-1', name: 'Agile2 Consultoria LTDA', status: 'Ativo' },
  { id: 'company-2', name: 'Caduferr Ferramentaria', status: 'Ativo' }
];

const pages = [
  {
    id: 'page-1',
    folder_path: '/Clientes/company-1/Documentos',
    title: 'Manual de teste',
    content: 'Conteúdo inicial',
    tags: [],
    is_draft: false,
    created_at: '2026-06-15',
    updated_at: '2026-06-15'
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
    vi.useRealTimers();
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

  function setupFetchMock(options?: {
    rows?: unknown[];
    folders?: unknown[];
    companies?: unknown[];
    modules?: unknown[];
    companyModules?: unknown[];
    pages?: unknown[];
    shareLinks?: unknown[];
    action?: Response | Response[];
  }) {
    // loadAll() faz 5 chamadas paralelas + 2 extras silenciosas para doc-pages/share-links
    // + 1 para a ação do usuário
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(emptyJson(options?.rows ?? rows))          // /internal-documents
      .mockResolvedValueOnce(emptyJson(options?.folders ?? []))         // /internal-document-folders
      .mockResolvedValueOnce(emptyJson(options?.companies ?? []))       // /companies
      .mockResolvedValueOnce(emptyJson(options?.modules ?? []))         // /modules
      .mockResolvedValueOnce(emptyJson(options?.companyModules ?? []))  // /internal-documents/company-modules
      .mockResolvedValueOnce(emptyJson(options?.pages ?? []))           // /api/internal/doc-pages
      .mockResolvedValueOnce(emptyJson(options?.shareLinks ?? []));     // /api/internal/share-links

    const actions = Array.isArray(options?.action) ? options.action : [options?.action ?? makePdfBlob()];
    actions.forEach((response) => fetchMock.mockResolvedValueOnce(response));
    vi.stubGlobal('fetch', fetchMock);
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

    // 5 chamadas de loadAll + doc-pages + share-links + download = 8
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(8));
    const downloadRequest = vi.mocked(fetch).mock.calls[7];
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

    // 4 chamadas de loadAll + doc-pages + share-links + preview = 7
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(8));
    const previewRequest = vi.mocked(fetch).mock.calls[7];
    expect(previewRequest[0]).toBe('http://localhost:4000/internal-documents/doc-1/download');
    expect((previewRequest[1]?.headers as Headers).get('Authorization')).toBe('Bearer token-documentos');
    expect(screen.getByRole('dialog', { name: /Certificado - Metal Forte/i })).toBeInTheDocument();
    expect(screen.getByTitle('Prévia do documento')).toHaveAttribute('src', 'blob:documento');
  });

  test('has concrete CSS for list visualization', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

    expect(css).toMatch(/\.dv2-grid--list\s*\{/);
    expect(css).toMatch(/\.dv2-grid--list\s+\.dv2-folder-card/);
    expect(css).toMatch(/\.dv2-grid--list\s+\.dv2-wiki-card/);
    expect(css).toMatch(/\.dv2-grid--list\s+\.dv2-file-card/);
  });

  test('uploads arbitrary file types up to the 1 GB document limit', async () => {
    setupFetchMock({ rows: [], companies, pages: [], action: emptyJson({ id: 'doc-new' }) });
    const user = userEvent.setup();

    render(<InternalDocsPage />);

    const sidebar = document.querySelector('.dv2-sidebar');
    if (!(sidebar instanceof HTMLElement)) {
      throw new Error('Sidebar de documentação não encontrada.');
    }

    await user.click(await within(sidebar).findByRole('button', { name: /Clientes/i }));
    await user.click(await within(sidebar).findByRole('button', { name: /Agile2 Consultoria LTDA/i }));
    await user.click(await within(sidebar).findByRole('button', { name: /Documentos do cliente/i }));
    await user.click(screen.getByRole('button', { name: /Novo/i }));
    await user.click(screen.getByRole('button', { name: /Enviar arquivo/i }));

    const customFile = new File(['conteudo'], 'arquivo.yrdnegocios', { type: '' });
    Object.defineProperty(customFile, 'size', { value: 1_000_000_000 });
    await user.upload(screen.getByLabelText(/Arquivo/i, { selector: 'input' }), customFile);

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Salvar na pasta/i }));

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([url, init]) =>
        String(url).endsWith('/internal-documents') && init?.method === 'POST'
      )).toBe(true);
    });

    const createRequest = vi.mocked(fetch).mock.calls.find(([url, init]) =>
      String(url).endsWith('/internal-documents') && init?.method === 'POST'
    );
    const body = JSON.parse(String(createRequest?.[1]?.body));
    expect(body.file_name).toBe('arquivo.yrdnegocios');
    expect(body.mime_type).toBe('application/octet-stream');
    expect(body.file_data_base64).toMatch(/^data:application\/octet-stream;base64,/);
  });

  test('rejects documentation files larger than 1 GB before uploading', async () => {
    setupFetchMock({ rows: [], companies, pages: [] });
    const user = userEvent.setup();
    const tooLargeFile = new File(['x'], 'grande.zip', { type: 'application/zip' });
    Object.defineProperty(tooLargeFile, 'size', { value: 1_000_000_001 });

    render(<InternalDocsPage />);

    await user.click(await screen.findByRole('button', { name: /Novo/i }));
    await user.click(screen.getByRole('button', { name: /Enviar arquivo/i }));
    await user.upload(screen.getByLabelText(/Arquivo/i, { selector: 'input' }), tooLargeFile);

    expect(await screen.findByRole('alert')).toHaveTextContent('Arquivo muito grande. Limite de 1 GB.');
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) =>
      String(url).endsWith('/internal-documents') && init?.method === 'POST'
    )).toBe(false);
  });

  test('shows folder share errors as temporary toast alerts', async () => {
    vi.useFakeTimers();
    setupFetchMock({ rows: [], companies });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<InternalDocsPage />);

    await user.click(await screen.findByRole('button', { name: /Gerar link público/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Selecione uma página ou arquivo para compartilhar.');

    vi.advanceTimersByTime(7000);

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  test('publishes a selected client file to the portal', async () => {
    const clientFile = {
      id: 'doc-client-portal',
      title: 'Digital Twin Linha A',
      category: 'Digital Twin',
      notes: 'Arquivo técnico liberado ao cliente',
      folder_path: '/Clientes/company-1/modulos/module-1',
      file_name: 'digital-twin-linha-a.step',
      mime_type: 'application/octet-stream',
      file_size_bytes: 2048,
      portal_visible: 0,
      portal_published_at: null,
      created_at: '2026-06-15',
      updated_at: '2026-06-15'
    };
    setupFetchMock({
      rows: [clientFile],
      companies,
      modules: [{ id: 'module-1', code: 'M01', name: 'Digital Twin' }],
      companyModules: [{ company_id: 'company-1', module_id: 'module-1' }],
      action: [
        emptyJson({
          id: 'share-client-file',
          resource_type: 'document',
          resource_id: 'doc-client-portal',
          token: 'token-client-file',
          allow_download: true,
          expires_at: null,
          created_at: '2026-06-15'
        }),
        emptyJson({ ...clientFile, portal_visible: 1, portal_published_at: '2026-06-15T12:00:00.000Z' })
      ]
    });
    const user = userEvent.setup();

    render(<InternalDocsPage />);

    await user.click(await screen.findByRole('button', { name: /Clientes/i }));
    await user.click(await screen.findByRole('button', { name: /Agile2 Consultoria LTDA/i }));
    await user.click(await screen.findByRole('button', { name: /Módulos/i }));
    await user.click(await screen.findByRole('button', { name: /Digital Twin/i }));
    await user.click(await screen.findByTitle('Compartilhar'));
    await user.click(screen.getByTitle('Fechar'));
    await user.click(await screen.findByRole('button', { name: /Adicionar ao portal/i }));

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([url, init]) =>
        String(url).endsWith('/internal-documents/doc-client-portal/portal')
        && init?.method === 'PATCH'
        && String(init.body).includes('"visible":true')
      )).toBe(true);
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Arquivo adicionado ao portal.');
  });

  test('collapses the selected sidebar folder when clicked again', async () => {
    setupFetchMock({ rows: [], companies });
    const user = userEvent.setup();

    render(<InternalDocsPage />);

    await user.click(await screen.findByRole('button', { name: /Clientes/i }));
    const companyButton = await screen.findByRole('button', { name: /Agile2 Consultoria LTDA/i });
    await user.click(companyButton);

    expect(await screen.findByRole('button', { name: /Documentos do cliente/i })).toBeInTheDocument();

    await user.click(companyButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Documentos do cliente/i })).not.toBeInTheDocument();
    });
  });

  test('keeps focus in the page title while editing the title', async () => {
    setupFetchMock({ rows: [], companies, pages });
    const user = userEvent.setup();

    render(<InternalDocsPage />);

    await user.click(await screen.findByRole('button', { name: /Clientes/i }));
    await user.click(await screen.findByRole('button', { name: /Agile2 Consultoria LTDA/i }));
    await user.click(await screen.findByRole('button', { name: /Documentos do cliente/i }));
    await user.click(await screen.findByRole('button', { name: /Manual de teste/i }));
    await user.click(screen.getByTitle('Modo edição'));

    const titleInput = screen.getByPlaceholderText('Título da página');
    await user.click(titleInput);
    await user.type(titleInput, ' atualizado');

    expect(titleInput).toHaveFocus();
    expect(titleInput).toHaveValue('Manual de teste atualizado');
  });

  test('shares the selected page and shows a single public link', async () => {
    setupFetchMock({
      rows: [],
      companies,
      pages,
      action: emptyJson({
        id: 'share-1',
        resource_type: 'page',
        resource_id: 'page-1',
        token: 'token-publico',
        allow_download: true,
        expires_at: null,
        created_at: '2026-06-15'
      })
    });
    const user = userEvent.setup();

    render(<InternalDocsPage />);

    await user.click(await screen.findByRole('button', { name: /Clientes/i }));
    await user.click(await screen.findByRole('button', { name: /Agile2 Consultoria LTDA/i }));
    await user.click(await screen.findByRole('button', { name: /Documentos do cliente/i }));
    await user.click(await screen.findByRole('button', { name: /Manual de teste/i }));
    await user.click(screen.getByTitle('Fechar (Esc)'));
    await user.click(screen.getByRole('button', { name: /Compartilhar página/i }));

    const dialog = await screen.findByRole('dialog', { name: /Compartilhar página/i });
    expect(await within(dialog).findByText('https://orquestrador.yrdnegocios.com.br/p/token-publico')).toBeInTheDocument();

    const shareRequests = vi.mocked(fetch).mock.calls.filter(([url, init]) =>
      String(url).endsWith('/api/internal/share-links') && init?.method === 'POST'
    );
    expect(shareRequests).toHaveLength(1);
  });

  test('deletes the selected page from the detail panel', async () => {
    setupFetchMock({ rows: [], companies, pages, action: emptyJson({ ok: true }) });
    vi.spyOn(window, 'prompt').mockReturnValue('APAGAR_BASE_TOTAL');
    const user = userEvent.setup();

    render(<InternalDocsPage />);

    await user.click(await screen.findByRole('button', { name: /Clientes/i }));
    await user.click(await screen.findByRole('button', { name: /Agile2 Consultoria LTDA/i }));
    await user.click(await screen.findByRole('button', { name: /Documentos do cliente/i }));
    await user.click(await screen.findByRole('button', { name: /Manual de teste/i }));
    await user.click(screen.getByTitle('Fechar (Esc)'));
    await user.click(screen.getByRole('button', { name: /Excluir página/i }));

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([url, init]) =>
        String(url).endsWith('/api/internal/doc-pages/page-1') && init?.method === 'DELETE'
      )).toBe(true);
    });
    expect(screen.queryByRole('button', { name: /Manual de teste/i })).not.toBeInTheDocument();
  });

  test('dismisses page status messages automatically', async () => {
    setupFetchMock({
      rows: [],
      companies,
      pages: [],
      action: emptyJson({
        ...pages[0],
        id: 'page-created',
        title: 'Página temporária',
        folder_path: '/Clientes/company-1/Documentos'
      })
    });
    const user = userEvent.setup();

    render(<InternalDocsPage />);

    await user.click(await screen.findByRole('button', { name: /Clientes/i }));
    await user.click(await screen.findByRole('button', { name: /Agile2 Consultoria LTDA/i }));
    await user.click(await screen.findByRole('button', { name: /Documentos do cliente/i }));
    await user.click(screen.getByRole('button', { name: /Novo/i }));
    await user.click(screen.getByRole('button', { name: /Nova página/i }));
    await user.type(screen.getByPlaceholderText('Título da página'), 'Página temporária');
    await user.click(screen.getByRole('button', { name: /Publicar/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('Página criada.');

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    }, { timeout: 7000 });
  });
});
