import { describe, expect, test } from 'vitest';

import { TOPSOLID_CATALOG_PRODUCTS } from './topsolidCatalog.generated';

describe('generated TopSolid catalog', () => {
  test('contains the complete validated price list', () => {
    expect(TOPSOLID_CATALOG_PRODUCTS).toHaveLength(450);
    expect(new Set(TOPSOLID_CATALOG_PRODUCTS.map((item) => item.id)).size).toBe(450);
    expect(
      TOPSOLID_CATALOG_PRODUCTS.every(
        (item) => item.name && item.description && Number.isFinite(item.unitValueUsd),
      ),
    ).toBe(true);
    expect(TOPSOLID_CATALOG_PRODUCTS.filter((item) => item.catalog.reviewStatus === 'REVISAR')).toHaveLength(2);
  });

  test('matches the spreadsheet family counts', () => {
    const counts = TOPSOLID_CATALOG_PRODUCTS.reduce<Record<string, number>>((result, item) => {
      result[item.catalog.family] = (result[item.catalog.family] ?? 0) + 1;
      return result;
    }, {});

    expect(counts).toEqual({
      Design: 34,
      Mold: 13,
      Progress: 5,
      Electrode: 1,
      CAM: 66,
      'Wire / EDM': 4,
      Inspection: 2,
      PartCosting: 3,
      Interfaces: 84,
      'Pós-processadores': 238,
    });
  });

  test('preserves the eight matching legacy ids', () => {
    expect(
      TOPSOLID_CATALOG_PRODUCTS
        .filter((item) => /^p[1-8]$/.test(item.id))
        .map((item) => item.id)
        .sort(),
    ).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
  });
});
