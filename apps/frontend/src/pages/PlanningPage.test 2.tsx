import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from '../services/api';
import { encounterGridStyle, PlanningPage } from './PlanningPage';
import type { PlanningWorkspaceDetail } from '../types';

vi.mock('../services/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    body: unknown;

    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = 'ApiRequestError';
      this.status = status;
      this.body = body;
    }
  },
  api: {
    companies: vi.fn(),
    modules: vi.fn(),
    technicians: vi.fn(),
    planningWorkspaces: vi.fn(),
    planningWorkspace: vi.fn(),
    createPlanningWorkspace: vi.fn(),
    addPlanningWorkspaceClients: vi.fn(),
    removePlanningWorkspaceClient: vi.fn(),
    createPlanningCohort: vi.fn(),
    addPlanningCohortEncounters: vi.fn(),
    planningSuggestions: vi.fn(),
    updatePlanningEncounter: vi.fn(),
    validatePlanningWorkspace: vi.fn(),
    publishPlanningWorkspace: vi.fn(),
    calendar: vi.fn(),
    calendarActivities: vi.fn()
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
  encounters: Array<{ id: string; time: string; notes: string; dayDate?: string; allocated?: boolean }>
): PlanningWorkspaceDetail {
  const hasAllocatedEncounter = encounters.some((encounter) => encounter.allocated !== false);
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
        technician_id: hasAllocatedEncounter ? 'tech-1' : null,
        technician_name: hasAllocatedEncounter ? 'Ana' : null,
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
          technician_id: encounter.allocated === false ? null : 'tech-1',
          technician_name: encounter.allocated === false ? null : 'Ana',
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-05-08T12:00:00-03:00'));
    vi.resetAllMocks();
    vi.mocked(api.companies).mockResolvedValue([]);
    vi.mocked(api.modules).mockResolvedValue([]);
    vi.mocked(api.technicians).mockResolvedValue([]);
    vi.mocked(api.calendar).mockResolvedValue([]);
    vi.mocked(api.calendarActivities).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
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
    vi.mocked(api.companies).mockResolvedValue([{ id: 'comp-delta', name: 'Delta Ferramentaria' }]);
    vi.mocked(api.modules).mockResolvedValue([
      {
        id: 'mod-1',
        code: 'NR-10',
        category: 'Treinamento',
        name: 'Seguranca eletrica',
        duration_days: 2,
        profile: 'Tecnico',
        is_mandatory: 1,
        delivery_mode: 'ministrado',
        client_hours_policy: 'consome'
      }
    ]);
    vi.mocked(api.technicians).mockResolvedValue([{ id: 'tech-1', name: 'Ana' }]);

    render(<PlanningPage />);

    expect(await screen.findByText('Carteira Maio')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Delta Ferramentaria').length).toBeGreaterThan(0));
    expect(screen.getByRole('complementary', { name: 'Clientes e módulos' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Calendário de planejamento' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recolher Delta Ferramentaria|Expandir Delta Ferramentaria/i })).toBeInTheDocument();
    expect(screen.queryByText('Painel contextual')).not.toBeInTheDocument();
    expect(screen.queryByText('Montar turma')).not.toBeInTheDocument();
  });

  test('shows only workspace clients and opens a compact client picker', async () => {
    const user = userEvent.setup();

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 0 }]
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
    vi.mocked(api.companies).mockResolvedValue([
      { id: 'comp-delta', name: 'Delta Ferramentaria' },
      { id: 'comp-omega', name: 'Omega Moldes' }
    ]);
    vi.mocked(api.addPlanningWorkspaceClients).mockResolvedValue({
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
      clients: [
        { company_id: 'comp-delta', company_name: 'Delta Ferramentaria', priority: 0 },
        { company_id: 'comp-omega', company_name: 'Omega Moldes', priority: 0 }
      ],
      cohorts: []
    });

    render(<PlanningPage />);

    await waitFor(() => expect(screen.getAllByText('Delta Ferramentaria').length).toBeGreaterThan(0));
    expect(screen.queryByText('Omega Moldes')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Adicionar cliente' }));
    expect(screen.getByRole('dialog', { name: 'Selecionar clientes' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Adicionar Omega Moldes' }));

    expect(api.addPlanningWorkspaceClients).toHaveBeenCalledWith('pln-1', ['comp-omega']);
    expect(await screen.findByText('Cliente adicionado ao planejamento.')).toBeInTheDocument();
  });

  test('renders every day in 30 day planning view instead of weekly previews', async () => {
    const user = userEvent.setup();

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 1 }]
    });
    vi.mocked(api.planningWorkspace).mockResolvedValue(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'enc-1', time: '08:00', notes: 'Primeiro dia', dayDate: '2026-05-20' }
    ]));
    vi.mocked(api.technicians).mockResolvedValue([{ id: 'tech-1', name: 'Ana' }]);

    render(<PlanningPage />);

    await user.click(await screen.findByRole('button', { name: '30 dias' }));

    expect(screen.getAllByRole('region', { name: /Dia qua 20\/05/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('region', { name: /Dia qui 21\/05/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('region', { name: /Dia sex 22\/05/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('region', { name: /Dia sáb 23\/05/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('region', { name: /Dia dom 24\/05/i }).length).toBeGreaterThan(0);
  });

  test('opens module configuration in a dialog over the client rail', async () => {
    const user = userEvent.setup();

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 0 }]
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
    vi.mocked(api.companies).mockResolvedValue([{ id: 'comp-delta', name: 'Delta Ferramentaria' }]);
    vi.mocked(api.modules).mockResolvedValue([
      {
        id: 'mod-1',
        code: 'NR-10',
        category: 'Treinamento',
        name: 'Seguranca eletrica',
        duration_days: 2,
        profile: 'Tecnico',
        is_mandatory: 1,
        delivery_mode: 'ministrado',
        client_hours_policy: 'consome'
      }
    ]);
    vi.mocked(api.technicians).mockResolvedValue([{ id: 'tech-1', name: 'Ana' }]);

    render(<PlanningPage />);

    await user.click(await screen.findByRole('button', { name: /Seguranca eletrica/i }));

    const panel = screen.getByRole('dialog', { name: 'Configurar módulo' });
    expect(panel).toHaveTextContent('Delta Ferramentaria');
    expect(panel).toHaveTextContent('Seguranca eletrica');
    expect(screen.getByLabelText('Período')).toBeInTheDocument();
    expect(screen.getByLabelText('Encontros')).toBeInTheDocument();
    expect(screen.getByLabelText('Técnico')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerar encontros' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar configuração do módulo' })).toBeInTheDocument();
  });

  test('allows collapsing every client and removing a client from the workspace', async () => {
    const user = userEvent.setup();

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 0 }]
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
    vi.mocked(api.companies).mockResolvedValue([{ id: 'comp-delta', name: 'Delta Ferramentaria' }]);
    vi.mocked(api.modules).mockResolvedValue([
      {
        id: 'mod-1',
        code: 'NR-10',
        category: 'Treinamento',
        name: 'Seguranca eletrica',
        duration_days: 2,
        profile: 'Tecnico',
        is_mandatory: 1,
        delivery_mode: 'ministrado',
        client_hours_policy: 'consome'
      }
    ]);
    vi.mocked(api.removePlanningWorkspaceClient).mockResolvedValue({
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
      clients: [],
      cohorts: []
    });

    render(<PlanningPage />);

    const clientHeader = await screen.findByRole('button', { name: 'Recolher Delta Ferramentaria' });
    await user.click(clientHeader);

    expect(screen.queryByRole('button', { name: /Seguranca eletrica/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expandir Delta Ferramentaria' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remover Delta Ferramentaria do planejamento' }));

    expect(api.removePlanningWorkspaceClient).toHaveBeenCalledWith('pln-1', 'comp-delta');
    expect(await screen.findByText('Cliente removido do planejamento.')).toBeInTheDocument();
  });

  test('opens publish confirmation and blocks incomplete cohorts', async () => {
    const user = userEvent.setup();
    const initialDetail = {
      ...detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
        { id: 'ple-1', time: '10:00', notes: 'Dia 1' },
        { id: 'ple-2', time: '10:00', notes: 'Dia 2', dayDate: '2026-05-09' },
        { id: 'ple-3', time: '10:00', notes: 'Dia 3', dayDate: '2026-05-10' }
      ]),
      cohorts: detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
        { id: 'ple-1', time: '10:00', notes: 'Dia 1' },
        { id: 'ple-2', time: '10:00', notes: 'Dia 2', dayDate: '2026-05-09' },
        { id: 'ple-3', time: '10:00', notes: 'Dia 3', dayDate: '2026-05-10' }
      ]).cohorts.map((cohort) => ({ ...cohort, period: 'Meio_periodo' as const }))
    };

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 3 }]
    });
    vi.mocked(api.planningWorkspace).mockResolvedValue(initialDetail);
    vi.mocked(api.modules).mockResolvedValue([
      {
        id: 'pln-1-module',
        code: 'NR-10',
        category: 'Treinamento',
        name: 'Seguranca eletrica',
        duration_days: 2,
        profile: 'Tecnico',
        is_mandatory: 1,
        delivery_mode: 'ministrado',
        client_hours_policy: 'consome'
      }
    ]);

    render(<PlanningPage />);

    await user.click(await screen.findByRole('button', { name: 'Publicar turmas' }));

    expect(screen.getByRole('dialog', { name: 'Confirmar publicação do planejamento' })).toBeInTheDocument();
    expect(screen.getByText(/Delta Ferramentaria.*Seguranca eletrica.*falta 1 encontro/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar publicação' })).toBeDisabled();
    expect(api.validatePlanningWorkspace).not.toHaveBeenCalled();
    expect(api.publishPlanningWorkspace).not.toHaveBeenCalled();
  });

  test('autoallocates and creates module encounters without a second generate click', async () => {
    const user = userEvent.setup();

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 0 }]
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
    vi.mocked(api.companies).mockResolvedValue([{ id: 'comp-delta', name: 'Delta Ferramentaria' }]);
    vi.mocked(api.modules).mockResolvedValue([
      {
        id: 'mod-1',
        code: 'NR-10',
        category: 'Treinamento',
        name: 'Seguranca eletrica',
        duration_days: 1,
        profile: 'Tecnico',
        is_mandatory: 1,
        delivery_mode: 'ministrado',
        client_hours_policy: 'consome'
      }
    ]);
    vi.mocked(api.technicians).mockResolvedValue([{ id: 'tech-1', name: 'Ana' }]);
    vi.mocked(api.planningSuggestions).mockResolvedValue({
      suggestions: [
        { technician_id: 'tech-1', day_date: '2026-05-11', start_time: '08:00', end_time: '12:00' },
        { technician_id: 'tech-1', day_date: '2026-05-12', start_time: '08:00', end_time: '12:00' }
      ]
    });
    vi.mocked(api.createPlanningCohort).mockResolvedValue({
      cohort: {} as never,
      encounters: [{ id: 'ple-1' } as never]
    });

    render(<PlanningPage />);

    await user.click(await screen.findByRole('button', { name: /Seguranca eletrica/i }));
    await user.click(screen.getByRole('button', { name: 'Autoalocar e gerar' }));

    expect(api.createPlanningCohort).toHaveBeenCalledWith(
      'pln-1',
      expect.objectContaining({
        technician_id: 'tech-1',
        encounters: [
          expect.objectContaining({ day_date: '2026-05-11', start_time: '08:00', end_time: '12:00' }),
          expect.objectContaining({ day_date: '2026-05-12', start_time: '08:00', end_time: '12:00' })
        ]
      })
    );
  });

  test('manual generate creates pending encounters outside the calendar and blocks publish until allocated', async () => {
    const user = userEvent.setup();
    const initialDetail: PlanningWorkspaceDetail = {
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
    };
    const refreshedDetail: PlanningWorkspaceDetail = {
      ...initialDetail,
      cohorts: [
        {
          id: 'cohort-1',
          workspace_id: 'pln-1',
          company_id: 'comp-delta',
          company_name: 'Delta Ferramentaria',
          module_id: 'mod-1',
          module_code: 'NR-10',
          module_name: 'Seguranca eletrica',
          technician_id: null,
          technician_name: null,
          published_cohort_id: null,
          name: 'Delta Ferramentaria · NR-10',
          status: 'Rascunho',
          delivery_mode: 'Online',
          period: 'Meio_periodo',
          notes: null,
          encounters: [
            {
              id: 'ple-1',
              workspace_id: 'pln-1',
              planning_cohort_id: 'cohort-1',
              company_id: 'comp-delta',
              module_id: 'mod-1',
              technician_id: null,
              technician_name: null,
              encounter_index: 1,
              day_date: '2026-05-08',
              start_time: '08:00',
              end_time: '12:00',
              status: 'Rascunho',
              notes: null,
              published_cohort_id: null
            },
            {
              id: 'ple-2',
              workspace_id: 'pln-1',
              planning_cohort_id: 'cohort-1',
              company_id: 'comp-delta',
              module_id: 'mod-1',
              technician_id: null,
              technician_name: null,
              encounter_index: 2,
              day_date: '2026-05-08',
              start_time: '08:00',
              end_time: '12:00',
              status: 'Rascunho',
              notes: null,
              published_cohort_id: null
            }
          ]
        }
      ]
    };

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 0 }]
    });
    vi.mocked(api.planningWorkspace)
      .mockResolvedValueOnce(initialDetail)
      .mockResolvedValueOnce(refreshedDetail);
    vi.mocked(api.companies).mockResolvedValue([{ id: 'comp-delta', name: 'Delta Ferramentaria' }]);
    vi.mocked(api.modules).mockResolvedValue([
      {
        id: 'mod-1',
        code: 'NR-10',
        category: 'Treinamento',
        name: 'Seguranca eletrica',
        duration_days: 1,
        profile: 'Tecnico',
        is_mandatory: 1,
        delivery_mode: 'ministrado',
        client_hours_policy: 'consome'
      }
    ]);
    vi.mocked(api.technicians).mockResolvedValue([{ id: 'tech-1', name: 'Ana' }]);
    vi.mocked(api.createPlanningCohort).mockResolvedValue({
      cohort: refreshedDetail.cohorts[0],
      encounters: refreshedDetail.cohorts[0].encounters
    });

    render(<PlanningPage />);

    await user.click(await screen.findByRole('button', { name: /Seguranca eletrica/i }));
    await user.click(screen.getByRole('button', { name: 'Gerar encontros' }));

    expect(api.createPlanningCohort).toHaveBeenCalledWith(
      'pln-1',
      expect.objectContaining({
        technician_id: null,
        encounters: [
          expect.objectContaining({ day_date: '2026-05-08', start_time: '08:00', end_time: '12:00' }),
          expect.objectContaining({ day_date: '2026-05-08', start_time: '08:00', end_time: '12:00' })
        ]
      })
    );
    expect((await screen.findAllByRole('button', { name: /Pendente.*08:00-12:00/i })).length).toBe(2);
    expect(screen.queryByRole('button', { name: /08:00 - 12:00.*Delta Ferramentaria/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Publicar turmas' }));

    expect(screen.getByRole('dialog', { name: 'Confirmar publicação do planejamento' })).toHaveTextContent('sem encaixe');
  });

  test('delete sends an allocated encounter back to the pending module list', async () => {
    const user = userEvent.setup();
    const pendingDetail = detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'ple-1', time: '10:00', notes: 'Pendente de novo', allocated: false }
    ]);

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 1 }]
    });
    vi.mocked(api.planningWorkspace).mockResolvedValue(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'ple-1', time: '10:00', notes: 'Alocado' }
    ]));
    vi.mocked(api.updatePlanningEncounter).mockResolvedValue(pendingDetail);

    render(<PlanningPage />);

    await user.click(screen.getByRole('button', { name: 'Semana' }));
    await user.click(await screen.findByRole('button', { name: /10:00 - 12:00/i }));
    fireEvent.keyDown(window, { key: 'Delete' });

    expect(api.updatePlanningEncounter).toHaveBeenCalledWith(
      'pln-1',
      'ple-1',
      expect.objectContaining({ technician_id: null, status: 'Rascunho' })
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Encontro voltou para pendentes');
  });

  test('renders calendar activities as blocked time in planning maps', async () => {
    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 0 }]
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
      clients: [],
      cohorts: []
    });
    vi.mocked(api.technicians).mockResolvedValue([{ id: 'tech-1', name: 'Ana' }]);
    vi.mocked(api.calendarActivities).mockResolvedValue([
      {
        id: 'act-1',
        title: 'Visita externa',
        activity_type: 'Visita_cliente',
        start_date: '2026-05-08',
        end_date: '2026-05-08',
        selected_dates_raw: '2026-05-08',
        day_schedules_raw: '2026-05-08|0|09:00|11:00',
        all_day: 0,
        start_time: '09:00',
        end_time: '11:00',
        technician_ids_raw: 'tech-1',
        technician_names: 'Ana',
        technician_colors: '',
        primary_technician_calendar_color: null,
        company_id: null,
        company_name: null,
        linked_module_id: null,
        hours_scope: 'none',
        status: 'Planejada',
        notes: null,
        created_at: '2026-05-07',
        updated_at: '2026-05-07'
      }
    ]);

    render(<PlanningPage />);

    expect(await screen.findByRole('button', { name: /Atividade.*09:00 - 11:00.*Visita externa/i })).toBeInTheDocument();
  });

  test('renders published calendar cohorts as external blockers in planning maps', async () => {
    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 0 }]
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
    vi.mocked(api.technicians).mockResolvedValue([{ id: 'tech-1', name: 'Ana' }]);
    vi.mocked(api.calendar).mockResolvedValue([
      {
        id: 'coh-existing',
        code: 'PLAN-LFV8M-01',
        name: 'PLAN-LFV8M-01 - Smoke Planejar Codex',
        status: 'Confirmada',
        technician_id: 'tech-1',
        technician_name: 'Ana',
        company_ids: 'comp-delta',
        company_names: 'Delta Ferramentaria',
        module_names: 'Treinamento TopSolid Design Basico',
        start_date: '2026-05-20',
        start_time: '10:00',
        end_time: '14:00',
        total_duration_days: 1,
        schedule_days_raw: '1::2026-05-20::10:00::14:00'
      }
    ]);

    render(<PlanningPage />);

    expect(await screen.findByRole('button', { name: /Turma.*10:00 - 14:00.*Delta Ferramentaria.*Design Basico.*Ana/i })).toBeInTheDocument();
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
    await user.selectOptions(screen.getByRole('combobox', { name: 'Planejamento' }), 'pln-2');

    expect(screen.queryByText('Delta Ferramentaria')).not.toBeInTheDocument();
    expect(screen.queryByText('Detalhe antigo')).not.toBeInTheDocument();

    nextWorkspace.resolve(detail('pln-2', 'Carteira Junho', 'Atlas Metalurgica', [
      { id: 'enc-2', time: '09:00', notes: 'Detalhe novo' }
    ]));

    expect((await screen.findAllByText('Atlas Metalurgica')).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Detalhe novo')).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: 'Semana' }));
    await user.click(await screen.findByRole('button', { name: /10:00 - 12:00/i }));
    expect(screen.getByDisplayValue('Segundo encontro')).toBeInTheDocument();

    rerender(<PlanningPage detailReloadKey={1} />);

    expect(await screen.findByDisplayValue('Segundo encontro atualizado')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Primeiro encontro atualizado')).not.toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: 'Semana' }));
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
    expect(screen.getByDisplayValue('Data ajustada pelo retorno')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /10:00 - 12:00/i })).not.toBeInTheDocument();
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

    await user.click(await screen.findByRole('button', { name: 'Publicar turmas' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar publicação' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Publicado: 0 criada');

    await user.click(screen.getByRole('button', { name: 'Semana' }));
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
    await user.click(screen.getByRole('button', { name: 'Publicar turmas' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar publicação' }));

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

    await user.click(await screen.findByRole('button', { name: 'Publicar turmas' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar publicação' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Planejamento' }), 'pln-2');

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
    vi.mocked(api.validatePlanningWorkspace).mockResolvedValue({
      ok: false,
      conflicts: [{
        planning_encounter_id: 'ple-1',
        source_type: 'cohort',
        title: 'Turma já publicada',
        day_date: '2026-05-08',
        start_time: '10:00',
        end_time: '12:00'
      }]
    });

    render(<PlanningPage />);

    await user.click(await screen.findByRole('button', { name: 'Publicar turmas' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar publicação' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Esse técnico já tem a turma "Turma já publicada" em 08/05, das 10:00 às 12:00.');
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

    await user.click(screen.getByRole('button', { name: 'Semana' }));
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

  test('locks selected encounter editing and publishing while save is in flight', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Semana' }));
    await user.click(await screen.findByRole('button', { name: /10:00 - 12:00/i }));
    await user.click(screen.getByRole('button', { name: 'Salvar encontro' }));

    expect(screen.getByLabelText('Data')).toBeDisabled();
    expect(screen.getByLabelText('Início')).toBeDisabled();
    expect(screen.getByLabelText('Fim')).toBeDisabled();
    expect(screen.getByLabelText('Status')).toBeDisabled();
    expect(screen.getByLabelText('Observações')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Aguardando salvamento' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Aguardando salvamento' }));
    expect(api.validatePlanningWorkspace).not.toHaveBeenCalled();

    saveRequest.resolve(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'ple-1', time: '10:00', notes: 'Salvo', dayDate: '2026-05-08' }
    ]));
    expect(await screen.findByRole('status')).toHaveTextContent('Encontro atualizado');
  });

  test('moves an encounter to another day from the weekly board', async () => {
    const user = userEvent.setup();

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 1 }]
    });
    vi.mocked(api.planningWorkspace).mockResolvedValue(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'ple-1', time: '10:00', notes: 'Mover data', dayDate: '2026-05-08' }
    ]));
    vi.mocked(api.updatePlanningEncounter).mockResolvedValue(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'ple-1', time: '10:00', notes: 'Mover data', dayDate: '2026-05-10' }
    ]));

    render(<PlanningPage />);

    await user.click(screen.getByRole('button', { name: 'Semana' }));
    const rangeStartBeforeMove = (screen.getByLabelText('Data inicial da agenda') as HTMLInputElement).value;
    const source = await screen.findByRole('button', { name: /10:00 - 12:00/i });
    const targetDay = screen.getByRole('region', { name: /Dia dom 10\/05/i });
    const dataTransfer = {
      data: {} as Record<string, string>,
      effectAllowed: '',
      setData(type: string, value: string) {
        this.data[type] = value;
      },
      getData(type: string) {
        return this.data[type] ?? '';
      }
    };

    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.drop(targetDay, { dataTransfer });

    expect(api.updatePlanningEncounter).toHaveBeenCalledWith(
      'pln-1',
      'ple-1',
      expect.objectContaining({ day_date: '2026-05-10', start_time: '10:00', end_time: '12:00' })
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Encontro encaixado');
    expect(screen.getByLabelText('Data')).toHaveValue('2026-05-10');
    expect(screen.getByLabelText('Data inicial da agenda')).toHaveValue(rangeStartBeforeMove);
  });

  test('moves only the dragged pending encounter onto the calendar', async () => {
    const user = userEvent.setup();
    const pendingDetail = detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'ple-1', time: '08:00', notes: 'Pendente 1', allocated: false },
      { id: 'ple-2', time: '08:00', notes: 'Pendente 2', allocated: false }
    ]);
    const updatedDetail = detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'ple-1', time: '08:00', notes: 'Pendente 1', dayDate: '2026-05-10' },
      { id: 'ple-2', time: '08:00', notes: 'Pendente 2', allocated: false }
    ]);

    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 2 }]
    });
    vi.mocked(api.planningWorkspace).mockResolvedValue(pendingDetail);
    vi.mocked(api.modules).mockResolvedValue([
      {
        id: 'pln-1-module',
        code: 'NR-10',
        category: 'Treinamento',
        name: 'Seguranca eletrica',
        duration_days: 1,
        profile: 'Tecnico',
        is_mandatory: 1,
        delivery_mode: 'ministrado',
        client_hours_policy: 'consome'
      }
    ]);
    vi.mocked(api.technicians).mockResolvedValue([{ id: 'tech-1', name: 'Ana' }]);
    vi.mocked(api.updatePlanningEncounter).mockResolvedValue(updatedDetail);

    render(<PlanningPage />);

    await user.click(screen.getByRole('button', { name: 'Semana' }));
    await user.click(await screen.findByRole('button', { name: /Seguranca eletrica/i }));
    const source = (await screen.findAllByRole('button', { name: /Pendente.*08:00-12:00/i }))[0];
    const targetDay = screen.getByRole('region', { name: /Dia dom 10\/05/i });
    const dataTransfer = {
      data: {} as Record<string, string>,
      effectAllowed: '',
      setData(type: string, value: string) {
        this.data[type] = value;
      },
      getData(type: string) {
        return this.data[type] ?? '';
      }
    };

    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.drop(targetDay, { dataTransfer });

    expect(api.updatePlanningEncounter).toHaveBeenCalledTimes(1);
    expect(api.updatePlanningEncounter).toHaveBeenCalledWith(
      'pln-1',
      'ple-1',
      expect.objectContaining({ technician_id: null, day_date: '2026-05-10' })
    );
    expect(api.updatePlanningEncounter).not.toHaveBeenCalledWith(
      'pln-1',
      'ple-2',
      expect.anything()
    );
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

    await user.click(screen.getByRole('button', { name: 'Semana' }));
    await user.click(await screen.findByRole('button', { name: /10:00 - 12:00/i }));
    await user.click(screen.getByRole('button', { name: 'Salvar encontro' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Planejamento' }), 'pln-2');

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

    await user.click(screen.getByRole('button', { name: 'Semana' }));
    await user.click(await screen.findByRole('button', { name: /10:00 - 12:00/i }));
    await user.click(screen.getByRole('button', { name: 'Salvar encontro' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Planejamento' }), 'pln-2');

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

    await user.click(screen.getByRole('button', { name: 'Semana' }));
    await user.click(await screen.findByRole('button', { name: /10:00 - 12:00/i }));
    await user.click(screen.getByRole('button', { name: 'Salvar encontro' }));
    fireEvent.click(screen.getByRole('button', { name: /14:00 - 12:00/i }));

    expect(screen.getByDisplayValue('Segundo encontro')).toBeInTheDocument();
    const blockedButtons = screen.getAllByRole('button', { name: 'Aguardando salvamento' });
    expect(blockedButtons).toHaveLength(2);
    blockedButtons.forEach((button) => expect(button).toBeDisabled());
    await user.click(blockedButtons[1]);
    expect(api.updatePlanningEncounter).toHaveBeenCalledTimes(1);

    saveRequest.resolve(detail('pln-1', 'Carteira Maio', 'Delta Ferramentaria', [
      { id: 'ple-1', time: '10:00', notes: 'Resposta atrasada' },
      { id: 'ple-2', time: '14:00', notes: 'Segundo encontro' }
    ]));

    await waitFor(() => expect(screen.queryByText('Resposta atrasada')).not.toBeInTheDocument());
    expect(screen.getByDisplayValue('Segundo encontro')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('encounterGridStyle maps real time to vertical layout', () => {
    expect(encounterGridStyle('10:00', '14:00')).toEqual({
      top: '20%',
      height: '40%'
    });
  });
});
