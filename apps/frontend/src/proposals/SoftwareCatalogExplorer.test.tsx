import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { mergeSoftwareCatalog } from './softwareCatalog';
import { SoftwareCatalogExplorer } from './SoftwareCatalogExplorer';
import { TOPSOLID_CATALOG_PRODUCTS } from './topsolidCatalog.generated';
import { applyTopsolidPrimaryClassification } from './topsolidCatalogClassification';

const onToggle = vi.fn();
const onDone = vi.fn();
const onNewProduct = vi.fn();
const onEditProduct = vi.fn();

const defaultProps = {
  products: mergeSoftwareCatalog(applyTopsolidPrimaryClassification(TOPSOLID_CATALOG_PRODUCTS), [], []),
  selectedIds: new Set<string>(),
  softwareSubtotalUsd: 0,
  adminDisabled: false,
  onToggle,
  onNewProduct,
  onEditProduct,
  onDone,
};

describe('SoftwareCatalogExplorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('focuses search, navigates CAM to Milling, and toggles a product', async () => {
    const user = userEvent.setup();
    render(<SoftwareCatalogExplorer {...defaultProps} />);

    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Buscar software' })).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'CAM, 66 produtos' }));
    await user.click(screen.getByRole('button', { name: 'Milling, 31 produtos' }));
    await user.click(screen.getByRole('button', { name: /Adicionar Ext\/Cam M2 Milling 7/ }));

    expect(onToggle).toHaveBeenCalledWith('p4');
  });

  test('searches globally and exposes the result path', async () => {
    const user = userEvent.setup();
    render(<SoftwareCatalogExplorer {...defaultProps} />);

    await user.type(screen.getByRole('searchbox', { name: 'Buscar software' }), 'Fanuc Milling 2D');

    expect(screen.getByText('Pós-processadores / CAM / Bases de Pós-processadores CAM')).toBeInTheDocument();
    expect(screen.getByText('PP/Fanuc Milling 2D/3D Módulo (3511)')).toBeInTheDocument();
  });

  test('shows fifty post-processors before loading more', async () => {
    const user = userEvent.setup();
    render(<SoftwareCatalogExplorer {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'Pós-processadores, 238 produtos' }));
    expect(screen.getAllByRole('article')).toHaveLength(50);
    await user.click(screen.getByRole('button', { name: /Mostrar mais 50 de 188 restantes/ }));
    expect(screen.getAllByRole('article')).toHaveLength(100);
  });

  test('shows review state, empty results, and selected state', async () => {
    const user = userEvent.setup();
    const reviewProduct = TOPSOLID_CATALOG_PRODUCTS.find((item) => item.catalog.reviewStatus === 'REVISAR');
    expect(reviewProduct).toBeDefined();
    const { rerender } = render(<SoftwareCatalogExplorer {...defaultProps} />);

    await user.type(screen.getByRole('searchbox', { name: 'Buscar software' }), reviewProduct!.name);
    expect(screen.getByText('REVISAR')).toBeInTheDocument();

    rerender(<SoftwareCatalogExplorer {...defaultProps} selectedIds={new Set([reviewProduct!.id])} />);
    expect(screen.getByRole('button', { name: `Remover ${reviewProduct!.name.replace(/\s+/g, ' ')}` })).toHaveAttribute('aria-pressed', 'true');

    await user.clear(screen.getByRole('searchbox', { name: 'Buscar software' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar software' }), 'produto inexistente xyz');
    expect(screen.getByText('Nenhum software encontrado.')).toBeInTheDocument();
  });

  test('finishes from the button or Escape', async () => {
    const user = userEvent.setup();
    render(<SoftwareCatalogExplorer {...defaultProps} selectedIds={new Set(['p4'])} softwareSubtotalUsd={5500} />);

    expect(screen.getByText('1 produto selecionado')).toBeInTheDocument();
    expect(within(screen.getByRole('contentinfo')).getByText('US$ 5,500.00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Concluir seleção' }));
    expect(onDone).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onDone).toHaveBeenCalledTimes(2);
  });

  test('groups natural search and exposes create and edit actions', async () => {
    const user = userEvent.setup();
    render(<SoftwareCatalogExplorer {...defaultProps} />);

    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar software' }),
      'TopSolid Design Standard',
    );

    const searchResults = screen.getByTestId('catalog-search-groups');
    expect(within(searchResults).getByRole('heading', { level: 4, name: 'Design' })).toBeInTheDocument();
    expect(within(searchResults).getByRole('heading', { level: 5, name: 'Produtos principais' })).toBeInTheDocument();
    expect(within(searchResults).getByText('TopSolid’Design Standard 7 - Módulo - 0020')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Novo produto' }));
    expect(onNewProduct).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: /Editar TopSolid’Design Standard 7/ }));
    expect(onEditProduct).toHaveBeenCalledWith(expect.objectContaining({ id: 'topsolid-656d52c2e9e3' }));
  });

  test('shows Produtos principais after Todos even when the family has no primary item', async () => {
    const user = userEvent.setup();
    render(<SoftwareCatalogExplorer {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'Interfaces, 84 produtos' }));
    const subfamilies = screen.getByRole('navigation', { name: 'Subfamílias de Interfaces' });
    const buttons = within(subfamilies).getAllByRole('button');
    expect(buttons[0]).toHaveAccessibleName('Todos, 84 produtos');
    expect(buttons[1]).toHaveAccessibleName('Produtos principais, 0 produtos');
  });

  test('disables administrative actions when shared data is unavailable', () => {
    render(<SoftwareCatalogExplorer {...defaultProps} adminDisabled />);

    expect(screen.getByRole('button', { name: 'Novo produto' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /^Editar / })[0]).toBeDisabled();
  });
});
