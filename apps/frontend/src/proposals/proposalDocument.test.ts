import { describe, expect, test } from 'vitest';
import { restoreProposalDocument, type ProposalDocumentV1 } from './proposalDocument';

const sharedSnapshot = {
  id: 'shared-1',
  code: 'X',
  name: 'Módulo compartilhado',
  valuePerDay: 1000,
  defaultDurationDays: 2,
  description: 'Descrição',
  custom: true
};

const document: ProposalDocumentV1 = {
  version: 1,
  client: { companyName: 'Cliente', address: '', cep: '', cnpj: '', contact: '', email: '' },
  proposal: { number: 'P1', date: '2026-08-17', validityDays: '11', modality: 'Presencial' },
  selectedServiceIds: ['shared-1'],
  selectedProductIds: [],
  serviceSnapshots: [sharedSnapshot],
  productSnapshots: [],
  proposalCustomServices: [],
  proposalCustomProducts: [],
  proposalServiceEdits: {},
  proposalProductEdits: {},
  taxPercent: '12',
  exchangeRate: '5.80',
  softwareDiscountPercent: '0',
  discountPercent: '0',
  targetTotal: '54000',
  selectedRepresentative: { id: 'rep-x', name: 'João', role: 'Comercial' },
  includeRequirementsTerm: true,
  snapToTarget: false,
  serviceTargetTotal: null,
  observations: 'Obs'
};

describe('proposalDocument', () => {
  test('rehydrates a selected shared module when it no longer exists in the catalog', () => {
    const restored = restoreProposalDocument(document, [], []);

    expect(restored.proposalCustomServices).toEqual([sharedSnapshot]);
    expect([...restored.selectedServiceIds]).toEqual(['shared-1']);
    expect(restored.proposalServiceEdits['shared-1']).toEqual({
      name: 'Módulo compartilhado',
      valuePerDay: 1000,
      durationDays: 2,
      description: 'Descrição'
    });
  });

  test('does not duplicate a snapshot that still exists in the shared catalog', () => {
    const restored = restoreProposalDocument(document, [sharedSnapshot], []);
    expect(restored.proposalCustomServices).toEqual([]);
  });

  test('snapshot values override catalog defaults when reopening on another browser', () => {
    const restored = restoreProposalDocument(document, [{ ...sharedSnapshot, valuePerDay: 3000 }], []);
    expect(restored.proposalServiceEdits['shared-1'].valuePerDay).toBe(1000);
  });
});
