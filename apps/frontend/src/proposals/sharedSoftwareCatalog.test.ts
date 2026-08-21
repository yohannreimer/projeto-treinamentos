import { describe, expect, test } from 'vitest';

import type { SoftwareCatalogProduct } from './softwareCatalog';
import { resolveSharedSoftwareCatalog } from './sharedSoftwareCatalog';

const official: SoftwareCatalogProduct = {
  id: 'p3',
  code: '0030',
  name: 'Design Pro',
  unitValueUsd: 9000,
  defaultQuantity: 1,
  description: 'Original',
  catalog: {
    family: 'Design',
    subfamily: "TopSolid'Design",
    folder: 'Pacotes Design',
    reviewStatus: '',
    isPrimary: true,
  },
};

describe('resolveSharedSoftwareCatalog', () => {
  test('applies shared overrides and keeps archived products only in allProducts', () => {
    const result = resolveSharedSoftwareCatalog([official], [], [{
      id: official.id,
      source: 'official',
      archived: true,
      product: { ...official, name: 'Nome preservado' },
      updatedAt: '2026-08-21T12:00:00.000Z',
    }]);

    expect(result.activeProducts).toEqual([]);
    expect(result.allProducts[0].name).toBe('Nome preservado');
    expect(result.archivedIds.has('p3')).toBe(true);
  });

  test('shared records win and legacy products cannot replace official ids', () => {
    const legacyCollision = { ...official, name: 'Nome local', custom: true };
    const shared = { ...official, name: 'Nome compartilhado' };
    const result = resolveSharedSoftwareCatalog([official], [legacyCollision], [{
      id: official.id,
      source: 'official',
      archived: false,
      product: shared,
      updatedAt: '2026-08-21T12:00:00.000Z',
    }]);

    expect(result.activeProducts).toEqual([shared]);
  });

  test('keeps unique legacy products as temporary compatibility data', () => {
    const legacy = { ...official, id: 'legacy-1', name: 'Produto local', custom: true };
    const result = resolveSharedSoftwareCatalog([official], [legacy], []);

    expect(result.activeProducts.map((item) => item.id)).toEqual(['p3', 'legacy-1']);
  });
});
