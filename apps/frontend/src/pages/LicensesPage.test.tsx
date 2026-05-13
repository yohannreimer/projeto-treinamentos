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
});
