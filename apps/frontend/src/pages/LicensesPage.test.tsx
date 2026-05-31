import { render, screen, waitFor, within } from '@testing-library/react';
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

  test('shows 15 day alert summary counts and next expiration', async () => {
    mockedApi.licenses.mockResolvedValue({
      rows: [],
      alerts: {
        expired: [
          {
            id: 'license-expired',
            company_id: 'company-1',
            company_name: 'Cliente Teste',
            program_id: 'program-600',
            program_name: 'TopSolid Cam Essential Milling',
            user_name: 'Ana',
            module_ids: [],
            module_list: 'TopSolid Cam Essential Milling',
            license_identifier: 'LIC-EXP',
            renewal_cycle: 'Mensal',
            expires_at: '2026-05-30',
            notes: null,
            last_renewed_at: null,
            created_at: '2026-05-12',
            updated_at: '2026-05-12',
            alert_window_days: 15,
            days_until_expiration: -1,
            alert_level: 'Expirada',
            warning_message: 'Licença expirada.'
          }
        ],
        due_soon: [
          {
            id: 'license-due-soon',
            company_id: 'company-1',
            company_name: 'Cliente Teste',
            program_id: 'program-600',
            program_name: 'TopSolid Cam Essential Milling',
            user_name: 'Bruno',
            module_ids: [],
            module_list: 'TopSolid Cam Essential Milling',
            license_identifier: 'LIC-DUE',
            renewal_cycle: 'Mensal',
            expires_at: '2026-06-15',
            notes: null,
            last_renewed_at: null,
            created_at: '2026-05-12',
            updated_at: '2026-05-12',
            alert_window_days: 15,
            days_until_expiration: 15,
            alert_level: 'Atenção',
            warning_message: 'Licença vence em 15 dia(s).'
          }
        ],
        monthly_due_soon: [],
        annual_due_soon: [],
        total_attention: 2
      }
    });

    render(
      <MemoryRouter>
        <LicensesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Vencidas')).toBeInTheDocument();
    expect(screen.getByText('Vencem em até 15 dias')).toBeInTheDocument();
    expect(screen.getByText('Total em atenção')).toBeInTheDocument();
    expect(screen.getByText('Próximo vencimento')).toBeInTheDocument();
    const summary = screen.getByText('Próximo vencimento').closest('article');
    expect(summary).not.toBeNull();
    expect(within(summary as HTMLElement).getByText('15/06/2026')).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', 