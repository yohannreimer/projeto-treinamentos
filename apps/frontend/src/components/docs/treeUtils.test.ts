import { describe, expect, it } from 'vitest';

import {
  buildTree,
  CLIENTS_PATH,
  findNode,
  type CompanyRow,
  type InternalDocumentRow,
  type ModuleRow
} from './treeUtils';

const companies: CompanyRow[] = [
  { id: 'company-a', name: 'Agile2 Consultoria LTDA' },
  { id: 'company-b', name: 'Holand Automacao de Engenharias Ltda' }
];

const modules: ModuleRow[] = [
  { id: 'module-a', code: 'M01', name: 'Implantacao' },
  { id: 'module-b', code: 'M02', name: 'Treinamento' }
];

describe('buildTree', () => {
  it('lists only modules enabled for each client', () => {
    const tree = buildTree(companies, modules, [], [], [
      { company_id: 'company-a', module_id: 'module-a' },
      { company_id: 'company-b', module_id: 'module-b' }
    ]);

    expect(findNode(tree, `${CLIENTS_PATH}/company-a/modulos/module-a`)).not.toBeNull();
    expect(findNode(tree, `${CLIENTS_PATH}/company-a/modulos/module-b`)).toBeNull();
    expect(findNode(tree, `${CLIENTS_PATH}/company-b/modulos/module-b`)).not.toBeNull();
    expect(findNode(tree, `${CLIENTS_PATH}/company-b/modulos/module-a`)).toBeNull();
  });

  it('keeps module folders that already have client certificate documents', () => {
    const certificate: InternalDocumentRow = {
      id: 'doc-1',
      title: 'Certificado',
      category: 'Certificados',
      notes: 'Chave: CERTIFICADO_CLIENTE_MODULO:company-a:module-b:cert-1',
      folder_path: null,
      file_name: 'certificado.pdf',
      mime_type: 'application/pdf',
      file_size_bytes: 1024,
      created_at: '2026-06-15T12:00:00.000Z',
      updated_at: '2026-06-15T12:00:00.000Z'
    };

    const tree = buildTree(companies, modules, [], [certificate], [
      { company_id: 'company-a', module_id: 'module-a' }
    ]);

    const existingModule = findNode(tree, `${CLIENTS_PATH}/company-a/modulos/module-b`);
    expect(existingModule?.name).toBe('M02 · Treinamento');
    expect(findNode(tree, `${CLIENTS_PATH}/company-a/modulos/module-b/Certificados`)).not.toBeNull();
  });
});
