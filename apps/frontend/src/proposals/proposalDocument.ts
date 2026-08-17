import type { ProposalProduct, ProposalService } from './proposalData';
import type { ProposalRepresentative, ProposalServiceEdits } from './proposalStorage';

export type ClientFields = {
  companyName: string;
  address: string;
  cep: string;
  cnpj: string;
  contact: string;
  email: string;
};

export type ProposalFields = {
  number: string;
  date: string;
  validityDays: string;
  modality: string;
};

export type ProposalProductSessionEdit = {
  name: string;
  unitValueUsd: number;
  quantity: number;
  description: string;
  maintenanceEnabled: boolean;
  maintenancePercent: number;
  maintenanceYears: number;
};

export type ProposalProductSessionEdits = Record<string, ProposalProductSessionEdit>;

export type ProposalProductSnapshot = ProposalProduct & {
  quantity: number;
  maintenanceEnabled: boolean;
  maintenancePercent: number;
  maintenanceYears: number;
};

export type ProposalDocumentV1 = {
  version: 1;
  client: ClientFields;
  proposal: ProposalFields;
  selectedServiceIds: string[];
  selectedProductIds: string[];
  serviceSnapshots: ProposalService[];
  productSnapshots: ProposalProductSnapshot[];
  proposalCustomServices: ProposalService[];
  proposalCustomProducts: ProposalProduct[];
  proposalServiceEdits: ProposalServiceEdits;
  proposalProductEdits: ProposalProductSessionEdits;
  taxPercent: string;
  exchangeRate: string;
  softwareDiscountPercent: string;
  discountPercent: string;
  targetTotal: string;
  selectedRepresentative: ProposalRepresentative | null;
  includeRequirementsTerm: boolean;
  snapToTarget: boolean;
  serviceTargetTotal: number | null;
  observations: string;
};

export type RestoredProposalDocument = Omit<ProposalDocumentV1, 'selectedServiceIds' | 'selectedProductIds'> & {
  selectedServiceIds: Set<string>;
  selectedProductIds: Set<string>;
};

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export function restoreProposalDocument(
  document: ProposalDocumentV1,
  availableServices: ProposalService[],
  availableProducts: ProposalProduct[]
): RestoredProposalDocument {
  const serviceIds = new Set(availableServices.map((item) => item.id));
  const productIds = new Set(availableProducts.map((item) => item.id));
  const missingServices = document.serviceSnapshots.filter((item) => !serviceIds.has(item.id));
  const missingProducts = document.productSnapshots.filter((item) => !productIds.has(item.id));
  const snapshotServiceEdits: ProposalServiceEdits = Object.fromEntries(
    document.serviceSnapshots.map((item) => [item.id, {
      name: item.name,
      valuePerDay: item.valuePerDay,
      durationDays: item.defaultDurationDays,
      description: item.description
    }])
  );
  const snapshotProductEdits: ProposalProductSessionEdits = Object.fromEntries(
    document.productSnapshots.map((item) => [item.id, {
      name: item.name,
      unitValueUsd: item.unitValueUsd,
      quantity: item.quantity,
      description: item.description,
      maintenanceEnabled: item.maintenanceEnabled,
      maintenancePercent: item.maintenancePercent,
      maintenanceYears: item.maintenanceYears
    }])
  );

  return {
    ...document,
    selectedServiceIds: new Set(document.selectedServiceIds),
    selectedProductIds: new Set(document.selectedProductIds),
    proposalCustomServices: uniqueById([...document.proposalCustomServices, ...missingServices]),
    proposalCustomProducts: uniqueById([...document.proposalCustomProducts, ...missingProducts]),
    proposalServiceEdits: { ...snapshotServiceEdits, ...document.proposalServiceEdits },
    proposalProductEdits: { ...snapshotProductEdits, ...document.proposalProductEdits }
  };
}
