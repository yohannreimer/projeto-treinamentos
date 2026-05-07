import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from '../services/api';
import { PlanningPage } from './PlanningPage';
import type { PlanningWorkspaceDetail } from '../types';

vi.mock('../services/api', () => ({
  api: {
    planningWorkspaces: vi.fn(),
    planningWorkspace: vi.fn()
  }
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function detail(
  workspaceId: string,
  workspaceName: string,
  clientName: string,
  encounters: Array<{ id: string; time: string; notes: string }>
): PlanningWorkspaceDetail {
  return {
    workspace: {
      id: workspaceId,
      name: workspaceName,
      status: 'Rascunho',
      mode: 'Manual',
      horizon_days: 60,
      notes: null,
      created_at: '2026-05-07',
      updated_at: '2026-05-07',
      published_at: null
    },
    clients: [{ company_id: `${workspaceId}-client`, company_name: clientName, priority: 0 }],
    cohorts: [
      {
        id: `${workspaceId}-cohort`,
        workspace_id: workspaceId,
        company_id: `${workspaceId}-client`,
        company_name: clientName,
        module_id: `${workspaceId}-module`,
        module_code: 'NR-10',
        module_name: 'Seguranca eletrica',
        technician_id: null,
        technician_name: null,
        published_cohort_id: null,
        name: `${clientName} NR-10`,
        status: 'Rascunho',
        delivery_mode: 'Online',
        period: 'Integral',
        notes: null,
        encounters: encounters.map((encounter, index) => ({
          id: encounter.id,
          workspace_id: workspaceId,
          planning_cohort_id: `${workspaceId}-cohort`,
          company_id: `${workspaceId}-client`,
          module_id: `${workspaceId}-module`,
          technician_id: null,
          technician_name: null,
          encounter_index: index,
          day_date: '2026-05-08',
          start_time: encounter.time,
          end_time: '12:00',
          status: 'Rascunho',
          notes: encounter.notes,
          published_cohort_id: null
        }))
      }
    ]
  };
}

describe('PlanningPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

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

  test('clears old workspace detail while the next workspace loads', async () => {
    const user = userEvent.setup();
    const nextWorkspace = createDeferred<PlanningWorkspaceDetail>();

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [
        { id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 1 },
        { id: 'pln-2', name: 'Carteira Junho', status: 'Rascunho', client_count: 1, encounter_count: 1 }
      ]
    });
    vi.mocked(api.planningWorkspace)
      .mockResolvedValueOnce(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
        { id: 'enc-1', time: '08:00', notes: 'Detalhe antigo' }
      ]))
      .mockReturnValueOnce(nextWorkspace.promise);

    render(<PlanningPage />);

    expect((await screen.findAllByText('Delta Ferramentaria')).length).toBeGreaterThan(0);
    await user.selectOptions(screen.getByLabelText(/workspace/i), 'pln-2');

    expect(screen.queryByText('Delta Ferramentaria')).not.toBeInTheDocument();
    expect(screen.queryByText('Detalhe antigo')).not.toBeInTheDocument();

    nextWorkspace.resolve(detail('pln-2', 'Carteira Junho', 'Atlas Metalurgica', [
      { id: 'enc-2', time: '09:00', notes: 'Detalhe novo' }
    ]));

    expect((await screen.findAllByText('Atlas Metalurgica')).length).toBeGreaterThan(0);
    expect(screen.getByText('Detalhe novo')).toBeInTheDocument();
  });

  test('preserves selected encounter when the same workspace detail reloads', async () => {
    const user = userEvent.setup();

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 2 }]
    });
    vi.mocked(api.planningWorkspace)
      .mockResolvedValueOnce(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
        { id: 'enc-1', time: '08:00', notes: 'Primeiro encontro' },
        { id: 'enc-2', time: '10:00', notes: 'Segundo encontro' }
      ]))
      .mockResolvedValueOnce(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
        { id: 'enc-1', time: '08:00', notes: 'Primeiro encontro atualizado' },
        { id: 'enc-2', time: '10:00', notes: 'Segundo encontro atualizado' }
      ]));

    const { rerender } = render(<PlanningPage detailReloadKey={0} />);

    await user.click(await screen.findByRole('button', { name: /10:00 - 12:00/i }));
    expect(screen.getByText('Segundo encontro')).toBeInTheDocument();

    rerender(<PlanningPage detailReloadKey={1} />);

    expect(await screen.findByText('Segundo encontro atualizado')).toBeInTheDocument();
    expect(screen.queryByText('Primeiro encontro atualizado')).not.toBeInTheDocument();
  });
});
