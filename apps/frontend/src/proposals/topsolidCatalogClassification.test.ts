import { describe, expect, test } from 'vitest';

import { TOPSOLID_CATALOG_PRODUCTS } from './topsolidCatalog.generated';
import { applyTopsolidPrimaryClassification } from './topsolidCatalogClassification';

describe('TopSolid catalog primary classification', () => {
  test('marks the four approved Design packages as primary', () => {
    const classified = applyTopsolidPrimaryClassification(TOPSOLID_CATALOG_PRODUCTS);
    const designPrimary = classified.filter(
      (item) => item.catalog.family === 'Design' && item.catalog.isPrimary,
    );

    expect(designPrimary.map((item) => item.id)).toEqual(expect.arrayContaining([
      'topsolid-d56ae13cb542',
      'topsolid-f26302408a1b',
      'topsolid-656d52c2e9e3',
      'p3',
    ]));
    expect(designPrimary).toHaveLength(4);
  });

  test('does not infer primary status from product names', () => {
    const classified = applyTopsolidPrimaryClassification(TOPSOLID_CATALOG_PRODUCTS);
    const designExtension = classified.find((item) => item.id === 'p1');

    expect(designExtension?.catalog.isPrimary).toBe(false);
  });
});
