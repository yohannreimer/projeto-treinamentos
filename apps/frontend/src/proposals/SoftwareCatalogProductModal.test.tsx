import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { mergeSoftwareCatalog } from './softwareCatalog';
import { SoftwareCatalogProductModal } from './SoftwareCatalogProductModal';

const editableEntry = mergeSoftwareCatalog([{
  id: 'p3',
  code: '0030',
  name: 'Design Pro',
  unitValueUsd: 9000,
  defaultQuantity: 1,
  description: 'Aplicativo principal',
  catalog: {
    family: 'Design',
    subfamily: "TopSolid'Design",
    folder: 'Pacotes Design',
    reviewStatus: '',
    isPrimary: true,
  },
}], [], [])[0];

describe('SoftwareCatalogProductModal', () => {
  test('submits every editable product field', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <SoftwareCatalogProductModal
        product={null}
        busy={false}
        error=""
        onClose={vi.fn()}
        onSave={onSave}
        onArchive={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Nome'), 'Produto novo');
    await user.type(screen.getByLabelText('Código'), 'N-1');
    await user.type(screen.getByLabelText('Descrição'), 'Informações');
    await user.type(screen.getByLabelText('Subfamília'), 'Extensões');
    await user.type(screen.getByLabelText('Pasta'), 'Customizados');
    await user.type(screen.getByLabelText('Valor USD'), '1250');
    await user.click(screen.getByRole('checkbox', { name: 'Produto principal' }));
    await user.click(screen.getByRole('button', { name: 'Criar produto' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Produto novo',
      code: 'N-1',
      unitValueUsd: 1250,
      description: 'Informações',
      catalog: {
        family: 'Design',
        subfamily: 'Extensões',
        folder: 'Customizados',
        reviewStatus: '',
        isPrimary: true,
      },
    }));
  });

  test('requires a second confirmation before archiving', async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn().mockResolvedValue(undefined);
    render(
      <SoftwareCatalogProductModal
        product={editableEntry}
        busy={false}
        error=""
        onClose={vi.fn()}
        onSave={vi.fn()}
        onArchive={onArchive}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Excluir produto' }));
    expect(screen.getByText(/continuará nas propostas antigas/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ocultar produto' }));
    expect(onArchive).toHaveBeenCalledWith(editableEntry);
  });

  test('keeps typed values when the parent reports a save error', async () => {
    const user = userEvent.setup();
    const props = {
      product: null,
      busy: false,
      error: '',
      onClose: vi.fn(),
      onSave: vi.fn(),
      onArchive: vi.fn(),
    };
    const { rerender } = render(<SoftwareCatalogProductModal {...props} />);
    await user.type(screen.getByLabelText('Nome'), 'Não perder este nome');

    rerender(<SoftwareCatalogProductModal {...props} error="Falha ao salvar" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao salvar');
    expect(screen.getByLabelText('Nome')).toHaveValue('Não perder este nome');
  });

  test('disables modal actions while saving', () => {
    render(
      <SoftwareCatalogProductModal
        product={editableEntry}
        busy
        error=""
        onClose={vi.fn()}
        onSave={vi.fn()}
        onArchive={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Excluir produto' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fechar editor de produto' })).toBeDisabled();
  });

  test('focuses name and closes with Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <SoftwareCatalogProductModal
        product={null}
        busy={false}
        error=""
        onClose={onClose}
        onSave={vi.fn()}
        onArchive={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
