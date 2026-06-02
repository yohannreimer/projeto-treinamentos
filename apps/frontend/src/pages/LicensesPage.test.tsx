import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { LicensesPage } from './LicensesPage';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    licenses: vi.fn(),
    companies: vi.fn(),
    licensePrograms: vi.fn(),
    licenseImportPreview: vi.fn(),
    createLicense: vi.fn(),
    updateLicense: vi.fn(),
    renewLicense: vi.fn(),
    deleteLicense: vi.fn()
  }
}));

const mockedApi = vi.mocked(api);

describe('LicensesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.licenses.mockResolvedValue({
      rows: [],
      alerts: {
        expired: [],
        due_soon: [],
        monthly_due_soon: [],
        annual_due_soon: [],
        total_attention: 0
      }
    });
    mockedApi.companies.mockResolvedValue([{ id: 'company-1', name: 'Cliente Teste' }]);
    mockedApi.licensePrograms.mockResolvedValue([
      {
        id: 'program-600',
        name: 'TopSolid Cam Essential Milling',
        topsolid_kind: 'Group',
        topsolid_code: '600',
        notes: null,
        created_at: '2026-05-12',
        updated_at: '2026-05-12',
        usage_count: 0
      }
    ]);
  });

  test('applies a single TopSolid import preview to the license form', async () => {
    mockedApi.licenseImportPreview.mockResolvedValue({
      groups: [
        {
          expires_at: '2026-06-30',
          item_count: 1,
          matched_count: 1,
          unmatched_count: 0,
          matched_programs: [
            {
              id: 'program-600',
              name: 'TopSolid Cam Essential Milling',
              topsolid_kind: 'Group',
              topsolid_code: '600',
              imported_kind: 'Group',
              imported_code: '600',
              imported_name: "TopSolid'Cam Essential Milling"
            }
          ],
          unmatched_items: []
        }
      ],
      summary: {
        parsed_lines: 1,
        ignored_lines: 0,
        group_count: 1,
        matched_programs: 1,
        unmatched_items: 0
      }
    });

    render(
      <MemoryRouter>
        <LicensesPage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Expandir cadastro de licença' }));
    await userEvent.type(screen.getByPlaceholderText('Cole aqui o conteúdo do arquivo TopSolid...'), 'Group:600');
    await userEvent.click(screen.getByRole('button', { name: 'Analisar' }));

    await waitFor(() => {
      expect(screen.getByLabelText('TopSolid Cam Essential Milling')).toBeChecked();
    });
    expect(screen.getByLabelText('Vencimento')).toHaveValue('2026-06-30');
    expect(screen.getByText('1 programa(s) encontrados')).toBeInTheDocument();
  });

  test('editing a license selects all programs from codes stored in the package list', async () => {
    mockedApi.licenses.mockResolvedValue({
      rows: [
        {
          id: 'license-1',
          company_id: 'company-1',
          company_name: 'Cliente Teste',
          program_id: 'program-520',
          program_name: "(520) Ext/TopSolid'Cam M2+M3 Milling",
          user_name: 'Eduardo',
          module_ids: [],
          module_list: "Ext/TopSolid'CAM M2+M3 Milling (520) | Ext/TopSolid'Electrode (1320)",
          license_identifier: 'LIC-123',
          renewal_cycle: 'Mensal',
          expires_at: '2026-04-16',
          notes: null,
          last_renewed_at: null,
          created_at: '2026-05-12',
          updated_at: '2026-05-12',
          alert_window_days: 7,
          days_until_expiration: -27,
          alert_level: 'Expirada',
          warning_message: 'Licença expirada há 27 dia(s).'
        }
      ],
      alerts: {
        expired: [],
        due_soon: [],
        monthly_due_soon: [],
        annual_due_soon: [],
        total_attention: 0
      }
    });
    mockedApi.licensePrograms.mockResolvedValue([
      {
        id: 'program-520',
        name: "(520) Ext/TopSolid'Cam M2+M3 Milling",
        topsolid_kind: null,
        topsolid_code: null,
        notes: null,
        created_at: '2026-05-12',
        updated_at: '2026-05-12',
        usage_count: 0
      },
      {
        id: 'program-1320',
        name: "(1320) Ext/TopSolid'Electrode",
        topsolid_kind: null,
        topsolid_code: null,
        notes: null,
        created_at: '2026-05-12',
        updated_at: '2026-05-12',
        usage_count: 0
      }
    ]);

    render(
      <MemoryRouter>
        <LicensesPage />
      </MemoryRouter>
    );

    await screen.findByText('Eduardo');
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(screen.getByLabelText("(520) Ext/TopSolid'Cam M2+M3 Milling")).toBeChecked();
    expect(screen.getByLabelText("(1320) Ext/TopSolid'Electrode")).toBeChecked();
    expect(screen.queryByText('Programa principal')).not.toBeInTheDocument();
  });
});
