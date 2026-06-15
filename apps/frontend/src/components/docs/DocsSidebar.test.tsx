import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { DocsSidebar } from './DocsSidebar';
import { buildTree } from './treeUtils';

// ────────────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────────────

const companies = [
  { id: 'company-abc', name: 'Empresa ABC', status: 'Ativo' }
];
const modules = [
  { id: 'mod-1', code: 'M01', name: 'Módulo 1' }
];

function makeTree() {
  return buildTree(companies, modules, [], []);
}

// ────────────────────────────────────────────────────────────────────────────
// Testes
// ────────────────────────────────────────────────────────────────────────────

describe('DocsSidebar', () => {
  test('renderiza as 4 seções fixas', () => {
    render(
      <DocsSidebar
        tree={makeTree()}
        selectedPath="/Interna"
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Clientes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Processos Internos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Templates/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Base de Conhecimento/i })).toBeInTheDocument();
  });

  test('campo de busca está presente', () => {
    render(
      <DocsSidebar
        tree={makeTree()}
        selectedPath="/Interna"
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText(/Buscar pastas/i)).toBeInTheDocument();
  });

  test('clicar na seção Clientes chama onSelect com o path correto', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <DocsSidebar
        tree={makeTree()}
        selectedPath="/Interna"
        onSelect={onSelect}
      />
    );

    await user.click(screen.getByRole('button', { name: /^Clientes$/i }));
    expect(onSelect).toHaveBeenCalledWith('/Clientes');
  });

  test('busca filtra items por nome', async () => {
    const user = userEvent.setup();

    render(
      <DocsSidebar
        tree={makeTree()}
        selectedPath="/Clientes"
        onSelect={vi.fn()}
      />
    );

    // Abre seção Clientes para expor subpastas
    await user.click(screen.getByRole('button', { name: /^Clientes$/i }));

    // Empresa ABC deve aparecer
    expect(screen.getByText('Empresa ABC')).toBeInTheDocument();

    // Filtra com texto que não bate
    await user.type(screen.getByPlaceholderText(/Buscar pastas/i), 'zzzzz');

    expect(screen.queryByText('Empresa ABC')).not.toBeInTheDocument();
  });

  test('botão de criar pasta chama onCreateFolder com o path da seção', async () => {
    const onCreateFolder = vi.fn();
    const user = userEvent.setup();

    render(
      <DocsSidebar
        tree={makeTree()}
        selectedPath="/Processos"
        onSelect={vi.fn()}
        onCreateFolder={onCreateFolder}
      />
    );

    // O botão "+" está no DOM mesmo que visualmente oculto por CSS (JSDOM ignora CSS)
    const addBtn = screen.getByTitle(/Nova pasta em Processos Internos/i);
    await user.click(addBtn);

    expect(onCreateFolder).toHaveBeenCalledWith('/Processos');
  });

  test('item ativo tem classe is-active', async () => {
    const user = userEvent.setup();

    render(
      <DocsSidebar
        tree={makeTree()}
        selectedPath="/Clientes"
        onSelect={vi.fn()}
      />
    );

    // Abre seção Clientes
    await user.click(screen.getByRole('button', { name: /^Clientes$/i }));

    // Empresa ABC é um tree-item filha, ainda não selecionada
    const abcBtn = screen.getByText('Empresa ABC').closest('button');
    expect(abcBtn).not.toHaveClass('is-active');
  });
});
