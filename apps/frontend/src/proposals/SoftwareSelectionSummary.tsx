import type { Ref } from 'react';

import { formatUsdCurrency } from './proposalMath';
import type { EditableProposalProduct } from './proposalData';

type SoftwareSelectionSummaryProps = {
  products: EditableProposalProduct[];
  onOpenCatalog: () => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  openButtonRef?: Ref<HTMLButtonElement>;
};

export function SoftwareSelectionSummary({
  products,
  onOpenCatalog,
  onEdit,
  onRemove,
  openButtonRef,
}: SoftwareSelectionSummaryProps) {
  return (
    <div className="proposal-software-summary">
      <div className="proposal-software-summary-heading">
        <div>
          <strong>Software selecionado</strong>
          <small>{products.length} {products.length === 1 ? 'item' : 'itens'}</small>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="proposal-software-summary-empty">Nenhum software adicionado.</p>
      ) : (
        <div className="proposal-software-summary-list">
          {products.map((product) => (
            <article key={product.id} className="proposal-software-summary-item">
              <div>
                <strong>
                  {product.code ? <span className="proposal-software-code">{product.code} – </span> : null}
                  <span>{product.displayName}</span>
                  {product.custom ? <small className="proposal-software-custom-badge">CUSTOM</small> : null}
                </strong>
                <span>
                  US$ {formatUsdCurrency(product.effectiveUnitValueUsd)} · qtd {product.quantity}
                  {product.maintenanceLabel}
                </span>
              </div>
              <div className="proposal-software-summary-actions">
                <button type="button" onClick={() => onEdit(product.id)} aria-label={`Editar ${product.displayName}`}>Editar</button>
                <button type="button" onClick={() => onRemove(product.id)} aria-label={`Remover ${product.displayName}`}>Remover</button>
              </div>
            </article>
          ))}
        </div>
      )}

      <button
        ref={openButtonRef}
        type="button"
        className="proposal-software-open-catalog"
        aria-label="Adicionar software do catálogo"
        onClick={onOpenCatalog}
      >
        + Adicionar software do catálogo
      </button>
    </div>
  );
}
