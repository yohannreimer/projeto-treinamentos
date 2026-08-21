import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeCatalogModule, transformTopsolidRows } from './topsolidCatalogGenerator.js';

const millingRow = {
  CATEGORIA_APP: 'CAM',
  SUBCATEGORIA_APP: 'Milling',
  PASTA_APP: 'Extensões Milling',
  REFERENCIA: 'Ext/Cam M2 Milling 7 - Módulo - 0500',
  DESCRICAO: 'Fresamento',
  MOEDA: 'US$ - Padrão',
  VALOR: 5500,
  STATUS_REVISAO: '',
};

test('maps catalog rows and preserves an exact legacy product id', () => {
  const products = transformTopsolidRows([millingRow]);

  assert.deepEqual(products[0], {
    id: 'p4',
    code: '0500',
    name: 'Ext/Cam M2 Milling 7 - Módulo - 0500',
    unitValueUsd: 5500,
    defaultQuantity: 1,
    description: 'Fresamento',
    catalog: {
      family: 'CAM',
      subfamily: 'Milling',
      folder: 'Extensões Milling',
      reviewStatus: '',
    },
  });
});

test('creates deterministic ids and recognizes review rows', () => {
  const row = {
    ...millingRow,
    REFERENCIA: 'Produto sem legado - Módulo 9876',
    STATUS_REVISAO: 'REVISAR',
  };

  const first = transformTopsolidRows([row])[0];
  const second = transformTopsolidRows([row])[0];
  assert.equal(first.id, second.id);
  assert.match(first.id, /^topsolid-[a-f0-9]{12}$/);
  assert.equal(first.code, '9876');
  assert.equal(first.catalog.reviewStatus, 'REVISAR');
});

test('rejects rows without saleable fields', () => {
  assert.throws(
    () => transformTopsolidRows([{ REFERENCIA: '', DESCRICAO: '', VALOR: '' }]),
    /Linha 2/,
  );
});

test('rejects duplicate generated ids', () => {
  assert.throws(() => transformTopsolidRows([millingRow, millingRow]), /ID duplicado p4/);
});

test('serializes a typed generated module', () => {
  const output = serializeCatalogModule(transformTopsolidRows([{
    ...millingRow,
    CATEGORIA_APP: 'Design',
    SUBCATEGORIA_APP: 'PDM',
    PASTA_APP: 'PDM',
    REFERENCIA: 'TopSolid’Pdm Server 7 - Módulo - 1120',
    DESCRICAO: 'Servidor',
    VALOR: 1000,
  }]));

  assert.match(output, /satisfies SoftwareCatalogProduct\[\]/);
  assert.match(output, /"id": "p1"/);
  assert.match(output, /import type \{ SoftwareCatalogProduct \}/);
});
