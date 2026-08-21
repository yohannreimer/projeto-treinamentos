import type { SoftwareCatalogProduct } from './softwareCatalog';

export const TOPSOLID_PRIMARY_PRODUCT_IDS = new Set([
  'topsolid-d56ae13cb542',
  'topsolid-f26302408a1b',
  'topsolid-656d52c2e9e3',
  'p3',
  'p8',
  'topsolid-80cc488ed480',
  'topsolid-6383b3ffa2c0',
  'topsolid-a6d9b1bb1e4f',
  'topsolid-3aea329bf720',
  'topsolid-2a03618e88ff',
  'topsolid-dd72c04603a3',
  'topsolid-ae3e904b9153',
  'topsolid-d640ad25391a',
  'topsolid-1f8a27ab3395',
  'topsolid-716515e70b77',
  'topsolid-aa0a8bb284ce',
  'topsolid-6f6750dfc4ac',
]);

export function applyTopsolidPrimaryClassification(
  products: SoftwareCatalogProduct[],
): SoftwareCatalogProduct[] {
  return products.map((product) => ({
    ...product,
    catalog: {
      ...product.catalog,
      isPrimary: TOPSOLID_PRIMARY_PRODUCT_IDS.has(product.id),
    },
  }));
}
