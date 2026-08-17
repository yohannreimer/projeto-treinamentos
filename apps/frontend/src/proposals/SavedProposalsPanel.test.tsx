import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { SavedProposalsPanel } from './SavedProposalsPanel';

const items = [
  {
    id: 'p1', number: 'P-001', client_company_name: 'Alfa', created_by: 'u1', updated_by: 'u1',
    created_at: '2026-08-17T10:00:00Z', updated_at: '2026-08-17T10:00:00Z'
  },
  {
    id: 'p2', number: 'P-002', client_company_name: 'Beta', created_by: 'u1', updated_by: 'u1',
    created_at: '2026-08-17T11:00:00Z', updated_at: '2026-08-17T11:00:00Z'
  }
];

test('lists and filters shared saved proposals', () => {
  const onQueryChange = vi.fn();
  const props = {
    items,
    query: '',
    activeId: null,
    loading: false,
    saving: false,
    error: '',
    status: '',
    onQueryChange,
    onNew: vi.fn(),
    onSave: vi.fn(),
    onOpen: vi.fn(),
    onDelete: vi.fn()
  };
  const { rerender } = render(<SavedProposalsPanel {...props} />);

  expect(screen.getByRole('button', { name: /Abrir P-001/i })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar propostas salvas'), { target: { value: 'Beta' } });
  expect(onQueryChange).toHaveBeenLastCalledWith('Beta');

  rerender(<SavedProposalsPanel {...props} query="Beta" />);
  expect(screen.queryByRole('button', { name: /Abrir P-001/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Abrir P-002/i })).toBeInTheDocument();
});

test('exposes operation states and actions', () => {
  const onSave = vi.fn();
  render(
    <SavedProposalsPanel
      items={items}
      query=""
      activeId="p1"
      loading={false}
      saving
      error="Falha ao salvar"
      status=""
      onQueryChange={vi.fn()}
      onNew={vi.fn()}
      onSave={onSave}
      onOpen={vi.fn()}
      onDelete={vi.fn()}
    />
  );

  expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Falha ao salvar');
});
