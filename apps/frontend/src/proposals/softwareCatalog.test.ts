import { describe, expect, test } from 'vitest';

import {
  buildCatalogTree,
  displayCatalogFamily,
  displayCatalogSubfamily,
  groupSoftwareCatalogResults,
  mergeSoftwareCatalog,
  PRIMARY_SUBFAMILY,
  querySoftwareCatalog,
  SOFTWARE_CATALOG_PAGE_SIZE,
  type SoftwareCatalogProduct,
} from './softwareCatalog';

const official: SoftwareCatalogProduct[] = [
  {
    id: 'p4',
    code: '0500',
    name: 'Ext/Cam M2 Milling 7',
    unitValueUsd: 5500,
    defaultQuantity: 1,
    description: 'Fresamento de 2 ½ eixos',
    catalog: { family: 'CAM', subfamily: 'Milling', folder: 'Extensões Milling', reviewStatus: '' },
  },
  {
    id: 'official-ifc',
    code: '5072',
    name: 'IFC Exportador 7',
    unitValueUsd: 1000,
    defaultQuantity: 1,
    description: 'Exportador de interface IFC',
    catalog: { family: 'Interfaces', subfamily: 'BIM / Estruturas', folder: 'IFC / Revit / DSTV', reviewStatus: '' },
  },
];

describe('softwareCatalog', () => {
  test('searches the whole catalog without accents and reports paths', () => {
    const entries = mergeSoftwareCatalog(official, [], []);
    const result = querySoftwareCatalog(entries, {
      query: 'fresamento',
      family: 'Interfaces',
      subfamily: 'BIM / Estruturas',
      limit: 50,
    });

    expect(result.items).toEqual([
      expect.objectContaining({ id: 'p4', path: ['CAM', 'Milling', 'Extensões Milling'] }),
    ]);
  });

  test('groups custom products under Personalizados and proposal copies win by id', () => {
    const browserProduct = {
      id: 'custom-1',
      code: 'X',
      name: 'Produto local',
      unitValueUsd: 10,
      defaultQuantity: 1,
      description: '',
      custom: true,
    };
    const proposalProduct = { ...browserProduct, name: 'Produto desta proposta' };
    const entries = mergeSoftwareCatalog(official, [browserProduct], [proposalProduct]);

    expect(buildCatalogTree(entries).at(-1)).toEqual(expect.objectContaining({ name: 'Personalizados', count: 1 }));
    expect(entries.find((entry) => entry.id === 'custom-1')).toEqual(
      expect.objectContaining({ name: 'Produto desta proposta', source: 'proposal-only' }),
    );
  });

  test('uses the approved family and CAM subfamily order', () => {
    const entries = mergeSoftwareCatalog([
      ...official,
      { ...official[0], id: 'design', catalog: { ...official[0].catalog, family: 'Design', subfamily: 'PDM' } },
      { ...official[0], id: 'turning', catalog: { ...official[0].catalog, subfamily: 'Turning' } },
      { ...official[0], id: 'extensions', catalog: { ...official[0].catalog, subfamily: 'Extensões' } },
    ], [], []);
    const tree = buildCatalogTree(entries);

    expect(tree.map((family) => family.name)).toEqual(['Design', 'CAM', 'Interfaces']);
    expect(tree.find((family) => family.name === 'CAM')?.subfamilies.map((item) => item.name)).toEqual([
      PRIMARY_SUBFAMILY,
      'Milling',
      'Turning',
      'Extensões',
    ]);
    expect(displayCatalogFamily('Wire / EDM')).toBe('Wire');
    expect(displayCatalogSubfamily('CAM', 'Integrações CAM')).toBe('Integrações');
  });

  test('filters by hierarchy when search is empty', () => {
    const entries = mergeSoftwareCatalog(official, [], []);
    const result = querySoftwareCatalog(entries, {
      query: '',
      family: 'Interfaces',
      subfamily: 'BIM / Estruturas',
      folder: 'IFC / Revit / DSTV',
      limit: 50,
    });

    expect(result.items.map((item) => item.id)).toEqual(['official-ifc']);
  });

  test('returns at most fifty items before show more', () => {
    const many = Array.from({ length: 51 }, (_, index) => ({
      ...official[0],
      id: `cam-${index}`,
      name: `Milling ${index}`,
    }));
    const result = querySoftwareCatalog(mergeSoftwareCatalog(many, [], []), {
      query: '',
      family: 'CAM',
      subfamily: 'Milling',
      limit: SOFTWARE_CATALOG_PAGE_SIZE,
    });

    expect(result.items).toHaveLength(50);
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(51);
  });

  test.each(['TopSolid Design', 'TopSolid Design Standard'])(
    'matches punctuation-insensitive tokens: %s',
    (query) => {
      const designProduct: SoftwareCatalogProduct = {
        id: 'design-standard',
        code: '0020',
        name: 'TopSolid’Design Standard 7 - Módulo - 0020',
        unitValueUsd: 5000,
        defaultQuantity: 1,
        description: 'Aplicativo principal para projeto',
        catalog: {
          family: 'Design',
          subfamily: 'PDM',
          folder: 'PDM',
          reviewStatus: '',
          isPrimary: true,
        },
      };
      const result = querySoftwareCatalog(mergeSoftwareCatalog([designProduct], [], []), {
        query,
        family: 'CAM',
        subfamily: 'Milling',
        limit: 50,
      });

      expect(result.items.map((item) => item.name)).toContain(designProduct.name);
    },
  );

  test('ranks name matches before description-only matches', () => {
    const entries = mergeSoftwareCatalog([
      {
        ...official[0],
        id: 'description-match',
        name: 'Produto complementar',
        description: 'Compatível com Design',
      },
      {
        ...official[0],
        id: 'name-match',
        name: 'Design principal',
        description: '',
        catalog: { ...official[0].catalog, isPrimary: true },
      },
    ], [], []);
    const result = querySoftwareCatalog(entries, {
      query: 'design',
      family: 'Todos',
      subfamily: 'Todos',
      limit: 50,
    });

    expect(result.items.map((item) => item.id)).toEqual(['name-match', 'description-match']);
  });

  test('puts Produtos principais first and groups global results by hierarchy', () => {
    const entries = mergeSoftwareCatalog([
      {
        ...official[0],
        id: 'design-primary',
        name: 'Design principal',
        catalog: {
          family: 'Design',
          subfamily: 'PDM',
          folder: 'Pacotes',
          reviewStatus: '',
          isPrimary: true,
        },
      },
      {
        ...official[0],
        id: 'design-extension',
        name: 'Extensão Design',
        catalog: {
          family: 'Design',
          subfamily: 'Extensões',
          folder: 'Extensões',
          reviewStatus: '',
          isPrimary: false,
        },
      },
    ], [], []);
    const tree = buildCatalogTree(entries);
    const result = querySoftwareCatalog(entries, {
      query: 'design',
      family: 'Todos',
      subfamily: 'Todos',
      limit: 50,
    });
    const groups = groupSoftwareCatalogResults(result.items);

    expect(tree[0].subfamilies[0].name).toBe(PRIMARY_SUBFAMILY);
    expect(groups.map((group) => [group.family, group.subfamily])).toEqual([
      ['Design', PRIMARY_SUBFAMILY],
      ['Design', 'Extensões'],
    ]);
  });
});
