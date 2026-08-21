import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import type { EditableProposalProduct } from './proposalData';
import { SoftwareSelectionSummary } from './SoftwareSelectionSummary';

const editableProduct: EditableProposalProduct = {
  id: 'p3',
  code: '0030',
  name: "TopSolid'Design Pro 7",
  displayName: "TopSolid'Design Pro 7",
  unitValueUsd: 6500,
  effectiveUnitValueUsd: 6500,
  defaultQuantity: 1,
  quantity: 1,
  description: 'Design',
  displayDescription: 'Design',
  maintenanceEnabled: false,
  maintenancePercent: 10,
  maintenanceYears: 1,
  maintenanceLabel: '',
};

describe('SoftwareSelectionSummary', () => {
  test('renders the empty state and opens the catalog', async () => {
    const user = userEvent.setup();
    const onOpenCatalog = vi.fn();
    render(<SoftwareSelectionSummary products={[]} onOpenCatalog={onOpenCatalog} onEdit={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByText('Nenhum software adicionado.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Adicionar software do catálogo' }));
    expect(onOpenCatalog).toHaveBeenCalledOnce();
  });

  test('renders selected products and forwards actions', async () => {
    const user = userEvent.setup();
    const onOpenCatalog = vi.fn();
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    render(
      <SoftwareSelectionSummary
        products={[editableProduct]}
        onOpenCatalog={onOpenCatalog}
        onEdit={onEdit}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByText("TopSolid'Design Pro 7")).toBeInTheDocument();
    expect(screen.getByText('US$ 6,500.00 · qtd 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Editar TopSolid'Design Pro 7" }));
    await user.click(screen.getByRole('button', { name: "Remover TopSolid'Design Pro 7" }));
    await user.click(screen.getByRole('button', { name: 'Adicionar software do catálogo' }));

    expect(onEdit).toHaveBeenCalledWith('p3');
    expect(onRemove).toHaveBeenCalledWith('p3');
    expect(onOpenCatalog).toHaveBeenCalledOnce();
  });

  test('marks custom products', () => {
    render(
      <SoftwareSelectionSummary
        products={[{ ...editableProduct, id: 'custom-1', custom: true }]}
        onOpenCatalog={vi.fn()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('CUSTOM')).toBeInTheDocument();
  });
});
