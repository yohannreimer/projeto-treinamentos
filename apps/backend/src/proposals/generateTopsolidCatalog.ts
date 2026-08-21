import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import XLSX from 'xlsx';

import { serializeCatalogModule, transformTopsolidRows } from './topsolidCatalogGenerator.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const input = argument('--input');
if (!input) {
  throw new Error('Informe --input com o caminho absoluto da planilha TopSolid.');
}

const defaultOutput = fileURLToPath(new URL('../../../frontend/src/proposals/topsolidCatalog.generated.ts', import.meta.url));
const output = resolve(argument('--output') ?? defaultOutput);
const workbook = XLSX.readFile(resolve(input));
const worksheet = workbook.Sheets.Catalogo_App;
if (!worksheet) throw new Error('A planilha não contém a aba Catalogo_App.');

const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, unknown>[];
const products = transformTopsolidRows(rows);
if (products.length !== 450) {
  throw new Error(`Esperados 450 produtos em Catalogo_App; encontrados ${products.length}.`);
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, serializeCatalogModule(products), 'utf8');
console.log(`Generated ${products.length} products at ${output}`);
