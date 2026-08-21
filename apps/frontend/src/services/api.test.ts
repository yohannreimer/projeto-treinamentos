import { beforeEach, describe, expect, test, vi } from 'vitest';

import { internalSessionStore } from '../auth/session';
import type { ProposalDocumentV1 } from '../proposals/proposalDocument';
import { api, createInternalAuthHeaders } from './api';

beforeEach(() => {
  const storage = {
    clear: vi.fn(),
    getItem: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn()
  };
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: storage, configurable: true });
});

describe('createInternalAuthHeaders', () => {
  test('adds bearer token from the internal session', () => {
    vi.spyOn(internalSessionStore, 'read').mockReturnValue({
      token: 'token-certificado',
      expires_at: '2099-01-01T00:00:00.000Z',
      user: {
        id: 'user-1',
        username: 'tester',
        display_name: 'Tester',
        role: 'supremo',
        permissions: ['cohorts']
      }
    });

    const headers = createInternalAuthHeaders();

    expect(headers.get('Authorization')).toBe('Bearer token-certificado');
  });
});

describe('companyModuleCertificateUrl', () => {
  test('builds the journey certificate URL for a company module', () => {
    const url = api.companyModuleCertificateUrl('company-1', 'module-7', {
      download: true,
      format: 'pdf',
      technicianId: 'tech-2'
    });

    expect(url).toBe('http://localhost:4000/companies/company-1/modules/module-7/certificate?format=pdf&download=1&technician_id=tech-2');
  });
});

describe('proposal api', () => {
  test('creates and updates a proposal with JSON requests', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'proposal-1', updated_at: '2026-08-17T12:00:00.000Z'
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'proposal-1', updated_at: '2026-08-17T12:05:00.000Z'
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const document = { version: 1 } as ProposalDocumentV1;

    await api.createProposal({ number: 'P1', client_company_name: 'Cliente', document });
    await api.updateProposal('proposal-1', { number: 'P1', client_company_name: 'Cliente', document });

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:4000/proposals');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:4000/proposals/proposal-1');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PUT' });
  });

  test('uses the shared catalog endpoints', async () => {
    const service = {
      id: 'service-1', code: 'MOD-X', name: 'Módulo X', valuePerDay: 1500,
      defaultDurationDays: 2, description: 'Sob medida', custom: true
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [service] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(service), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.proposalCatalogServices();
    await api.createProposalCatalogService({
      code: 'MOD-X', name: 'Módulo X', valuePerDay: 1500,
      defaultDurationDays: 2, description: 'Sob medida'
    });

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:4000/proposals/catalog/services');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' });
  });

  test('uses shared product catalog endpoints', async () => {
    const product = {
      id: 'p3',
      code: '0030',
      name: 'Design Pro',
      unitValueUsd: 9000,
      defaultQuantity: 1,
      description: '',
      custom: false,
      catalog: {
        family: 'Design',
        subfamily: "TopSolid'Design",
        folder: 'Pacotes Design',
        reviewStatus: '' as const,
        isPrimary: true,
      },
    };
    const record = {
      id: 'p3',
      source: 'official' as const,
      archived: false,
      updatedAt: '2026-08-21T12:00:00.000Z',
      product,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [record] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(record), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...record, archived: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.proposalCatalogProducts();
    await api.updateProposalCatalogProduct('p3', { source: 'official', product });
    await api.archiveProposalCatalogProduct('p3', { source: 'official', product });

    expect(fetchMock.mock.calls.map((call) => [call[0], call[1]?.method])).toEqual([
      ['http://localhost:4000/proposals/catalog/products', undefined],
      ['http://localhost:4000/proposals/catalog/products/p3', 'PUT'],
      ['http://localhost:4000/proposals/catalog/products/p3', 'DELETE'],
    ]);
  });
});
