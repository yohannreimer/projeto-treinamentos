import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { ProposalCatalogProductCreate } from '../services/api';
import {
  SOFTWARE_CATALOG_FAMILY_ORDER,
  type SoftwareCatalogEntry,
} from './softwareCatalog';

type SoftwareCatalogProductModalProps = {
  product: SoftwareCatalogEntry | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (product: ProposalCatalogProductCreate) => Promise<void>;
  onArchive: (product: SoftwareCatalogEntry) => Promise<void>;
};

type ProductDraft = {
  code: string;
  name: string;
  unitValueUsd: string;
  description: string;
  family: string;
  subfamily: string;
  folder: string;
  isPrimary: boolean;
};

function draftFromProduct(product: SoftwareCatalogEntry | null): ProductDraft {
  return {
    code: product?.code ?? '',
    name: product?.name ?? '',
    unitValueUsd: product ? String(product.unitValueUsd) : '',
    description: product?.description ?? '',
    family: product?.catalog?.family ?? product?.path[0] ?? 'Design',
    subfamily: product?.catalog?.subfamily ?? product?.path[1] ?? '',
    folder: product?.catalog?.folder ?? product?.path[2] ?? '',
    isPrimary: product?.catalog?.isPrimary ?? false,
  };
}

function parseUsdValue(value: string): number {
  return Number.parseFloat(value.replace(',', '.'));
}

export function SoftwareCatalogProductModal({
  product,
  busy,
  error,
  onClose,
  onSave,
  onArchive,
}: SoftwareCatalogProductModalProps) {
  const [draft, setDraft] = useState(() => draftFromProduct(product));
  const [validationError, setValidationError] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return;
      event.preventDefault();
      if (confirmArchive) {
        setConfirmArchive(false);
      } else {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, confirmArchive, onClose]);

  function update<K extends keyof ProductDraft>(field: K, value: ProductDraft[K]) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setValidationError('');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.name.trim();
    const family = draft.family.trim();
    const subfamily = draft.subfamily.trim();
    const unitValueUsd = parseUsdValue(draft.unitValueUsd);
    if (!name || !family || !subfamily) {
      setValidationError('Preencha nome, família e subfamília.');
      return;
    }
    if (!Number.isFinite(unitValueUsd) || unitValueUsd < 0) {
      setValidationError('Informe um valor USD válido e não negativo.');
      return;
    }

    void onSave({
      code: draft.code.trim(),
      name,
      unitValueUsd,
      defaultQuantity: product?.defaultQuantity ?? 1,
      description: draft.description.trim(),
      catalog: {
        family,
        subfamily,
        folder: draft.folder.trim(),
        reviewStatus: product?.catalog?.reviewStatus ?? '',
        isPrimary: draft.isPrimary,
      },
    });
  }

  const visibleError = validationError || error;

  return (
    <div className="proposal-catalog-modal-backdrop" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-product-modal-title"
        className="proposal-catalog-modal"
      >
        <header>
          <div>
            <span>Catálogo compartilhado</span>
            <h2 id="catalog-product-modal-title">{product ? 'Editar produto' : 'Novo produto'}</h2>
          </div>
          <button
            type="button"
            aria-label="Fechar editor de produto"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <form onSubmit={submit}>
          <label className="is-wide">
            Nome
            <input
              ref={nameRef}
              aria-label="Nome"
              value={draft.name}
              onChange={(event) => update('name', event.target.value)}
            />
          </label>
          <label>
            Código
            <input
              aria-label="Código"
              value={draft.code}
              onChange={(event) => update('code', event.target.value)}
            />
          </label>
          <label>
            Valor USD
            <input
              aria-label="Valor USD"
              type="number"
              min="0"
              step="0.01"
              value={draft.unitValueUsd}
              onChange={(event) => update('unitValueUsd', event.target.value)}
            />
          </label>
          <label>
            Família
            <select
              aria-label="Família"
              value={draft.family}
              onChange={(event) => update('family', event.target.value)}
            >
              {SOFTWARE_CATALOG_FAMILY_ORDER.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Subfamília
            <input
              aria-label="Subfamília"
              value={draft.subfamily}
              onChange={(event) => update('subfamily', event.target.value)}
            />
          </label>
          <label className="is-wide">
            Pasta
            <input
              aria-label="Pasta"
              value={draft.folder}
              onChange={(event) => update('folder', event.target.value)}
            />
          </label>
          <label className="is-wide">
            Descrição
            <textarea
              aria-label="Descrição"
              value={draft.description}
              onChange={(event) => update('description', event.target.value)}
            />
          </label>
          <label className="proposal-catalog-modal-check is-wide">
            <input
              type="checkbox"
              checked={draft.isPrimary}
              onChange={(event) => update('isPrimary', event.target.checked)}
            />
            Produto principal
          </label>

          {visibleError ? <p className="proposal-catalog-modal-error is-wide" role="alert">{visibleError}</p> : null}

          <footer className="is-wide">
            {product ? (
              <button
                type="button"
                className="is-danger"
                disabled={busy}
                onClick={() => setConfirmArchive(true)}
              >
                Excluir produto
              </button>
            ) : <span />}
            <button type="button" disabled={busy} onClick={onClose}>Cancelar</button>
            <button type="submit" disabled={busy}>{product ? 'Salvar alterações' : 'Criar produto'}</button>
          </footer>
        </form>

        {confirmArchive && product ? (
          <div role="alertdialog" aria-label="Confirmar exclusão do produto">
            <strong>Ocultar este produto?</strong>
            <p>O produto sairá do catálogo ativo, mas continuará nas propostas antigas.</p>
            <div>
              <button type="button" disabled={busy} onClick={() => setConfirmArchive(false)}>Cancelar</button>
              <button type="button" className="is-danger" disabled={busy} onClick={() => void onArchive(product)}>
                Ocultar produto
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
