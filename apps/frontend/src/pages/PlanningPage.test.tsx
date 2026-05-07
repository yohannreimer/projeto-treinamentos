import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from '../services/api';
import { PlanningPage } from './PlanningPage';
import type { PlanningWorkspaceDetail } from '../types';

vi.mock('../services/api', () => ({
  api: {
    planningWorkspaces: vi.fn(),
    planningWorkspace: vi.fn(),
    updatePlanningEncounter: vi.fn(),
    validatePlanningWorkspace: vi.fn(),
    publishPlanningWorkspace: vi.fn()
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
  encounters: Array<{ id: string; time: string; notes: string; dayDate?: string }>
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
          day_date: encounter.dayDate ?? '2026-05-08',
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

  test('updates selected encounter from context panel and syncs returned detail', async () => {
    const user = userEvent.setup();

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Publicado', client_count: 1, encounter_count: 1 }]
    });
    vi.mocked(api.planningWorkspace).mockResolvedValue({
      workspace: {
        id: 'pln-1',
        name: 'Carteira Maio',
        status: 'Publicado',
        mode: 'Manual',
        horizon_days: 60,
        notes: null,
        created_at: '2026-05-07',
        updated_at: '2026-05-07',
        published_at: '2026-05-07'
      },
      clients: [{ company_id: 'comp-delta', company_name: 'Delta Ferramentaria', priority: 0 }],
      cohorts: [
        {
          id: 'cohort-1',
          workspace_id: 'pln-1',
          company_id: 'comp-delta',
          company_name: 'Delta Ferramentaria',
          module_id: 'module-1',
          module_code: 'NR-10',
          module_name: 'Seguranca eletrica',
          technician_id: 'tech-1',
          technician_name: 'Ana',
          published_cohort_id: null,
          name: 'Delta Ferramentaria NR-10',
          status: 'Publicado',
          delivery_mode: 'Online',
          period: 'Integral',
          notes: null,
          encounters: [
            {
              id: 'ple-1',
              workspace_id: 'pln-1',
              planning_cohort_id: 'cohort-1',
              company_id: 'comp-delta',
              module_id: 'module-1',
              technician_id: 'tech-1',
              technician_name: 'Ana',
              encounter_index: 0,
              day_date: '2026-05-08',
              start_time: '10:00',
              end_time: '14:00',
              status: 'Publicado',
              notes: null,
              published_cohort_id: null
            }
          ]
        }
      ]
    });
    vi.mocked(api.updatePlanningEncounter).mockResolvedValue(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'ple-1', time: '10:00', notes: 'Data ajustada pelo retorno', dayDate: '2026-05-15' }
    ]));

    render(<PlanningPage />);

    await user.click(await screen.findByRole('button', { name: /10:00 - 14:00/i }));
    await user.clear(screen.getByLabelText('Data'));
    await user.type(screen.getByLabelText('Data'), '2026-05-15');
    await user.click(screen.getByRole('button', { name: 'Salvar encontro' }));

    expect(api.updatePlanningEncounter).toHaveBeenCalledWith(
      'pln-1',
      'ple-1',
      expect.objectContaining({ day_date: '2026-05-15' })
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Encontro atualizado');
    expect(screen.getByLabelText('Data')).toHaveValue('2026-05-15');
    expect(screen.getByText('Data ajustada pelo retorno')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /10:00 - 12:00/i })).toHaveClass('is-selected');
  });

  test('clears stale message and shows error when encounter update fails', async () => {
    const user = userEvent.setup();

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 1 }]
    });
    vi.mocked(api.planningWorkspace).mockResolvedValue(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'ple-1', time: '10:00', notes: 'Ajustar data' }
    ]));
    vi.mocked(api.updatePlanningEncounter).mockRejectedValue(new Error('Conflito de agenda'));
    vi.mocked(api.validatePlanningWorkspace).mockResolvedValue({ ok: true, conflicts: [] });
    vi.mocked(api.publishPlanningWorkspace).mockResolvedValue({
      created_cohorts: 0,
      updated_cohorts: 1,
      encounter_count: 1,
      version_number: 2
    });

    render(<PlanningPage />);

    await user.click(await screen.findByRole('button', { name: 'Publicar alterações válidas' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Publicado: 0 criada');

    await user.click(screen.getByRole('button', { name: /10:00 - 12:00/i }));
    await user.clear(screen.getByLabelText('Data'));
    await user.type(screen.getByLabelText('Data'), '2026-05-15');
    await user.click(screen.getByRole('button', { name: 'Salvar encontro' }));

    expect(screen.queryByText(/Publicado: 0 criada/)).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Conflito de agenda');
  });

  test('validates and publishes current workspace', async () => {
    const user = userEvent.setup();
    const initialDetail = detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'ple-1', time: '10:00', notes: 'Antes de publicar' }
    ]);
    const refreshedDetail = {
      ...initialDetail,
      workspace: { ...initialDetail.workspace, status: 'Publicado' as const, published_at: '2026-05-08' },
      cohorts: initialDetail.cohorts.map((cohort) => ({
        ...cohort,
        status: 'Publicado',
        encounters: cohort.encounters.map((encounter) => ({
          ...encounter,
          status: 'Publicado' as const,
          notes: 'Depois de publicar'
        }))
      }))
    };

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 1 }]
    });
    vi.mocked(api.planningWorkspace)
      .mockResolvedValueOnce(initialDetail)
      .mockResolvedValueOnce(refreshedDetail);
    vi.mocked(api.validatePlanningWorkspace).mockResolvedValue({ ok: true, conflicts: [] });
    vi.mocked(api.publishPlanningWorkspace).mockResolvedValue({
      created_cohorts: 1,
      updated_cohorts: 0,
      encounter_count: 2,
      version_number: 1
    });

    render(<PlanningPage />);

    await screen.findByText('Carteira Maio');
    expect(await screen.findByDisplayValue('Antes de publicar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publicar alterações válidas' }));

    expect(api.validatePlanningWorkspace).toHaveBeenCalledWith('pln-1');
    expect(api.publishPlanningWorkspace).toHaveBeenCalledWith('pln-1');
    expect(api.planningWorkspace).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Publicado: 1 criada/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Depois de publicar')).toBeInTheDocument();
  });

  test('blocks duplicate workspace publish while another publish is in flight', async () => {
    const user = userEvent.setup();
    const publishRequest = createDeferred<{
      created_cohorts: number;
      updated_cohorts: number;
      encounter_count: number;
      version_number: number;
    }>();

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [
        { id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 1 },
        { id: 'pln-2', name: 'Carteira Junho', status: 'Rascunho', client_count: 1, encounter_count: 1 }
      ]
    });
    vi.mocked(api.planningWorkspace)
      .mockResolvedValueOnce(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
        { id: 'ple-1', time: '10:00', notes: 'Workspace A' }
      ]))
      .mockResolvedValueOnce(detail('pln-2', 'Carteira Junho', 'Atlas Metalurgica', [
        { id: 'ple-2', time: '09:00', notes: 'Workspace B' }
      ]));
    vi.mocked(api.validatePlanningWorkspace).mockResolvedValue({ ok: true, conflicts: [] });
    vi.mocked(api.publishPlanningWorkspace).mockReturnValue(publishRequest.promise);

    render(<PlanningPage />);

    await user.click(await screen.findByRole('button', { name: 'Publicar alterações válidas' }));
    await user.selectOptions(screen.getByLabelText(/workspace/i), 'pln-2');

    expect(await screen.findByRole('button', { name: 'Publicando...' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Publicando...' }));

    expect(api.publishPlanningWorkspace).toHaveBeenCalledTimes(1);
  });

  test('shows validation conflicts before publishing workspace', async () => {
    const user = userEvent.setup();

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 1 }]
    });
    vi.mocked(api.planningWorkspace).mockResolvedValue(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'ple-1', time: '10:00', notes: 'Ajustar data' }
    ]));
    vi.mocked(api.validatePlanningWorkspace).mockResolvedValue({ ok: false, conflicts: [{ planning_encounter_id: 'ple-1' }] });

    render(<PlanningPage />);

    await user.click(await screen.findByRole('button', { name: 'Publicar alterações válidas' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Planejamento possui 1 conflito');
    expect(api.publishPlanningWorkspace).not.toHaveBeenCalled();
  });

  test('ignores duplicate encounter saves while the first save is in flight', async () => {
    const user = userEvent.setup();
    const saveRequest = createDeferred<PlanningWorkspaceDetail>();

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 1 }]
    });
    vi.mocked(api.planningWorkspace).mockResolvedValue(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'ple-1', time: '10:00', notes: 'Ajustar data' }
    ]));
    vi.mocked(api.updatePlanningEncounter).mockReturnValue(saveRequest.promise);

    render(<PlanningPage />);

    await user.click(await screen.findByRole('button', { name: /10:00 - 12:00/i }));
    const saveButton = screen.getByRole('button', { name: 'Salvar encontro' });
    await user.dblClick(saveButton);

    expect(api.updatePlanningEncounter).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Salvando...' })).toBeDisabled();

    saveRequest.resolve(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'ple-1', time: '10:00', notes: 'Salvo', dayDate: '2026-05-08' }
    ]));

    expect(await screen.findByRole('status')).toHaveTextContent('Encontro atualizado');
  });

  test('ignores late encounter save response after workspace switch', async () => {
    const user = userEvent.setup();
    const saveRequest = createDeferred<PlanningWorkspaceDetail>();

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [
        { id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 1 },
        { id: 'pln-2', name: 'Carteira Junho', status: 'Rascunho', client_count: 1, encounter_count: 1 }
      ]
    });
    vi.mocked(api.planningWorkspace)
      .mockResolvedValueOnce(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
        { id: 'ple-1', time: '10:00', notes: 'Ajustar data' }
      ]))
      .mockResolvedValueOnce(detail('pln-2', 'Carteira Junho', 'Atlas Metalurgica', [
        { id: 'ple-2', time: '09:00', notes: 'Workspace atual' }
      ]));
    vi.mocked(api.updatePlanningEncounter).mockReturnValue(saveRequest.promise);

    render(<PlanningPage />);

    await user.click(await screen.findByRole('button', { name: /10:00 - 12:00/i }));
    await user.click(screen.getByRole('button', { name: 'Salvar encontro' }));
    await user.selectOptions(screen.getByLabelText(/workspace/i), 'pln-2');

    expect((await screen.findAllByText('Atlas Metalurgica')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Salvar encontro' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Salvando...' })).not.toBeInTheDocument();

    saveRequest.resolve(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'ple-1', time: '10:00', notes: 'Resposta atrasada' }
    ]));

    await waitFor(() => expect(screen.queryByText('Resposta atrasada')).not.toBeInTheDocument());

    expect((await screen.findAllByText('Atlas Metalurgica')).length).toBeGreaterThan(0);
    expect((screen.getAllByText('Atlas Metalurgica')).length).toBeGreaterThan(0);
  });

  test('ignores late encounter save failure after workspace switch', async () => {
    const user = userEvent.setup();
    const saveRequest = createDeferred<PlanningWorkspaceDetail>();

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [
        { id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 1 },
        { id: 'pln-2', name: 'Carteira Junho', status: 'Rascunho', client_count: 1, encounter_count: 1 }
      ]
    });
    vi.mocked(api.planningWorkspace)
      .mockResolvedValueOnce(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
        { id: 'ple-1', time: '10:00', notes: 'Ajustar data' }
      ]))
      .mockResolvedValueOnce(detail('pln-2', 'Carteira Junho', 'Atlas Metalurgica', [
        { id: 'ple-2', time: '09:00', notes: 'Workspace atual' }
      ]));
    vi.mocked(api.updatePlanningEncounter).mockReturnValue(saveRequest.promise);

    render(<PlanningPage />);

    await user.click(await screen.findByRole('button', { name: /10:00 - 12:00/i }));
    await user.click(screen.getByRole('button', { name: 'Salvar encontro' }));
    await user.selectOptions(screen.getByLabelText(/workspace/i), 'pln-2');

    expect((await screen.findAllByText('Atlas Metalurgica')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Salvar encontro' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Salvando...' })).not.toBeInTheDocument();

    saveRequest.reject(new Error('Erro atrasado'));

    await waitFor(() => expect(screen.queryByText('Erro atrasado')).not.toBeInTheDocument());
    expect((await screen.findAllByText('Atlas Metalurgica')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('ignores late encounter save response after selecting another encounter', async () => {
    const user = userEvent.setup();
    const saveRequest = createDeferred<PlanningWorkspaceDetail>();

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 2 }]
    });
    vi.mocked(api.planningWorkspace).mockResolvedValue(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'ple-1', time: '10:00', notes: 'Primeiro encontro' },
      { id: 'ple-2', time: '14:00', notes: 'Segundo encontro' }
    ]));
    vi.mocked(api.updatePlanningEncounter).mockReturnValue(saveRequest.promise);

    render(<PlanningPage />);

    await user.click(await screen.findByRole('button', { name: /10:00 - 12:00/i }));
    await user.click(screen.getByRole('button', { name: 'Salvar encontro' }));
    fireEvent.click(screen.getByRole('button', { name: /14:00 - 12:00/i }));

    expect(screen.getByDisplayValue('Segundo encontro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar encontro' })).toBeEnabled();

    saveRequest.resolve(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'ple-1', time: '10:00', notes: 'Resposta atrasada' },
      { id: 'ple-2', time: '14:00', notes: 'Segundo encontro' }
    ]));

    await waitFor(() => expect(screen.queryByText('Resposta atrasada')).not.toBeInTheDocument());
    expect(screen.getByDisplayValue('Segundo encontro')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
