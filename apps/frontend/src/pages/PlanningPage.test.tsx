import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { api } from '../services/api';
import { PlanningPage } from './PlanningPage';

vi.mock('../services/api', () => ({
  api: {
    planningWorkspaces: vi.fn(),
    planningWorkspace: vi.fn()
  }
}));

describe('PlanningPage', () => {
  test('renders workspace list and selected planning columns', async () => {
    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 3, encounter_count: 12 }]
    });
    vi.mocked(api.planningWorkspace).mockResolvedValue({
      workspace: {
        id: 'pln-1',
        name: 'Carteira Maio',
        status: 'Rascunho',
        mode: 'Manual',
        horizon_days: 60,
        notes: null,
        created_at: '2026-05-07',
        updated_at: '2026-05-07',
        published_at: null
      },
      clients: [{ company_id: 'comp-delta', company_name: 'Delta Ferramentaria', priority: 0 }],
      cohorts: []
    });

    render(<PlanningPage />);

    expect(await screen.findByText('Carteira Maio')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Delta Ferramentaria')).toBeInTheDocument());
    expect(screen.getByText('Agenda por horário')).toBeInTheDocument();
    expect(screen.getByText('Painel contextual')).toBeInTheDocument();
  });
});
