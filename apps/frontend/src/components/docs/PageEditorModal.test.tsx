import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { PageEditorModal } from './PageEditorModal';

// ────────────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────────────

const existingPage = {
  id: 'page-1',
  folder_path: '/Processos',
  title: 'Procedimento de onboarding',
  content: '# Introdução\n\nTexto do procedimento.',
  tags: ['rh', 'onboarding'],
  is_draft: false,
  created_at: '2026-06-01',
  updated_at: '2026-06-01'
};

// ────────────────────────────────────────────────────────────────────────────
// Testes
// ────────────────────────────────────────────────────────────────────────────

describe('PageEditorModal', () => {
  test('modo criação: campo de título vazio e botões de salvar visíveis', () => {
    render(
      <PageEditorModal
        page={null}
        folderPath="Processos Internos"
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText(/Título da página/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: /Salvar rascunho/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Publicar/i })).toBeInTheDocument();
  });

  test('modo edição: preenche título e conteúdo da página existente', () => {
    render(
      <PageEditorModal
        page={existingPage}
        folderPath="Processos Internos"
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Página existente abre em modo leitura — título visível no read-view
    expect(screen.getByText('Procedimento de onboarding')).toBeInTheDocument();
  });

  test('alternar para modo edição exibe textarea e título', async () => {
    const user = userEvent.setup();

    render(
      <PageEditorModal
        page={existingPage}
        folderPath="Processos"
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Clica no botão de modo edição (ícone edit)
    await user.click(screen.getByTitle(/Modo edição/i));

    expect(screen.getByDisplayValue('Procedimento de onboarding')).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Introdução/i)).toBeInTheDocument();
  });

  test('publicar chama onSave com is_draft=false', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <PageEditorModal
        page={null}
        folderPath="Templates"
        isSaving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    await user.type(screen.getByPlaceholderText(/Título da página/i), 'Novo documento');
    await user.click(screen.getByRole('button', { name: /Publicar/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Novo documento', is_draft: false })
      );
    });
  });

  test('salvar rascunho chama onSave com is_draft=true', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <PageEditorModal
        page={null}
        folderPath="Templates"
        isSaving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    await user.type(screen.getByPlaceholderText(/Título da página/i), 'Rascunho inicial');
    await user.click(screen.getByRole('button', { name: /Salvar rascunho/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Rascunho inicial', is_draft: true })
      );
    });
  });

  test('erro de validação quando tenta publicar sem título', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(
      <PageEditorModal
        page={null}
        folderPath="Templates"
        isSaving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    // Não digita título
    await user.click(screen.getByRole('button', { name: /Publicar/i }));

    expect(screen.getByText(/Informe o título/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test('Escape fecha o modal', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <PageEditorModal
        page={null}
        folderPath="Templates"
        isSaving={false}
        onSave={vi.fn()}
        onClose={onClose}
      />
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('tags são adicionadas com Enter e removidas com ×', async () => {
    const user = userEvent.setup();

    render(
      <PageEditorModal
        page={null}
        folderPath="Templates"
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const tagInput = screen.getByPlaceholderText(/Adicionar tag/i);
    await user.type(tagInput, 'fiscal{Enter}');

    expect(screen.getByText('fiscal')).toBeInTheDocument();

    // Remove a tag
    await user.click(screen.getByLabelText(/Remover tag fiscal/i));
    expect(screen.queryByText('fiscal')).not.toBeInTheDocument();
  });
});
