import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { internalSessionStore } from '../auth/session';
import { InternalDocsPage } from './InternalDocsPage';

const companies = [
  { id: 'comp-magui', name: 'Magui Dispositivos de Controle Ltda', status: 'Ativo' },
  { id: 'comp-holand', name: 'Holand Automação de Engenharias Ltda', status: 'Ativo' }
];

const modules = [
  { id: 'mod-cam', code: '020102010', name: "Treinamento TopSolid'Cam 7 - Fresamento 2D", delivery_mode: 'Treinamento' },
  { id: 'mod-design', code: '020101020', name: "Treinamento TopSolid'Design 7 - Básico", delivery_mode: 'Treinamento' }
];

const folders = [
  {
    id: 'folder-interna',
    parent_path: '/Interna',
    path: '/Interna/Materiais',
    name: 'Materiais',
    created_at: '2026-05-08',
    updated_at: '2026-05-08'
  }
];

const rows = [
  {
    id: 'doc-cert',
    title: 'Certificado - Holand - Design Básico',
    category: 'Certificados',
    notes: 'Chave: CERTIFICADO_CLIENTE_MODULO:comp-holand:mod-design',
    folder_path: null,
    file_name: 'certificado-holand.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 1234,
    created_at: '2026-05-08',
    updated_at: '2026-05-08'
  },
  {
    id: 'doc-survey',
    title: "Pesquisa - Magui - Treinamento TopSolid'Cam 7 - Fresamento 2D",
    category: 'Pesquisas de Satisfação',
    notes: [
      '[PESQUISA_SATISFACAO_CERTIFICADO]',
      'Chave: PESQUISA_CERTIFICADO:comp-magui:coh-1:mod-cam',
      'Empresa: Magui Dispositivos de Controle Ltda',
      'Turma: TUR-008 · TopSolid CAM 2D',
      "Módulo: Treinamento TopSolid'Cam 7 - Fresamento 2D",
      'Respondido por: Cleberson',
      'Enviado em: 2026-05-08T16:52:51.840Z',
      '',
      'Respostas:',
      'q1: 5'
    ].join('\n'),
    folder_path: null,
    file_name: 'pesquisa-magui.html',
    mime_type: 'text/html',
    file_size_bytes: 3000,
    created_at: '2026-05-08',
    updated_at: '2026-05-08'
  },
  {
    id: 'doc-internal',
    title: 'Material interno de implantação',
    category: 'Materiais',
    notes: 'Guia de uso interno.',
    folder_path: '/Interna/Materiais',
    file_name: 'material.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 2200,
    created_at: '2026-05-08',
    updated_at: '2026-05-08'
  }
];

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

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(folders), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(companies), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(modules), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }))
      .mockResolvedValueOnce(new Response(new Blob(['PDF'], { type: 'application/pdf' }), {
        status: 200,
        headers: { 'Content-Disposition': "attachment; filename*=UTF-8''procedimento.pdf" }
      })));

    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:documento'),
      revokeObjectURL: vi.fn()
    });
  });

  test('downloads internal documents with the internal auth token', async () => {
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

    await user.click((await screen.findAllByRole('button', { name: /Holand Automação de Engenharias Ltda.*Pasta automática/i }))[0]);
    await user.click((await screen.findAllByRole('button', { name: /Módulos.*Pasta automática/i }))[0]);
    await user.click((await screen.findAllByRole('button', { name: /020101020.*Treinamento TopSolid'Design 7 - Básico.*Pasta automática/i }))[0]);
    await user.click((await screen.findAllByRole('button', { name: /Certificados.*Pasta automática/i }))[0]);
    await screen.findByText('Certificado - Holand - Design Básico');
    await user.click(await screen.findByRole('button', { name: 'Download' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(5));
    const downloadRequest = vi.mocked(fetch).mock.calls[4];
    expect(downloadRequest[0]).toBe('http://localhost:4000/internal-documents/doc-cert/download');
    expect((downloadRequest[1]?.headers as Headers).get('Authorization')).toBe('Bearer token-documentos');
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(appendChildSpy).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalled();
  });

  test('previews certificate PDFs without downloading raw document data', async () => {
    const user = userEvent.setup();

    render(<InternalDocsPage />);

    await user.click((await screen.findAllByRole('button', { name: /Holand Automação de Engenharias Ltda.*Pasta automática/i }))[0]);
    await user.click((await screen.findAllByRole('button', { name: /Módulos.*Pasta automática/i }))[0]);
    await user.click((await screen.findAllByRole('button', { name: /020101020.*Treinamento TopSolid'Design 7 - Básico.*Pasta automática/i }))[0]);
    await user.click((await screen.findAllByRole('button', { name: /Certificados.*Pasta automática/i }))[0]);
    await screen.findByText('Certificado - Holand - Design Básico');
    await user.click(await screen.findByRole('button', { name: 'Visualizar' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(5));
    const previewRequest = vi.mocked(fetch).mock.calls[4];
    expect(previewRequest[0]).toBe('http://localhost:4000/internal-documents/doc-cert/download');
    expect((previewRequest[1]?.headers as Headers).get('Authorization')).toBe('Bearer token-documentos');
    expect(screen.getByRole('dialog', { name: /Certificado - Holand/i })).toBeInTheDocument();
    expect(screen.getByTitle('Prévia do documento')).toHaveAttribute('src', 'blob:documento');
  });

  test('groups search results with full context in global search', async () => {
    const user = userEvent.setup();
    render(<InternalDocsPage />);

    await screen.findByRole('heading', { name: 'Documentação' });
    await user.type(screen.getByRole('searchbox', { name: 'Buscar documentação' }), 'satis');
    await user.click(screen.getByRole('button', { name: 'Tudo' }));

    expect(await screen.findByRole('heading', { name: 'Pastas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pesquisas' })).toBeInTheDocument();
    expect(screen.getAllByText(/Clientes > Magui Dispositivos de Controle Ltda > Pesquisa de satisfação/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Treinamento TopSolid'Cam 7 - Fresamento 2D/i).length).toBeGreaterThan(0);
  });

  test('keeps client module folders collapsed until the user expands them', async () => {
    const user = userEvent.setup();
    render(<InternalDocsPage />);

    await screen.findByRole('button', { name: /^Clientes/i });
    expect(screen.queryByRole('button', { name: /020102010/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Clientes/i }));
    await user.click(screen.getByRole('button', { name: /Magui Dispositivos/i }));
    expect(screen.getByRole('button', { name: /^Módulos/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /020102010/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Módulos/i }));
    expect(screen.getByRole('button', { name: /020102010/i })).toBeInTheDocument();
  });

  test('shows selected document metadata in the right details panel', async () => {
    const user = userEvent.setup();
    render(<InternalDocsPage />);

    await screen.findByRole('heading', { name: 'Documentação' });
    await user.type(screen.getByRole('searchbox', { name: 'Buscar documentação' }), 'Magui');
    await user.click(screen.getByRole('button', { name: 'Tudo' }));
    const surveyResultButtons = await screen.findAllByRole('button', {
      name: /Treinamento TopSolid'Cam 7 - Fresamento 2D/i
    });
    await user.click(surveyResultButtons.find((button) => button.textContent?.includes('Cleberson')) ?? surveyResultButtons[0]);

    const detailsPanel = screen.getByRole('complementary', { name: 'Detalhes e ações' });
    expect(within(detailsPanel).getByRole('heading', { name: 'Detalhes' })).toBeInTheDocument();
    expect(within(detailsPanel).getByText(/Tipo/i)).toBeInTheDocument();
    expect(within(detailsPanel).getByText('Pesquisa')).toBeInTheDocument();
    expect(within(detailsPanel).getByText(/Clientes > Magui Dispositivos de Controle Ltda/i)).toBeInTheDocument();
  });

  test('selects regular folder documents and clears stale details when navigating', async () => {
    const user = userEvent.setup();
    render(<InternalDocsPage />);

    const content = await screen.findByRole('region', { name: 'Conteúdo da pasta' });
    await user.click(within(content).getByRole('button', { name: /Materiais/i }));
    await screen.findByText('Material interno de implantação');
    await user.click(within(content).getByRole('button', { name: 'Detalhes' }));

    const detailsPanel = screen.getByRole('complementary', { name: 'Detalhes e ações' });
    expect(within(detailsPanel).getAllByText('Arquivo').length).toBeGreaterThan(0);
    expect(within(detailsPanel).getByText('material.pdf')).toBeInTheDocument();

    const breadcrumb = screen.getByRole('navigation', { name: 'Caminho da pasta' });
    await user.click(within(breadcrumb).getByRole('button', { name: 'Interna' }));

    expect(within(detailsPanel).getByText(/Selecione uma pasta, pesquisa, certificado ou arquivo/i)).toBeInTheDocument();
    expect(within(detailsPanel).queryByText('material.pdf')).not.toBeInTheDocument();
  });
});
