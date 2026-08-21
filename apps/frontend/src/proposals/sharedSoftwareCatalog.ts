import type { ProposalProduct } from './proposalData';
import type { ProposalCatalogProductRecord } from '../services/api';

export type ResolvedSoftwareCatalog = {
  allProducts: ProposalProduct[];
  activeProducts: ProposalProduct[];
  archivedIds: ReadonlySet<string>;
};

export function resolveSharedSoftwareCatalog(
  official: ProposalProduct[],
  legacyBrowserProducts: ProposalProduct[],
  records: ProposalCatalogProductRecord[],
): ResolvedSoftwareCatalog {
  const products = new Map(official.map((item) => [item.id, item]));
  for (const legacyProduct of legacyBrowserProducts) {
    if (!products.has(legacyProduct.id)) products.set(legacyProduct.id, legacyProduct);
  }

  const archivedIds = new Set<string>();
  for (const record of records) {
    if (record.product) products.set(record.id, record.product);
    if (record.archived) archivedIds.add(record.id);
    else archivedIds.delete(record.id);
  }

  const allProducts = [...products.values()];
  return {
    allProducts,
    activeProducts: allProducts.filter((item) => !archivedIds.has(item.id)),
    archivedIds,
  };
}
