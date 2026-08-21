import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import holandLogo from "../assets/holand-horizontal.svg";
import {
  DEFAULT_EXCHANGE_RATE,
  DEFAULT_TAX_PERCENT,
  DEFAULT_VALIDITY_DAYS,
  PROPOSAL_PRODUCTS,
  PROPOSAL_SERVICES,
  SNAP_TOTAL_TARGET,
  type EditableProposalProduct,
  type ProposalProduct,
  type ProposalService,
} from "../proposals/proposalData";
import {
  addDays,
  calculateProposalTotals,
  calculateServiceDiscountForGrandTarget,
  formatCurrency,
  formatLongDate,
  formatUsdCurrency,
} from "../proposals/proposalMath";
import {
  restoreProposalDocument,
  type ClientFields,
  type ProposalDocumentV1,
  type ProposalFields,
  type ProposalProductSessionEdits,
  type RestoredProposalDocument,
} from "../proposals/proposalDocument";
import { SavedProposalsPanel } from "../proposals/SavedProposalsPanel";
import { SoftwareCatalogExplorer } from "../proposals/SoftwareCatalogExplorer";
import { SoftwareCatalogProductModal } from "../proposals/SoftwareCatalogProductModal";
import { SoftwareSelectionSummary } from "../proposals/SoftwareSelectionSummary";
import {
  mergeSoftwareCatalog,
  type SoftwareCatalogEntry,
  type SoftwareCatalogProduct,
} from "../proposals/softwareCatalog";
import { resolveSharedSoftwareCatalog } from "../proposals/sharedSoftwareCatalog";
import { applyTopsolidPrimaryClassification } from "../proposals/topsolidCatalogClassification";
import {
  loadProposalConfig,
  loadProposalCustomProducts,
  loadProposalObservations,
  loadProposalProductEdits,
  loadProposalRepresentatives,
  loadProposalServiceEdits,
  saveProposalConfig,
  saveProposalObservations,
  saveProposalRepresentatives,
  saveProposalServiceEdits,
  type ProposalConfig,
  type ProposalProductEdits,
  type ProposalRepresentative,
  type ProposalServiceEdits,
} from "../proposals/proposalStorage";
import {
  api,
  type ProposalCatalogProduct,
  type ProposalCatalogProductCreate,
  type ProposalCatalogProductRecord,
  type ProposalCatalogProductSource,
  type ProposalSummary,
} from "../services/api";

type CustomModuleDraft = {
  code: string;
  name: string;
  valuePerDay: string;
  days: string;
  description: string;
};

type CustomProductDraft = {
  code: string;
  name: string;
  unitValueUsd: string;
  description: string;
};

type RepresentativeDraft = {
  name: string;
  role: string;
};

type ActiveEditor = { kind: "product" | "service"; id: string } | null;

type CatalogProductModalState =
  | { mode: "new" }
  | { mode: "edit"; product: SoftwareCatalogEntry }
  | null;

type EditableProposalService = ProposalService & {
  displayName: string;
  durationDays: number;
  displayDescription: string;
};

type TotalsSummaryProps = {
  hasProducts: boolean;
  hasServices: boolean;
  softwareTotalUsd: number;
  softwareDiscountValue: number;
  softwareFinalTotal: number;
  serviceSubtotal: number;
  serviceTotalDays: number;
  serviceDiscountValue: number;
  taxPercent: number;
  serviceTaxValue: number;
  serviceFinalTotalDisplay: string;
  grandTotalDisplay: string;
};

type ServiceCardProps = {
  service: EditableProposalService;
  selected: boolean;
  onToggleSelected: (id: string) => void;
  onOpenEditor: (id: string) => void;
  active: boolean;
  onDeleteCustom: (id: string) => void;
};

type ProductCardProps = {
  product: EditableProposalProduct;
  selected: boolean;
  onToggleSelected: (id: string) => void;
  onOpenEditor: (id: string) => void;
  active: boolean;
  onDeleteCustom: (id: string) => void;
};

type ProposalPreviewProps = {
  client: ClientFields;
  proposal: ProposalFields;
  selectedProducts: EditableProposalProduct[];
  selectedServices: EditableProposalService[];
  observations: string;
  taxPercent: number;
  softwareDiscountPercent: number;
  discountPercent: number;
  exchangeRate: number;
  totals: ReturnType<typeof calculateProposalTotals>;
  representative: ProposalRepresentative;
  includeRequirementsTerm: boolean;
};

type ProposalAcceptanceSignaturesProps = {
  clientName: string;
  representative: ProposalRepresentative;
};

type ProposalRequirementsTermProps = ProposalAcceptanceSignaturesProps;

const EMPTY_CLIENT: ClientFields = {
  companyName: "",
  address: "",
  cep: "",
  cnpj: "",
  contact: "",
  email: "",
};

const EMPTY_CUSTOM_MODULE: CustomModuleDraft = {
  code: "",
  name: "",
  valuePerDay: "",
  days: "1",
  description: "",
};

const EMPTY_CUSTOM_PRODUCT: CustomProductDraft = {
  code: "",
  name: "",
  unitValueUsd: "",
  description: "",
};

const EMPTY_REPRESENTATIVE_DRAFT: RepresentativeDraft = {
  name: "",
  role: "",
};

const DEFAULT_REPRESENTATIVES: ProposalRepresentative[] = [
  {
    id: "leonardo_holand",
    name: "Leonardo Holand",
    role: "Diretor Comercial da Holand Automação de Engenharias Ltda",
  },
];

function createEmptyProposalDocument(
  config: Partial<ProposalConfig>,
  representative: ProposalRepresentative,
): ProposalDocumentV1 {
  return {
    version: 1,
    client: { ...EMPTY_CLIENT },
    proposal: {
      number: "P23005_OS",
      date: todayInputValue(),
      validityDays: String(DEFAULT_VALIDITY_DAYS),
      modality: "Presencial e Online",
    },
    selectedServiceIds: [],
    selectedProductIds: [],
    serviceSnapshots: [],
    productSnapshots: [],
    proposalCustomServices: [],
    proposalCustomProducts: [],
    proposalServiceEdits: {},
    proposalProductEdits: {},
    taxPercent: config.taxPercent ?? String(DEFAULT_TAX_PERCENT),
    exchangeRate: config.exchangeRate ?? String(DEFAULT_EXCHANGE_RATE.toFixed(2)),
    softwareDiscountPercent: config.softwareDiscountPercent ?? "0",
    discountPercent: "0",
    targetTotal: String(SNAP_TOTAL_TARGET),
    selectedRepresentative: representative,
    includeRequirementsTerm: false,
    snapToTarget: false,
    serviceTargetTotal: null,
    observations: loadProposalObservations(),
  };
}

function canonicalizeRestoredDocument(
  document: ProposalDocumentV1,
  restored: RestoredProposalDocument,
): ProposalDocumentV1 {
  return {
    ...document,
    proposalCustomServices: restored.proposalCustomServices,
    proposalCustomProducts: restored.proposalCustomProducts,
    proposalServiceEdits: restored.proposalServiceEdits,
    proposalProductEdits: restored.proposalProductEdits,
  };
}

function todayInputValue(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function numericValue(value: string, fallback = 0): number {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveIntegerValue(value: string, fallback = 1): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function taxLabel(value: number): string {
  return Number.isInteger(value) ? `${value},00` : value.toFixed(2).replace(".", ",");
}

function displayCodeAndName(service: EditableProposalService): string {
  return service.code ? `${service.code} - ${service.displayName}` : service.displayName;
}

function buildEditableServices(
  catalogCustomServices: ProposalService[],
  proposalCustomServices: ProposalService[],
  serviceEdits: ProposalServiceEdits,
  proposalServiceEdits: ProposalServiceEdits,
): EditableProposalService[] {
  const uniqueServices = [...new Map(
    [...PROPOSAL_SERVICES, ...catalogCustomServices, ...proposalCustomServices]
      .map((service) => [service.id, service] as const),
  ).values()];
  return uniqueServices.map((service) => {
    const catalogEdit = serviceEdits[service.id];
    const proposalEdit = proposalServiceEdits[service.id];
    const edit = proposalEdit ?? catalogEdit;
    return {
      ...service,
      displayName: edit?.name ?? service.name,
      valuePerDay: edit?.valuePerDay ?? service.valuePerDay,
      durationDays: edit?.durationDays ?? service.defaultDurationDays,
      displayDescription: edit?.description ?? service.description,
    };
  });
}

function maintenanceLabel(years: number): string {
  if (years <= 0) {
    return "";
  }
  return ` + ${years} ${years === 1 ? "ano" : "anos"} de manutenção`;
}

function catalogProductFromEntry(entry: SoftwareCatalogEntry): ProposalCatalogProduct {
  return {
    id: entry.id,
    code: entry.code,
    name: entry.name,
    unitValueUsd: entry.unitValueUsd,
    defaultQuantity: entry.defaultQuantity,
    description: entry.description,
    custom: entry.source !== "official",
    catalog: {
      family: entry.catalog?.family ?? entry.path[0],
      subfamily: entry.catalog?.subfamily ?? entry.path[1],
      folder: entry.catalog?.folder ?? entry.path[2],
      reviewStatus: entry.catalog?.reviewStatus ?? "",
      isPrimary: Boolean(entry.catalog?.isPrimary),
    },
  };
}

function buildEditableProducts(
  catalogProducts: ProposalProduct[],
  proposalCustomProducts: ProposalProduct[],
  productEdits: ProposalProductEdits,
  proposalProductEdits: ProposalProductSessionEdits,
): EditableProposalProduct[] {
  const uniqueProducts = [...new Map(
    [...catalogProducts, ...proposalCustomProducts].map((product) => [product.id, product] as const),
  ).values()];
  return uniqueProducts.map((product) => {
    const catalogEdit = productEdits[product.id];
    const proposalEdit = proposalProductEdits[product.id];
    const displayName = proposalEdit?.name ?? catalogEdit?.name ?? product.name;
    const unitValueUsd = proposalEdit?.unitValueUsd ?? catalogEdit?.unitValueUsd ?? product.unitValueUsd;
    const quantity = proposalEdit?.quantity ?? 1;
    const displayDescription = proposalEdit?.description ?? catalogEdit?.description ?? product.description;
    const maintenanceEnabled = proposalEdit?.maintenanceEnabled ?? false;
    const maintenancePercent = proposalEdit?.maintenancePercent ?? 10;
    const maintenanceYears = proposalEdit?.maintenanceYears ?? 1;
    const effectiveUnitValueUsd = maintenanceEnabled
      ? unitValueUsd + unitValueUsd * (Math.max(maintenancePercent, 0) / 100) * Math.max(maintenanceYears, 0)
      : unitValueUsd;

    return {
      ...product,
      displayName,
      unitValueUsd,
      quantity,
      displayDescription,
      maintenanceEnabled,
      maintenancePercent,
      maintenanceYears,
      effectiveUnitValueUsd,
      maintenanceLabel: maintenanceEnabled ? maintenanceLabel(maintenanceYears) : "",
    };
  });
}

function updateServiceEditValue(
  previous: ProposalServiceEdits,
  service: EditableProposalService,
  field: "name" | "durationDays" | "valuePerDay" | "description",
  rawValue: string,
): ProposalServiceEdits {
  const current = previous[service.id] ?? {
    name: service.displayName,
    valuePerDay: service.valuePerDay,
    durationDays: service.durationDays,
    description: service.displayDescription,
  };
  const nextEdit = { ...current };

  if (field === "durationDays") {
    nextEdit.durationDays = rawValue === "" ? 0 : positiveIntegerValue(rawValue, 1);
  } else if (field === "valuePerDay") {
    nextEdit.valuePerDay = rawValue === "" ? 0 : Math.max(0, numericValue(rawValue, 0));
  } else if (field === "name") {
    nextEdit.name = rawValue;
  } else {
    nextEdit.description = rawValue;
  }

  return { ...previous, [service.id]: nextEdit };
}

function updateProductEditValue(
  previous: ProposalProductSessionEdits,
  product: EditableProposalProduct,
  field: "name" | "quantity" | "unitValueUsd" | "description" | "maintenanceEnabled" | "maintenancePercent" | "maintenanceYears",
  rawValue: string | boolean,
): ProposalProductSessionEdits {
  const current = previous[product.id] ?? {
    name: product.displayName,
    unitValueUsd: product.unitValueUsd,
    quantity: product.quantity,
    description: product.displayDescription,
    maintenanceEnabled: product.maintenanceEnabled,
    maintenancePercent: product.maintenancePercent,
    maintenanceYears: product.maintenanceYears,
  };
  const nextEdit = { ...current };

  if (field === "quantity") {
    const value = String(rawValue);
    nextEdit.quantity = value === "" ? 0 : positiveIntegerValue(value, 1);
  } else if (field === "unitValueUsd") {
    const value = String(rawValue);
    nextEdit.unitValueUsd = value === "" ? 0 : Math.max(0, numericValue(value, 0));
  } else if (field === "maintenanceEnabled") {
    nextEdit.maintenanceEnabled = Boolean(rawValue);
  } else if (field === "maintenancePercent") {
    const value = String(rawValue);
    nextEdit.maintenancePercent = value === "" ? 0 : Math.max(0, numericValue(value, 0));
  } else if (field === "maintenanceYears") {
    const value = String(rawValue);
    nextEdit.maintenanceYears = value === "" ? 0 : positiveIntegerValue(value, 1);
  } else if (field === "name") {
    nextEdit.name = String(rawValue);
  } else {
    nextEdit.description = String(rawValue);
  }

  return { ...previous, [product.id]: nextEdit };
}

function romanNumeral(value: number): string {
  const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
  return roman[value] ?? String(value);
}

function TotalsSummary({
  hasProducts,
  hasServices,
  softwareTotalUsd,
  softwareDiscountValue,
  softwareFinalTotal,
  serviceSubtotal,
  serviceTotalDays,
  serviceDiscountValue,
  taxPercent,
  serviceTaxValue,
  serviceFinalTotalDisplay,
  grandTotalDisplay,
}: TotalsSummaryProps) {
  return (
    <section className="proposal-totals" aria-label="Totais da proposta">
      {hasProducts ? (
        <div className="proposal-totals-group">
          <div className="proposal-totals-row">
            <span>Software (USD)</span>
            <strong>US$ {formatUsdCurrency(softwareTotalUsd)}</strong>
          </div>
          {softwareDiscountValue > 0 ? (
            <div className="proposal-totals-row">
              <span>Desconto Software</span>
              <strong>- R$ {formatCurrency(softwareDiscountValue)}</strong>
            </div>
          ) : null}
          <div className="proposal-totals-row proposal-totals-row-main proposal-totals-row-soft">
            <span>Total Software</span>
            <strong>R$ {formatCurrency(softwareFinalTotal)}</strong>
          </div>
        </div>
      ) : null}
      {hasServices ? (
        <div className="proposal-totals-group">
          <div className="proposal-totals-row">
            <span>Serviços</span>
            <strong>R$ {formatCurrency(serviceSubtotal)}</strong>
          </div>
          <div className="proposal-totals-row">
            <span>Diárias</span>
            <strong>{serviceTotalDays} dia(s)</strong>
          </div>
          {serviceDiscountValue > 0 ? (
            <div className="proposal-totals-row">
              <span>Desconto Serviços</span>
              <strong>- R$ {formatCurrency(serviceDiscountValue)}</strong>
            </div>
          ) : null}
          <div className="proposal-totals-row">
            <span>Impostos ({taxLabel(taxPercent)}%)</span>
            <strong>R$ {formatCurrency(serviceTaxValue)}</strong>
          </div>
          <div className="proposal-totals-row proposal-totals-row-main">
            <span>Total Serviços</span>
            <strong>R$ {serviceFinalTotalDisplay}</strong>
          </div>
        </div>
      ) : null}
      <div className="proposal-totals-row proposal-totals-row-main">
        <span>Total Geral</span>
        <strong>R$ {grandTotalDisplay}</strong>
      </div>
    </section>
  );
}

function ServiceCard({
  service,
  selected,
  onToggleSelected,
  onOpenEditor,
  active,
  onDeleteCustom,
}: ServiceCardProps) {
  const label = service.displayName || service.name;

  return (
    <article className={`proposal-service-card${selected ? " is-selected" : ""}${active ? " is-editing" : ""}`}>
      <div className="proposal-service-card-header">
        <label className="proposal-service-check">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelected(service.id)}
            aria-label={`Selecionar ${label}`}
          />
          <span>
            <span className="proposal-service-name">
              {service.code ? `${service.code} - ` : ""}
              {label}
              {service.custom ? <small>CUSTOM</small> : null}
            </span>
            <span className="proposal-service-price">
              R$ {formatCurrency(service.valuePerDay)} / dia · {service.durationDays} dia(s)
            </span>
          </span>
        </label>
        <button type="button" className="proposal-service-edit" onClick={() => onOpenEditor(service.id)} aria-label={`Editar ${label}`}>
          {active ? "Fechar" : "Editar"}
        </button>
        {service.custom ? (
          <button
            type="button"
            className="proposal-service-delete"
            onClick={() => onDeleteCustom(service.id)}
            aria-label={`Excluir ${label}`}
            title="Excluir módulo"
          >
            ×
          </button>
        ) : null}
      </div>
    </article>
  );
}

function ProductCard({
  product,
  selected,
  onToggleSelected,
  onOpenEditor,
  active,
  onDeleteCustom,
}: ProductCardProps) {
  const label = product.displayName || product.name;

  return (
    <article className={`proposal-service-card proposal-product-card${selected ? " is-selected" : ""}${active ? " is-editing" : ""}`}>
      <div className="proposal-service-card-header">
        <label className="proposal-service-check">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelected(product.id)}
            aria-label={`Selecionar ${label}`}
          />
          <span>
            <span className="proposal-service-name">
              {product.code} - {label}
              {product.custom ? <small>CUSTOM</small> : null}
            </span>
            <span className="proposal-service-price">
              US$ {formatUsdCurrency(product.effectiveUnitValueUsd)} · qtd {product.quantity}
            </span>
          </span>
        </label>
        <button type="button" className="proposal-service-edit" onClick={() => onOpenEditor(product.id)} aria-label={`Editar ${label}`}>
          {active ? "Fechar" : "Editar"}
        </button>
        {product.custom ? (
          <button
            type="button"
            className="proposal-service-delete"
            onClick={() => onDeleteCustom(product.id)}
            aria-label={`Excluir ${label}`}
            title="Excluir produto"
          >
            ×
          </button>
        ) : null}
      </div>
    </article>
  );
}

type ProductEditorProps = {
  product: EditableProposalProduct;
  onEdit: (
    id: string,
    field: "name" | "quantity" | "unitValueUsd" | "description" | "maintenanceEnabled" | "maintenancePercent" | "maintenanceYears",
    value: string | boolean,
  ) => void;
  onReset: (id: string) => void;
  onClose: () => void;
};

function ProductEditorPanel({ product, onEdit, onReset, onClose }: ProductEditorProps) {
  const label = product.displayName || product.name;

  return (
    <section className="proposal-side-editor" aria-label="Editor de produto">
      <div className="proposal-side-editor-heading">
        <span>Software / Produto</span>
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
      <strong>
        {product.code} - {label}
      </strong>

      <div className="proposal-editor-block">
        <h3>Nesta proposta</h3>
        <label>
          Nome
          <input aria-label={`Nome nesta proposta de ${label}`} value={product.displayName} onChange={(event) => onEdit(product.id, "name", event.target.value)} />
        </label>
        <div className="proposal-service-control-grid">
          <label>
            Quantidade
            <input
              aria-label={`Quantidade nesta proposta de ${label}`}
              type="number"
              min="1"
              max="999"
              value={product.quantity}
              onChange={(event) => onEdit(product.id, "quantity", event.target.value)}
            />
          </label>
          <label>
            Valor USD
            <input
              aria-label={`Valor USD nesta proposta de ${label}`}
              type="number"
              min="0"
              step="0.01"
              value={product.unitValueUsd}
              onChange={(event) => onEdit(product.id, "unitValueUsd", event.target.value)}
            />
          </label>
        </div>
        <label>
          Descrição
          <textarea
            aria-label={`Descrição nesta proposta de ${label}`}
            value={product.displayDescription}
            onChange={(event) => onEdit(product.id, "description", event.target.value)}
          />
        </label>
      </div>

      <div className="proposal-editor-block">
        <h3>Manutenção</h3>
        <label className="proposal-editor-check">
          <input
            aria-label={`Ativar manutenção de ${label}`}
            type="checkbox"
            checked={product.maintenanceEnabled}
            onChange={(event) => onEdit(product.id, "maintenanceEnabled", event.target.checked)}
          />
          Ativar manutenção neste produto
        </label>
        <div className="proposal-service-control-grid">
          <label>
            % ao ano
            <input
              aria-label={`Percentual anual de manutenção de ${label}`}
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={product.maintenancePercent}
              onChange={(event) => onEdit(product.id, "maintenancePercent", event.target.value)}
            />
          </label>
          <label>
            Anos
            <input
              aria-label={`Anos de manutenção de ${label}`}
              type="number"
              min="1"
              max="20"
              value={product.maintenanceYears}
              onChange={(event) => onEdit(product.id, "maintenanceYears", event.target.value)}
            />
          </label>
        </div>
        {product.maintenanceEnabled ? (
          <small>
            Unitário com manutenção: US$ {formatUsdCurrency(product.effectiveUnitValueUsd)}
            {product.maintenanceLabel}
          </small>
        ) : null}
      </div>

      <div className="proposal-editor-block">
        <h3>Ações</h3>
        <div className="proposal-custom-actions">
          <button type="button" className="proposal-reset-service" onClick={() => onReset(product.id)}>
            Restaurar nesta proposta
          </button>
        </div>
      </div>
    </section>
  );
}

type ServiceEditorProps = {
  service: EditableProposalService;
  onEdit: (id: string, field: "name" | "durationDays" | "valuePerDay" | "description", value: string) => void;
  onSaveDefault: (id: string) => void;
  onReset: (id: string) => void;
  onClose: () => void;
};

function ServiceEditorPanel({ service, onEdit, onSaveDefault, onReset, onClose }: ServiceEditorProps) {
  const label = service.displayName || service.name;

  return (
    <section className="proposal-side-editor" aria-label="Editor de serviço">
      <div className="proposal-side-editor-heading">
        <span>Serviço</span>
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
      <strong>{displayCodeAndName(service)}</strong>

      <div className="proposal-editor-block">
        <h3>Nesta proposta</h3>
        <label>
          Nome
          <input aria-label={`Nome nesta proposta de ${label}`} value={service.displayName} onChange={(event) => onEdit(service.id, "name", event.target.value)} />
        </label>
        <div className="proposal-service-control-grid">
          <label>
            Duração
            <input
              aria-label={`Duração nesta proposta de ${label}`}
              type="number"
              min="1"
              max="30"
              value={service.durationDays}
              onChange={(event) => onEdit(service.id, "durationDays", event.target.value)}
            />
          </label>
          <label>
            Valor/dia
            <input
              aria-label={`Valor por dia nesta proposta de ${label}`}
              type="number"
              min="0"
              step="0.01"
              value={service.valuePerDay}
              onChange={(event) => onEdit(service.id, "valuePerDay", event.target.value)}
            />
          </label>
        </div>
        <label>
          Descrição
          <textarea
            aria-label={`Descrição nesta proposta de ${label}`}
            value={service.displayDescription}
            onChange={(event) => onEdit(service.id, "description", event.target.value)}
          />
        </label>
      </div>

      <div className="proposal-editor-block">
        <h3>Padrão do catálogo</h3>
        <div className="proposal-custom-actions">
          <button type="button" onClick={() => onSaveDefault(service.id)}>
            Salvar serviço como padrão
          </button>
          <button type="button" className="proposal-reset-service" onClick={() => onReset(service.id)}>
            Restaurar nesta proposta
          </button>
        </div>
      </div>
    </section>
  );
}

function ProposalAcceptanceSignatures({ clientName, representative }: ProposalAcceptanceSignaturesProps) {
  return (
    <>
      <div className="proposal-acceptance">Data do Aceite: _____ / _____ / _____</div>

      <div className="proposal-signatures">
        <div>
          <strong>Assinatura 1: Responsável Legal {clientName}</strong>
          <span>Nome: ________________________________</span>
          <span>Cargo: ________________________________</span>
          <i>{clientName}</i>
        </div>
        <div>
          <strong>Assinatura 2: Testemunha</strong>
          <span>Nome: ________________________________</span>
          <span>Cargo: ________________________________</span>
          <i>{clientName}</i>
        </div>
        <div className="proposal-holand-signature">
          <strong>Assinatura 3: Representante Legal Holand</strong>
          <span>{representative.name}</span>
          <i>{representative.role}</i>
        </div>
      </div>
    </>
  );
}

function ProposalRequirementsTerm({ clientName, representative }: ProposalRequirementsTermProps) {
  const hardwareRows = [
    ["Processador", "Intel Core i7, 12ª Geração", "Intel Core i7, 12ª Geração"],
    ["Memória RAM", "32 GB", "64 GB"],
    ["Placa Gráfica", "NVIDIA GeForce RTX Series", "NVIDIA Quadro RTX 40 Series"],
    ["Armazenamento", "SSD 512 GB (SO) + 1 TB (dados)", "SSD 512 GB (SO) + 1 TB (dados)"],
    ["Rede", "1 Gbps", "1 Gbps"],
    ["Resolução", "1280 × 1024", "1280 × 1024"],
    ["Periféricos", "Teclado · Mouse · USB (hardlock)", "Teclado · Mouse · USB (hardlock)"],
  ];

  return (
    <section className="proposal-requirements-page" aria-label="Termo de requisitos TopSolid">
      <div className="proposal-requirements-header">
        <img src={holandLogo} alt="Holand" />
        <span>Distribuidor Autorizado TopSolid</span>
        <small>www.holand.com.br</small>
      </div>

      <h2>Requisitos de Estação de Trabalho - TopSolid 7.18</h2>
      <p>Documento informativo com os requisitos mínimos e recomendados para instalação e uso do TopSolid 7.18.</p>

      <div className="proposal-requirements-section">
        <h3>Sistema Operacional</h3>
        <dl>
          <div>
            <dt>Sistemas homologados</dt>
            <dd>Windows 10 Pro (64 bits) · Windows 11 Pro (64 bits)</dd>
          </div>
          <div>
            <dt>Não homologados</dt>
            <dd>WinRT · Windows 10 S · Versões Home</dd>
          </div>
        </dl>
      </div>

      <div className="proposal-requirements-section">
        <h3>Hardware</h3>
        <table className="proposal-requirements-table">
          <thead>
            <tr>
              <th>Componente</th>
              <th>Mínimo</th>
              <th>Recomendado</th>
            </tr>
          </thead>
          <tbody>
            {hardwareRows.map(([component, minimum, recommended]) => (
              <tr key={component}>
                <td>{component}</td>
                <td>{minimum}</td>
                <td>{recommended}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="proposal-requirements-grid">
        <div className="proposal-requirements-section">
          <h3>Placa de Vídeo Homologada</h3>
          <ul>
            <li>NVIDIA GeForce RTX Series</li>
            <li>NVIDIA Quadro RTX Series</li>
          </ul>
        </div>

        <div className="proposal-requirements-section">
          <h3>Observações</h3>
          <ul>
            <li>Windows e driver da GPU devem estar atualizados antes da instalação.</li>
            <li>TopSolid'Pdm Local requer Microsoft SQL Express (quando sem Pdm Server).</li>
            <li>Docking Stations não são suportadas com o hardlock.</li>
          </ul>
        </div>
      </div>

      <div className="proposal-requirements-signature-block">
        <ProposalAcceptanceSignatures clientName={clientName} representative={representative} />
      </div>

      <footer>Holand Tecnologia · Distribuidor Autorizado TopSolid · www.holand.com.br</footer>
    </section>
  );
}

function ProposalPreview({
  client,
  proposal,
  selectedProducts,
  selectedServices,
  observations,
  taxPercent,
  softwareDiscountPercent,
  discountPercent,
  exchangeRate,
  totals,
  representative,
  includeRequirementsTerm,
}: ProposalPreviewProps) {
  const clientName = client.companyName || "[Razão Social]";
  const contactName = client.contact || "[Contato]";
  const validityDate = addDays(proposal.date, positiveIntegerValue(proposal.validityDays, DEFAULT_VALIDITY_DAYS));
  const modalityText = proposal.modality.toLocaleLowerCase("pt-BR");
  const hasProducts = selectedProducts.length > 0;
  const hasServices = selectedServices.length > 0;
  let sectionNumber = 2;
  const softwareSection = hasProducts ? sectionNumber++ : 0;
  const servicesSection = hasServices ? sectionNumber++ : 0;
  const summarySection = hasProducts ? sectionNumber++ : 0;
  const commercialSection = sectionNumber;

  return (
    <section className="proposal-document" aria-label="Prévia da proposta">
      <div className="proposal-main-page">
      <div className="proposal-document-header">
        <img src={holandLogo} alt="Holand" />
      </div>

      <div className="proposal-number">{proposal.number || "P00000_OS"}</div>
      <div className="proposal-date">Joinville, {formatLongDate(proposal.date)}</div>

      <div className="proposal-client-box">
        <strong>{clientName}</strong>
        <span>{client.address || "[Endereço]"}</span>
        <span>CEP: {client.cep || "[CEP]"}</span>
        <span>
          <strong>CNPJ:</strong> {client.cnpj || "[CNPJ]"}
        </span>
        <span>
          <strong>Contato:</strong> {contactName}
        </span>
        <span>
          <strong>E-mail:</strong> {client.email || "[E-mail]"}
        </span>
      </div>

      <p className="proposal-greeting">
        <strong>Prezado(a) Sr(a). {contactName}</strong>
        Agradecemos seu interesse pelos serviços de consultoria, suporte técnico e treinamentos em sistemas PDM/CAD/CAM oferecidos pela HOLAND.
      </p>

      <h2>I – Objeto</h2>
      <p>Serviços de Treinamento, Implantação e Consultoria.</p>

      {hasProducts ? (
        <>
          <h2>{romanNumeral(softwareSection)} – Software / Licenças</h2>
          <table className="proposal-services-table proposal-products-table">
            <thead>
              <tr>
                <th>Produto / Descrição</th>
                <th>Valor Unit. (USD)</th>
                <th>Qtd.</th>
                <th>Total (USD)</th>
                <th>Total (BRL)</th>
              </tr>
            </thead>
            <tbody>
              {selectedProducts.map((product) => {
                const usdTotal = product.effectiveUnitValueUsd * product.quantity;
                const brlTotal = usdTotal * exchangeRate;
                return (
                  <tr key={product.id}>
                    <td>
                      <strong>
                        {product.code} – {product.displayName}
                        {product.maintenanceLabel}
                      </strong>
                      <span>{product.displayDescription}</span>
                    </td>
                    <td>US$ {formatUsdCurrency(product.effectiveUnitValueUsd)}</td>
                    <td>{product.quantity}</td>
                    <td>US$ {formatUsdCurrency(usdTotal)}</td>
                    <td>R$ {formatCurrency(brlTotal)}</td>
                  </tr>
                );
              })}
              <tr className="proposal-days-row">
                <td>US$ 1 = R$ {exchangeRate.toFixed(2)}</td>
                <td colSpan={2}>Subtotal</td>
                <td>
                  <strong>US$ {formatUsdCurrency(totals.software.totalUsd)}</strong>
                </td>
                <td>R$ {formatCurrency(totals.software.totalBrl)}</td>
              </tr>
              {totals.software.discountValue > 0 ? (
                <tr className="proposal-discount-row">
                  <td colSpan={4}>Desconto Software ({taxLabel(softwareDiscountPercent)}%)</td>
                  <td>- R$ {formatCurrency(totals.software.discountValue)}</td>
                </tr>
              ) : null}
              <tr className="proposal-total-row">
                <td colSpan={4}>Total Software</td>
                <td>R$ {formatCurrency(totals.software.finalTotal)}</td>
              </tr>
            </tbody>
          </table>
        </>
      ) : null}

      {hasServices ? (
        <>
          <h2>{romanNumeral(servicesSection)} – Serviços</h2>
          <p>
            Os treinamentos abaixo orçados serão ministrados na modalidade <strong>{modalityText}</strong>.
            <br />
            Os serviços serão executados pela HOLAND, representante exclusiva da TopSolid em SC.
          </p>
        <table className="proposal-services-table">
          <thead>
            <tr>
              <th>Serviços / Descrição</th>
              <th>Valor Unit.</th>
              <th>Duração</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {selectedServices.map((service) => (
              <tr key={service.id}>
                <td>
                  <strong>{displayCodeAndName(service)}</strong>
                  <span>{service.displayDescription}</span>
                </td>
                <td>R$ {formatCurrency(service.valuePerDay)}</td>
                <td>{service.durationDays}</td>
                <td>R$ {formatCurrency(service.valuePerDay * service.durationDays)}</td>
              </tr>
            ))}
            <tr className="proposal-days-row">
              <td colSpan={2}>Total de diárias</td>
              <td>
                <strong>{totals.totalDays} Diárias</strong>
              </td>
              <td />
            </tr>
            {totals.discountValue > 0 ? (
              <tr className="proposal-discount-row">
                <td colSpan={3}>Desconto ({formatCurrency(discountPercent)}%)</td>
                <td>- R$ {formatCurrency(totals.discountValue)}</td>
              </tr>
            ) : null}
            <tr className="proposal-total-row">
              <td colSpan={3}>Valor Total</td>
              <td>R$ {formatCurrency(totals.subtotalAfterDiscount)}</td>
            </tr>
            <tr className="proposal-tax-row">
              <td colSpan={3}>Valor total c/ Impostos ({taxLabel(taxPercent)}%)</td>
              <td>R$ {totals.finalTotalDisplay}</td>
            </tr>
          </tbody>
        </table>
        </>
      ) : !hasProducts ? (
        <p className="proposal-empty">Selecione software ou serviços no painel ao lado.</p>
      ) : null}

      {hasProducts ? (
        <>
          <h2>{romanNumeral(summarySection)} – Resumo Financeiro</h2>
          <table className="proposal-summary-table">
            <tbody>
              <tr>
                <td>Software / Licenças</td>
                <td>R$ {formatCurrency(totals.software.finalTotal)}</td>
              </tr>
              {hasServices ? (
                <tr>
                  <td>Serviços / Treinamentos</td>
                  <td>R$ {totals.finalTotalDisplay}</td>
                </tr>
              ) : null}
              <tr>
                <td>Total Geral</td>
                <td>R$ {totals.grandTotalDisplay}</td>
              </tr>
            </tbody>
          </table>
        </>
      ) : null}

      <div className="proposal-notes">
        {observations.split("\n").map((line, index) =>
          line ? <p key={`${line}-${index}`}>{line}</p> : <br key={`blank-${index}`} />,
        )}
      </div>

      <div className="proposal-commercial">
        <strong>{romanNumeral(commercialSection)} – Condições Comerciais</strong>
        <p>
          <strong>Treinamento, Implantação, Consultoria e Acompanhamento.</strong>
        </p>
        <p>Modalidade {proposal.modality}:</p>
        <p>( &nbsp;) À vista &nbsp; R$ {totals.grandTotalDisplay}</p>
      </div>

      <div className="proposal-tax-copy">
        <strong>VIII – Impostos</strong>
        <br />
        Composição dos impostos para serviços: {taxLabel(taxPercent)}%
      </div>

      <div className="proposal-validity">
        <strong>IX – Considerações Finais</strong>
        <br />
        Esta proposta tem validade até <strong>{validityDate}</strong>.
        <br />
        <br />
        Na ausência de um pedido de compra, o mesmo reconhece que sua assinatura nesta proposta autoriza o início do faturamento e que esta proposta terá validade como Ordem de Compra.
        <br />
        Todas as páginas desta proposta deverão ser rubricadas.
      </div>

      <p className="proposal-kind-regards">Cordialmente,</p>

      {includeRequirementsTerm ? null : <ProposalAcceptanceSignatures clientName={clientName} representative={representative} />}

      <footer>
        Holand Automação de Engenharias Ltda | Av. Juscelino Kubitscheck, 350 - Centro, Joinville - SC, 89201-100
        <br />
        Fone: (47) 98859-3553 | www.holand.com.br | leonardo@holand.com.br
      </footer>
      </div>
      {includeRequirementsTerm ? <ProposalRequirementsTerm clientName={clientName} representative={representative} /> : null}
    </section>
  );
}

export function ProposalsPage() {
  const [savedConfig] = useState(() => loadProposalConfig());
  const [initialDocument] = useState(() => createEmptyProposalDocument(savedConfig, DEFAULT_REPRESENTATIVES[0]));
  const [client, setClient] = useState<ClientFields>(initialDocument.client);
  const [proposal, setProposal] = useState<ProposalFields>(initialDocument.proposal);
  const [customServices, setCustomServices] = useState<ProposalService[]>([]);
  const [proposalCustomServices, setProposalCustomServices] = useState<ProposalService[]>([]);
  const [customProducts, setCustomProducts] = useState<ProposalProduct[]>(() => loadProposalCustomProducts());
  const [proposalCustomProducts, setProposalCustomProducts] = useState<ProposalProduct[]>([]);
  const [serviceEdits, setServiceEdits] = useState<ProposalServiceEdits>(() => loadProposalServiceEdits());
  const [proposalServiceEdits, setProposalServiceEdits] = useState<ProposalServiceEdits>({});
  const [productEdits, setProductEdits] = useState<ProposalProductEdits>(() => loadProposalProductEdits());
  const [proposalProductEdits, setProposalProductEdits] = useState<ProposalProductSessionEdits>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(() => new Set());
  const [activeEditor, setActiveEditor] = useState<ActiveEditor>(null);
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [isAddingCustomProduct, setIsAddingCustomProduct] = useState(false);
  const [customDraft, setCustomDraft] = useState<CustomModuleDraft>(EMPTY_CUSTOM_MODULE);
  const [customProductDraft, setCustomProductDraft] = useState<CustomProductDraft>(EMPTY_CUSTOM_PRODUCT);
  const [taxPercent, setTaxPercent] = useState(initialDocument.taxPercent);
  const [exchangeRate, setExchangeRate] = useState(initialDocument.exchangeRate);
  const [softwareDiscountPercent, setSoftwareDiscountPercent] = useState(initialDocument.softwareDiscountPercent);
  const [discountPercent, setDiscountPercent] = useState(initialDocument.discountPercent);
  const [targetTotal, setTargetTotal] = useState(initialDocument.targetTotal);
  const [customRepresentatives, setCustomRepresentatives] = useState<ProposalRepresentative[]>(() => loadProposalRepresentatives());
  const [selectedRepresentativeId, setSelectedRepresentativeId] = useState(DEFAULT_REPRESENTATIVES[0].id);
  const [isAddingRepresentative, setIsAddingRepresentative] = useState(false);
  const [representativeDraft, setRepresentativeDraft] = useState<RepresentativeDraft>(EMPTY_REPRESENTATIVE_DRAFT);
  const [includeRequirementsTerm, setIncludeRequirementsTerm] = useState(initialDocument.includeRequirementsTerm);
  const [snapToTarget, setSnapToTarget] = useState(initialDocument.snapToTarget);
  const [serviceTargetTotal, setServiceTargetTotal] = useState<number | undefined>();
  const [snapMessage, setSnapMessage] = useState("");
  const [observations, setObservations] = useState(initialDocument.observations);
  const [savedProposals, setSavedProposals] = useState<ProposalSummary[]>([]);
  const [proposalSearch, setProposalSearch] = useState("");
  const [proposalsLoading, setProposalsLoading] = useState(true);
  const [proposalOperationError, setProposalOperationError] = useState("");
  const [proposalOperationStatus, setProposalOperationStatus] = useState("");
  const [savingProposal, setSavingProposal] = useState(false);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [baselineDocumentJson, setBaselineDocumentJson] = useState(() => JSON.stringify(initialDocument));
  const [isSoftwareCatalogOpen, setIsSoftwareCatalogOpen] = useState(false);
  const [catalogProductRecords, setCatalogProductRecords] = useState<ProposalCatalogProductRecord[]>([]);
  const [catalogProductsReady, setCatalogProductsReady] = useState(false);
  const [catalogProductBusy, setCatalogProductBusy] = useState(false);
  const [catalogProductError, setCatalogProductError] = useState("");
  const [catalogProductModal, setCatalogProductModal] = useState<CatalogProductModalState>(null);
  const catalogTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      api.proposals(),
      api.proposalCatalogServices(),
      api.proposalCatalogProducts(),
    ]).then(([proposalsResult, servicesResult, productsResult]) => {
      if (!active) return;
      const errors: string[] = [];
      if (proposalsResult.status === "fulfilled") {
        setSavedProposals(proposalsResult.value.items);
      } else {
        errors.push(proposalsResult.reason instanceof Error ? proposalsResult.reason.message : "Não foi possível carregar as propostas.");
      }
      if (servicesResult.status === "fulfilled") {
        setCustomServices(servicesResult.value.items);
      } else {
        errors.push(servicesResult.reason instanceof Error ? servicesResult.reason.message : "Não foi possível carregar os módulos compartilhados.");
      }
      if (productsResult.status === "fulfilled") {
        setCatalogProductRecords(productsResult.value.items);
        setCatalogProductsReady(true);
        setCustomProducts([]);
        setProductEdits({});
      } else {
        errors.push(productsResult.reason instanceof Error ? productsResult.reason.message : "Não foi possível carregar o catálogo compartilhado de software.");
      }
      setProposalOperationError(errors.join(" "));
      setProposalsLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const services = useMemo(
    () => buildEditableServices(customServices, proposalCustomServices, serviceEdits, proposalServiceEdits),
    [customServices, proposalCustomServices, serviceEdits, proposalServiceEdits],
  );
  const officialCatalogProducts = useMemo(
    () => applyTopsolidPrimaryClassification(PROPOSAL_PRODUCTS as SoftwareCatalogProduct[]),
    [],
  );
  const resolvedCatalog = useMemo(
    () => resolveSharedSoftwareCatalog(officialCatalogProducts, customProducts, catalogProductRecords),
    [catalogProductRecords, customProducts, officialCatalogProducts],
  );
  const products = useMemo(
    () => buildEditableProducts(resolvedCatalog.allProducts, proposalCustomProducts, productEdits, proposalProductEdits),
    [productEdits, proposalCustomProducts, proposalProductEdits, resolvedCatalog.allProducts],
  );
  const catalogEntries = useMemo(() => {
    const editableById = new Map(products.map((product) => [product.id, product]));
    const withEdits = (items: ProposalProduct[]) => items.map((item) => {
      const editable = editableById.get(item.id);
      if (!editable) return item;
      return {
        ...item,
        name: editable.displayName,
        unitValueUsd: editable.unitValueUsd,
        description: editable.displayDescription,
      };
    });
    const activeProducts = withEdits(resolvedCatalog.activeProducts);
    return mergeSoftwareCatalog(
      activeProducts.filter((item) => !item.custom) as SoftwareCatalogProduct[],
      activeProducts.filter((item) => item.custom),
      withEdits(proposalCustomProducts),
    );
  }, [products, proposalCustomProducts, resolvedCatalog.activeProducts]);
  const representatives = useMemo(() => [...DEFAULT_REPRESENTATIVES, ...customRepresentatives], [customRepresentatives]);
  const selectedRepresentative = representatives.find((representative) => representative.id === selectedRepresentativeId) ?? DEFAULT_REPRESENTATIVES[0];
  const selectedServices = useMemo(() => services.filter((service) => selectedIds.has(service.id)), [selectedIds, services]);
  const selectedProducts = useMemo(() => products.filter((product) => selectedProductIds.has(product.id)), [products, selectedProductIds]);
  const activeProduct = activeEditor?.kind === "product" ? products.find((product) => product.id === activeEditor.id) : undefined;
  const activeService = activeEditor?.kind === "service" ? services.find((service) => service.id === activeEditor.id) : undefined;
  const currentDocument = useMemo<ProposalDocumentV1>(() => ({
    version: 1,
    client,
    proposal,
    selectedServiceIds: [...selectedIds],
    selectedProductIds: [...selectedProductIds],
    serviceSnapshots: selectedServices.map((service) => ({
      id: service.id,
      code: service.code,
      name: service.displayName,
      valuePerDay: service.valuePerDay,
      defaultDurationDays: service.durationDays,
      description: service.displayDescription,
      custom: service.custom,
    })),
    productSnapshots: selectedProducts.map((product) => ({
      id: product.id,
      code: product.code,
      name: product.displayName,
      unitValueUsd: product.unitValueUsd,
      defaultQuantity: product.quantity,
      description: product.displayDescription,
      custom: product.custom,
      quantity: product.quantity,
      maintenanceEnabled: product.maintenanceEnabled,
      maintenancePercent: product.maintenancePercent,
      maintenanceYears: product.maintenanceYears,
    })),
    proposalCustomServices,
    proposalCustomProducts,
    proposalServiceEdits,
    proposalProductEdits,
    taxPercent,
    exchangeRate,
    softwareDiscountPercent,
    discountPercent,
    targetTotal,
    selectedRepresentative,
    includeRequirementsTerm,
    snapToTarget,
    serviceTargetTotal: serviceTargetTotal ?? null,
    observations,
  }), [
    client,
    proposal,
    selectedIds,
    selectedProductIds,
    selectedServices,
    selectedProducts,
    proposalCustomServices,
    proposalCustomProducts,
    proposalServiceEdits,
    proposalProductEdits,
    taxPercent,
    exchangeRate,
    softwareDiscountPercent,
    discountPercent,
    targetTotal,
    selectedRepresentative,
    includeRequirementsTerm,
    snapToTarget,
    serviceTargetTotal,
    observations,
  ]);
  const currentDocumentJson = JSON.stringify(currentDocument);
  const hasUnsavedChanges = currentDocumentJson !== baselineDocumentJson;

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);
  const totals = calculateProposalTotals({
    selectedProducts: selectedProducts.map((product) => ({
      id: product.id,
      unitValueUsd: product.unitValueUsd,
      quantity: product.quantity,
      maintenancePercent: product.maintenanceEnabled ? product.maintenancePercent : 0,
      maintenanceYears: product.maintenanceEnabled ? product.maintenanceYears : 0,
    })),
    exchangeRate: numericValue(exchangeRate, DEFAULT_EXCHANGE_RATE),
    softwareDiscountPercent: numericValue(softwareDiscountPercent, 0),
    selectedServices: selectedServices.map((service) => ({
      id: service.id,
      valuePerDay: service.valuePerDay,
      durationDays: service.durationDays,
    })),
    discountPercent: numericValue(discountPercent, 0),
    taxPercent: numericValue(taxPercent, DEFAULT_TAX_PERCENT),
    snapTo54000: snapToTarget,
    serviceTargetTotal,
  });

  function applyDocument(document: ProposalDocumentV1): ProposalDocumentV1 {
    const restored = restoreProposalDocument(
      document,
      [...PROPOSAL_SERVICES, ...customServices],
      resolvedCatalog.allProducts,
    );
    setClient(restored.client);
    setProposal(restored.proposal);
    setSelectedIds(restored.selectedServiceIds);
    setSelectedProductIds(restored.selectedProductIds);
    setProposalCustomServices(restored.proposalCustomServices);
    setProposalCustomProducts(restored.proposalCustomProducts);
    setProposalServiceEdits(restored.proposalServiceEdits);
    setProposalProductEdits(restored.proposalProductEdits);
    setTaxPercent(restored.taxPercent);
    setExchangeRate(restored.exchangeRate);
    setSoftwareDiscountPercent(restored.softwareDiscountPercent);
    setDiscountPercent(restored.discountPercent);
    setTargetTotal(restored.targetTotal);
    setIncludeRequirementsTerm(restored.includeRequirementsTerm);
    setSnapToTarget(restored.snapToTarget);
    setServiceTargetTotal(restored.serviceTargetTotal ?? undefined);
    setObservations(restored.observations);

    const representative = restored.selectedRepresentative ?? DEFAULT_REPRESENTATIVES[0];
    if (!DEFAULT_REPRESENTATIVES.some((item) => item.id === representative.id)) {
      setCustomRepresentatives((previous) => (
        previous.some((item) => item.id === representative.id) ? previous : [...previous, representative]
      ));
    }
    setSelectedRepresentativeId(representative.id);
    setActiveEditor(null);
    setIsAddingCustom(false);
    setIsAddingCustomProduct(false);
    setIsAddingRepresentative(false);
    setCustomDraft(EMPTY_CUSTOM_MODULE);
    setCustomProductDraft(EMPTY_CUSTOM_PRODUCT);
    setRepresentativeDraft(EMPTY_REPRESENTATIVE_DRAFT);
    setSnapMessage("");
    setIsSoftwareCatalogOpen(false);
    setCatalogProductModal(null);
    return canonicalizeRestoredDocument(document, restored);
  }

  async function saveCurrentProposal() {
    setSavingProposal(true);
    setProposalOperationError("");
    setProposalOperationStatus("");
    const payload = {
      number: proposal.number.trim(),
      client_company_name: client.companyName.trim(),
      document: currentDocument,
    };

    try {
      const result = activeProposalId
        ? await api.updateProposal(activeProposalId, payload)
        : await api.createProposal(payload);
      const id = activeProposalId ?? result.id;
      setActiveProposalId(id);
      setBaselineDocumentJson(currentDocumentJson);
      setProposalOperationStatus("Proposta salva.");
      setSavedProposals((previous) => {
        const existing = previous.find((item) => item.id === id);
        const summary: ProposalSummary = {
          id,
          number: payload.number,
          client_company_name: payload.client_company_name,
          created_by: existing?.created_by ?? "",
          updated_by: existing?.updated_by ?? "",
          created_at: existing?.created_at ?? result.updated_at,
          updated_at: result.updated_at,
        };
        return [summary, ...previous.filter((item) => item.id !== id)];
      });
      try {
        const refreshed = await api.proposals();
        setSavedProposals(refreshed.items);
      } catch {
        // A gravação foi confirmada; o resumo local permanece até o próximo carregamento.
      }
    } catch (error) {
      setProposalOperationError(error instanceof Error ? error.message : "Não foi possível salvar a proposta.");
    } finally {
      setSavingProposal(false);
    }
  }

  async function openSavedProposal(id: string) {
    if (hasUnsavedChanges && !window.confirm("Descartar alterações não salvas?")) return;
    setProposalOperationError("");
    setProposalOperationStatus("");
    try {
      const saved = await api.proposal(id);
      const canonicalDocument = applyDocument(saved.document);
      setActiveProposalId(id);
      setBaselineDocumentJson(JSON.stringify(canonicalDocument));
      setProposalOperationStatus("Proposta aberta.");
    } catch (error) {
      setProposalOperationError(error instanceof Error ? error.message : "Não foi possível abrir a proposta.");
    }
  }

  function resetToNewProposal(skipConfirmation = false) {
    if (!skipConfirmation && hasUnsavedChanges && !window.confirm("Descartar alterações não salvas?")) return;
    const empty = createEmptyProposalDocument(savedConfig, DEFAULT_REPRESENTATIVES[0]);
    const canonicalDocument = applyDocument(empty);
    setActiveProposalId(null);
    setBaselineDocumentJson(JSON.stringify(canonicalDocument));
    setProposalOperationStatus("Nova proposta iniciada.");
    setProposalOperationError("");
  }

  async function deleteSavedProposal(id: string) {
    if (!window.confirm("Excluir esta proposta permanentemente?")) return;
    setProposalOperationError("");
    try {
      await api.deleteProposal(id);
      setSavedProposals((previous) => previous.filter((item) => item.id !== id));
      if (activeProposalId === id) resetToNewProposal(true);
      setProposalOperationStatus("Proposta excluída.");
    } catch (error) {
      setProposalOperationError(error instanceof Error ? error.message : "Não foi possível excluir a proposta.");
    }
  }

  function resetTargetDiscount() {
    setSnapToTarget(false);
    setServiceTargetTotal(undefined);
    setSnapMessage("");
  }

  function setClientField(field: keyof ClientFields, value: string) {
    setClient((previous) => ({ ...previous, [field]: value }));
  }

  function setProposalField(field: keyof ProposalFields, value: string) {
    setProposal((previous) => ({ ...previous, [field]: value }));
  }

  function toggleSelected(id: string) {
    resetTargetDiscount();
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleProductSelected(id: string) {
    resetTargetDiscount();
    setSelectedProductIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
        setProposalProductEdits((previousEdits) => {
          const nextEdits = { ...previousEdits };
          delete nextEdits[id];
          return nextEdits;
        });
      } else {
        next.add(id);
        const product = products.find((item) => item.id === id);
        if (product) {
          setProposalProductEdits((previousEdits) => ({
            ...previousEdits,
            [id]: {
              name: product.displayName,
              unitValueUsd: product.unitValueUsd,
              quantity: product.quantity,
              description: product.displayDescription,
              maintenanceEnabled: product.maintenanceEnabled,
              maintenancePercent: product.maintenancePercent,
              maintenanceYears: product.maintenanceYears,
            },
          }));
        }
      }
      return next;
    });
  }

  const closeSoftwareCatalog = useCallback(() => {
    setIsSoftwareCatalogOpen(false);
    requestAnimationFrame(() => catalogTriggerRef.current?.focus());
  }, []);

  function openEditor(kind: "product" | "service", id: string) {
    setActiveEditor((previous) => (previous?.kind === kind && previous.id === id ? null : { kind, id }));
  }

  function editService(id: string, field: "name" | "durationDays" | "valuePerDay" | "description", value: string) {
    const service = services.find((item) => item.id === id);
    if (!service) return;

    resetTargetDiscount();
    setProposalServiceEdits((previous) => updateServiceEditValue(previous, service, field, value));
  }

  function editProduct(
    id: string,
    field: "name" | "quantity" | "unitValueUsd" | "description" | "maintenanceEnabled" | "maintenancePercent" | "maintenanceYears",
    value: string | boolean,
  ) {
    const product = products.find((item) => item.id === id);
    if (!product) return;

    resetTargetDiscount();
    setProposalProductEdits((previous) => updateProductEditValue(previous, product, field, value));
  }

  function resetService(id: string) {
    resetTargetDiscount();
    setProposalServiceEdits((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }

  function resetProduct(id: string) {
    resetTargetDiscount();
    setProposalProductEdits((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }

  async function saveServiceAsDefault(id: string) {
    const service = services.find((item) => item.id === id);
    if (!service) return;

    setProposalOperationError("");
    if (customServices.some((item) => item.id === id)) {
      try {
        const updated = await api.updateProposalCatalogService(id, {
          code: service.code,
          name: service.displayName,
          valuePerDay: service.valuePerDay,
          defaultDurationDays: service.durationDays,
          description: service.displayDescription,
        });
        setCustomServices((previous) => previous.map((item) => item.id === id ? updated : item));
        setProposalServiceEdits((previous) => {
          const next = { ...previous };
          delete next[id];
          return next;
        });
        setProposalOperationStatus("Módulo atualizado no catálogo compartilhado.");
      } catch (error) {
        setProposalOperationError(error instanceof Error ? error.message : "Não foi possível atualizar o módulo.");
      }
      return;
    }

    if (proposalCustomServices.some((item) => item.id === id)) {
      try {
        const persisted = await api.createProposalCatalogService({
          code: service.code,
          name: service.displayName,
          valuePerDay: service.valuePerDay,
          defaultDurationDays: service.durationDays,
          description: service.displayDescription,
        });
        setCustomServices((previous) => [...previous, persisted]);
        setProposalCustomServices((previous) => previous.filter((item) => item.id !== id));
        setSelectedIds((previous) => {
          if (!previous.has(id)) return previous;
          const next = new Set(previous);
          next.delete(id);
          next.add(persisted.id);
          return next;
        });
        setProposalServiceEdits((previous) => {
          const next = { ...previous };
          delete next[id];
          return next;
        });
        setActiveEditor((previous) => (
          previous?.kind === "service" && previous.id === id
            ? { kind: "service", id: persisted.id }
            : previous
        ));
        setProposalOperationStatus("Módulo salvo no catálogo compartilhado.");
      } catch (error) {
        setProposalOperationError(error instanceof Error ? error.message : "Não foi possível salvar o módulo no catálogo.");
      }
      return;
    }

    setServiceEdits((previous) => {
      const next = {
        ...previous,
        [id]: {
          name: service.displayName,
          valuePerDay: service.valuePerDay,
          durationDays: service.durationDays,
          description: service.displayDescription,
        },
      };
      saveProposalServiceEdits(next);
      return next;
    });
    setProposalOperationStatus("Padrão salvo neste navegador.");
  }

  function replaceCatalogProductRecord(record: ProposalCatalogProductRecord) {
    setCatalogProductRecords((previous) => [
      ...previous.filter((item) => item.id !== record.id),
      record,
    ]);
  }

  function catalogSourceForEntry(product: SoftwareCatalogEntry): ProposalCatalogProductSource {
    return catalogProductRecords.find((item) => item.id === product.id)?.source
      ?? (product.source === "official" ? "official" : "custom");
  }

  async function saveCatalogProduct(payload: ProposalCatalogProductCreate) {
    setCatalogProductBusy(true);
    setCatalogProductError("");
    try {
      if (catalogProductModal?.mode === "edit") {
        const current = catalogProductModal.product;
        const source = catalogSourceForEntry(current);
        const record = await api.updateProposalCatalogProduct(current.id, {
          source,
          product: {
            id: current.id,
            ...payload,
            custom: source === "custom",
          },
        });
        replaceCatalogProductRecord(record);
        if (current.source === "proposal-only") {
          setProposalCustomProducts((previous) => previous.filter((item) => item.id !== current.id));
        }
        setProposalOperationStatus("Produto atualizado no catálogo compartilhado.");
      } else {
        const record = await api.createProposalCatalogProduct(payload);
        replaceCatalogProductRecord(record);
        setProposalOperationStatus("Produto criado no catálogo compartilhado.");
      }
      setCatalogProductModal(null);
    } catch (error) {
      setCatalogProductError(error instanceof Error ? error.message : "Não foi possível salvar o produto.");
    } finally {
      setCatalogProductBusy(false);
    }
  }

  async function archiveCatalogProduct(product: SoftwareCatalogEntry) {
    setCatalogProductBusy(true);
    setCatalogProductError("");
    try {
      const source = catalogSourceForEntry(product);
      const storedProduct = catalogProductRecords.find((item) => item.id === product.id)?.product;
      const record = await api.archiveProposalCatalogProduct(product.id, {
        source,
        product: storedProduct ?? catalogProductFromEntry(product),
      });
      replaceCatalogProductRecord(record);
      setCatalogProductModal(null);
      setProposalOperationStatus("Produto ocultado do catálogo compartilhado.");
    } catch (error) {
      setCatalogProductError(error instanceof Error ? error.message : "Não foi possível ocultar o produto.");
    } finally {
      setCatalogProductBusy(false);
    }
  }

  async function createCustomService(persist: boolean) {
    const name = customDraft.name.trim();
    if (!name) return;

    const valuePerDay = Math.max(0, numericValue(customDraft.valuePerDay, 1000));
    const durationDays = positiveIntegerValue(customDraft.days, 1);
    resetTargetDiscount();
    if (!persist) {
      setProposalCustomServices((previous) => [...previous, {
        id: `custom_${Date.now()}`,
        code: customDraft.code.trim(),
        name,
        valuePerDay,
        defaultDurationDays: durationDays,
        description: customDraft.description.trim(),
        custom: true,
      }]);
      setCustomDraft(EMPTY_CUSTOM_MODULE);
      setIsAddingCustom(false);
      return;
    }

    setProposalOperationError("");
    try {
      const persisted = await api.createProposalCatalogService({
        code: customDraft.code.trim(),
        name,
        valuePerDay,
        defaultDurationDays: durationDays,
        description: customDraft.description.trim(),
      });
      setCustomServices((previous) => [...previous, persisted]);
      setCustomDraft(EMPTY_CUSTOM_MODULE);
      setIsAddingCustom(false);
      setProposalOperationStatus("Módulo salvo no catálogo compartilhado.");
    } catch (error) {
      setProposalOperationError(error instanceof Error ? error.message : "Não foi possível salvar o módulo.");
    }
  }

  async function createCustomProduct(persist: boolean) {
    const name = customProductDraft.name.trim();
    if (!name) return;

    const product: ProposalProduct = {
      id: `custom_product_${Date.now()}`,
      code: customProductDraft.code.trim(),
      name,
      unitValueUsd: Math.max(0, numericValue(customProductDraft.unitValueUsd, 1000)),
      defaultQuantity: 1,
      description: customProductDraft.description.trim(),
      custom: true,
    };

    resetTargetDiscount();
    if (!persist) {
      setProposalCustomProducts((previous) => [...previous, product]);
      setCustomProductDraft(EMPTY_CUSTOM_PRODUCT);
      setIsAddingCustomProduct(false);
      return;
    }

    setCatalogProductBusy(true);
    setProposalOperationError("");
    try {
      const record = await api.createProposalCatalogProduct({
        code: product.code,
        name: product.name,
        unitValueUsd: product.unitValueUsd,
        defaultQuantity: 1,
        description: product.description,
        catalog: {
          family: "Personalizados",
          subfamily: "Produtos personalizados",
          folder: "Personalizados",
          reviewStatus: "",
          isPrimary: false,
        },
      });
      replaceCatalogProductRecord(record);
      setProposalOperationStatus("Produto salvo no catálogo compartilhado.");
      setCustomProductDraft(EMPTY_CUSTOM_PRODUCT);
      setIsAddingCustomProduct(false);
    } catch (error) {
      setProposalOperationError(error instanceof Error ? error.message : "Não foi possível salvar o produto.");
    } finally {
      setCatalogProductBusy(false);
    }
  }

  async function deleteCustomService(id: string) {
    if (!window.confirm("Excluir este módulo permanentemente?")) return;

    resetTargetDiscount();
    setProposalOperationError("");
    if (customServices.some((item) => item.id === id)) {
      try {
        await api.deleteProposalCatalogService(id);
      } catch (error) {
        setProposalOperationError(error instanceof Error ? error.message : "Não foi possível excluir o módulo.");
        return;
      }
    }
    setCustomServices((previous) => previous.filter((service) => service.id !== id));
    setProposalCustomServices((previous) => previous.filter((service) => service.id !== id));
    setSelectedIds((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    setServiceEdits((previous) => {
      const next = { ...previous };
      delete next[id];
      saveProposalServiceEdits(next);
      return next;
    });
    setProposalServiceEdits((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    setProposalOperationStatus("Módulo excluído.");
  }

  function cancelCustomModule() {
    setCustomDraft(EMPTY_CUSTOM_MODULE);
    setIsAddingCustom(false);
  }

  function cancelCustomProduct() {
    setCustomProductDraft(EMPTY_CUSTOM_PRODUCT);
    setIsAddingCustomProduct(false);
  }

  function handleTaxChange(value: string) {
    setTaxPercent(value);
    saveProposalConfig({ taxPercent: value, exchangeRate, softwareDiscountPercent });
    setSnapToTarget(false);
    setServiceTargetTotal(undefined);
    setSnapMessage("");
  }

  function handleExchangeRateChange(value: string) {
    setExchangeRate(value);
    saveProposalConfig({ taxPercent, exchangeRate: value, softwareDiscountPercent });
    resetTargetDiscount();
  }

  function handleSoftwareDiscountChange(value: string) {
    setSoftwareDiscountPercent(value);
    saveProposalConfig({ taxPercent, exchangeRate, softwareDiscountPercent: value });
    resetTargetDiscount();
  }

  function handleDiscountChange(value: string) {
    setDiscountPercent(value);
    setSnapToTarget(false);
    setServiceTargetTotal(undefined);
    setSnapMessage("");
  }

  function handleTargetTotalChange(value: string) {
    setTargetTotal(value);
    resetTargetDiscount();
  }

  function applyTargetDiscount() {
    if (totals.subtotal === 0 && totals.software.finalTotal === 0) {
      setSnapToTarget(false);
      setServiceTargetTotal(undefined);
      setSnapMessage("Selecione os serviços primeiro.");
      return;
    }

    const tax = numericValue(taxPercent, DEFAULT_TAX_PERCENT);
    const grandTarget = Math.max(0, numericValue(targetTotal, SNAP_TOTAL_TARGET));
    const target = calculateServiceDiscountForGrandTarget({
      serviceSubtotal: totals.subtotal,
      taxPercent: tax,
      softwareFinalTotal: totals.software.finalTotal,
      grandTarget,
    });

    if (target.kind === "software-exceeds-target") {
      setSnapToTarget(false);
      setServiceTargetTotal(undefined);
      setSnapMessage("Software já ultrapassa o total alvo.");
      return;
    }

    if (target.kind === "no-services") {
      setDiscountPercent("0");
      setSnapToTarget(false);
      setServiceTargetTotal(undefined);
      setSnapMessage("Selecione os serviços primeiro.");
      return;
    }

    if (target.kind === "no-discount-needed") {
      setDiscountPercent("0");
      setSnapToTarget(false);
      setServiceTargetTotal(undefined);
      setSnapMessage(`Total já está abaixo de R$ ${formatCurrency(grandTarget)} — nenhum desconto necessário.`);
      return;
    }

    setDiscountPercent(target.discountPercent.toFixed(8));
    setServiceTargetTotal(target.serviceTarget);
    setSnapToTarget(true);
    setSnapMessage(`Desconto de ${target.discountPercent.toFixed(2)}% nos serviços aplicado.`);
  }

  function saveRepresentative() {
    const name = representativeDraft.name.trim();
    const role = representativeDraft.role.trim();
    if (!name || !role) return;

    const representative: ProposalRepresentative = {
      id: `custom_rep_${customRepresentatives.length + 1}`,
      name,
      role,
    };

    setCustomRepresentatives((previous) => {
      const next = [...previous, representative];
      saveProposalRepresentatives(next);
      return next;
    });
    setSelectedRepresentativeId(representative.id);
    setRepresentativeDraft(EMPTY_REPRESENTATIVE_DRAFT);
    setIsAddingRepresentative(false);
  }

  function cancelRepresentative() {
    setRepresentativeDraft(EMPTY_REPRESENTATIVE_DRAFT);
    setIsAddingRepresentative(false);
  }

  function updateObservations(value: string) {
    setObservations(value);
    saveProposalObservations(value);
  }

  return (
    <div className={`proposals-page${isSoftwareCatalogOpen ? " is-software-catalog-open" : ""}`}>
      <aside className="proposals-sidebar">
        <header>
          <span>Holand Automação</span>
          <h1>Gerador de Propostas</h1>
        </header>

        <SavedProposalsPanel
          items={savedProposals}
          query={proposalSearch}
          activeId={activeProposalId}
          loading={proposalsLoading}
          saving={savingProposal}
          error={proposalOperationError}
          status={proposalOperationStatus}
          onQueryChange={setProposalSearch}
          onNew={() => resetToNewProposal()}
          onSave={saveCurrentProposal}
          onOpen={openSavedProposal}
          onDelete={deleteSavedProposal}
        />

        {isSoftwareCatalogOpen ? (
          <SoftwareCatalogExplorer
            products={catalogEntries}
            selectedIds={selectedProductIds}
            softwareSubtotalUsd={totals.software.totalUsd}
            adminDisabled={!catalogProductsReady || catalogProductBusy}
            onToggle={toggleProductSelected}
            onNewProduct={() => {
              setCatalogProductError("");
              setCatalogProductModal({ mode: "new" });
            }}
            onEditProduct={(product) => {
              setCatalogProductError("");
              setCatalogProductModal({ mode: "edit", product });
            }}
            onDone={closeSoftwareCatalog}
          />
        ) : (
          <>
        <section className="proposal-panel">
          <h2>Dados do Cliente</h2>
          <label>
            Razão Social
            <input value={client.companyName} onChange={(event) => setClientField("companyName", event.target.value)} placeholder="Ex: Krah Industria e Comercio..." />
          </label>
          <label>
            Endereço
            <input value={client.address} onChange={(event) => setClientField("address", event.target.value)} placeholder="Rua, nº - Bairro, Cidade - UF" />
          </label>
          <label>
            CEP
            <input value={client.cep} onChange={(event) => setClientField("cep", event.target.value)} placeholder="00000-000" />
          </label>
          <label>
            CNPJ
            <input value={client.cnpj} onChange={(event) => setClientField("cnpj", event.target.value)} placeholder="00.000.000/0001-00" />
          </label>
          <label>
            Contato
            <input value={client.contact} onChange={(event) => setClientField("contact", event.target.value)} placeholder="Nome do responsável" />
          </label>
          <label>
            E-mail
            <input value={client.email} onChange={(event) => setClientField("email", event.target.value)} placeholder="email@empresa.com.br" />
          </label>
        </section>

        <section className="proposal-panel">
          <h2>Proposta</h2>
          <label>
            Número da Proposta
            <input value={proposal.number} onChange={(event) => setProposalField("number", event.target.value)} />
          </label>
          <label>
            Data
            <input type="date" value={proposal.date} onChange={(event) => setProposalField("date", event.target.value)} />
          </label>
          <label>
            Validade
            <input type="number" min="1" value={proposal.validityDays} onChange={(event) => setProposalField("validityDays", event.target.value)} />
          </label>
          <label>
            Modalidade
            <select value={proposal.modality} onChange={(event) => setProposalField("modality", event.target.value)}>
              <option>Presencial</option>
              <option>Remoto / Online</option>
              <option>Presencial e Online</option>
            </select>
          </label>
        </section>

        <section className="proposal-panel proposal-services-panel proposal-products-panel">
          <div className="proposal-panel-title-row">
            <h2>Software / Produtos</h2>
          </div>

          <div className="proposal-exchange-card">
            <div className="proposal-money-row">
              <label htmlFor="proposal-exchange-rate">USD → BRL</label>
              <input
                id="proposal-exchange-rate"
                aria-label="Cotação USD para BRL"
                type="number"
                min="0.01"
                step="0.01"
                value={exchangeRate}
                onChange={(event) => handleExchangeRateChange(event.target.value)}
              />
              <span>R$/US$</span>
            </div>
            {selectedProducts.length > 0 ? (
              <small>
                US$ {formatUsdCurrency(totals.software.totalUsd)} × R$ {numericValue(exchangeRate, DEFAULT_EXCHANGE_RATE).toFixed(2)} = R${" "}
                {formatCurrency(totals.software.totalBrl)}
              </small>
            ) : null}
          </div>

          <SoftwareSelectionSummary
            products={selectedProducts}
            onOpenCatalog={() => setIsSoftwareCatalogOpen(true)}
            onEdit={(id) => openEditor("product", id)}
            onRemove={toggleProductSelected}
            openButtonRef={catalogTriggerRef}
          />

          <button type="button" className="proposal-add-module" onClick={() => setIsAddingCustomProduct(true)}>
            Adicionar produto personalizado
          </button>

          {isAddingCustomProduct ? (
            <div className="proposal-custom-form">
              <h3>Novo Produto</h3>
              <label>
                Código
                <input
                  aria-label="Código do produto personalizado"
                  value={customProductDraft.code}
                  onChange={(event) => setCustomProductDraft((previous) => ({ ...previous, code: event.target.value }))}
                />
              </label>
              <label>
                Nome
                <input
                  aria-label="Nome do produto personalizado"
                  value={customProductDraft.name}
                  onChange={(event) => setCustomProductDraft((previous) => ({ ...previous, name: event.target.value }))}
                />
              </label>
              <label>
                Valor USD
                <input
                  aria-label="Valor USD do produto personalizado"
                  type="number"
                  min="0"
                  step="0.01"
                  value={customProductDraft.unitValueUsd}
                  onChange={(event) => setCustomProductDraft((previous) => ({ ...previous, unitValueUsd: event.target.value }))}
                />
              </label>
              <label>
                Descrição
                <textarea
                  aria-label="Descrição do produto personalizado"
                  value={customProductDraft.description}
                  onChange={(event) => setCustomProductDraft((previous) => ({ ...previous, description: event.target.value }))}
                />
              </label>
              <div className="proposal-custom-actions">
                <button type="button" onClick={() => createCustomProduct(false)}>
                  Adicionar produto nesta proposta
                </button>
                <button type="button" onClick={() => createCustomProduct(true)}>
                  Salvar produto no catálogo
                </button>
                <button type="button" onClick={cancelCustomProduct}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          {activeProduct ? (
            <ProductEditorPanel
              product={activeProduct}
              onEdit={editProduct}
              onReset={resetProduct}
              onClose={() => setActiveEditor(null)}
            />
          ) : null}

        </section>

        <section className="proposal-panel proposal-services-panel">
          <div className="proposal-panel-title-row">
            <h2>Serviços</h2>
            <div>
              <button
                type="button"
                onClick={() => {
                  resetTargetDiscount();
                  setSelectedIds(new Set(services.map((service) => service.id)));
                }}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => {
                  resetTargetDiscount();
                  setSelectedIds(new Set());
                }}
              >
                Nenhum
              </button>
            </div>
          </div>

          {activeService ? (
            <ServiceEditorPanel
              service={activeService}
              onEdit={editService}
              onSaveDefault={saveServiceAsDefault}
              onReset={resetService}
              onClose={() => setActiveEditor(null)}
            />
          ) : null}

          {services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              selected={selectedIds.has(service.id)}
              onToggleSelected={toggleSelected}
              onOpenEditor={(id) => openEditor("service", id)}
              active={activeEditor?.kind === "service" && activeEditor.id === service.id}
              onDeleteCustom={deleteCustomService}
            />
          ))}

          <button type="button" className="proposal-add-module" onClick={() => setIsAddingCustom(true)}>
            Adicionar módulo personalizado
          </button>

          {isAddingCustom ? (
            <div className="proposal-custom-form">
              <h3>Novo Módulo</h3>
              <label>
                Código
                <input
                  aria-label="Código do módulo personalizado"
                  value={customDraft.code}
                  onChange={(event) => setCustomDraft((previous) => ({ ...previous, code: event.target.value }))}
                />
              </label>
              <label>
                Nome
                <input
                  aria-label="Nome do módulo personalizado"
                  value={customDraft.name}
                  onChange={(event) => setCustomDraft((previous) => ({ ...previous, name: event.target.value }))}
                />
              </label>
              <div className="proposal-custom-grid">
                <label>
                  Valor/dia
                  <input
                    aria-label="Valor por dia do módulo personalizado"
                    type="number"
                    min="0"
                    step="0.01"
                    value={customDraft.valuePerDay}
                    onChange={(event) => setCustomDraft((previous) => ({ ...previous, valuePerDay: event.target.value }))}
                  />
                </label>
                <label>
                  Dias padrão
                  <input
                    aria-label="Dias padrão do módulo personalizado"
                    type="number"
                    min="1"
                    value={customDraft.days}
                    onChange={(event) => setCustomDraft((previous) => ({ ...previous, days: event.target.value }))}
                  />
                </label>
              </div>
              <label>
                Descrição
                <textarea
                  aria-label="Descrição do módulo personalizado"
                  value={customDraft.description}
                  onChange={(event) => setCustomDraft((previous) => ({ ...previous, description: event.target.value }))}
                />
              </label>
              <div className="proposal-custom-actions">
                <button type="button" onClick={() => createCustomService(false)}>
                  Adicionar módulo nesta proposta
                </button>
                <button type="button" onClick={() => createCustomService(true)}>
                  Salvar módulo no catálogo
                </button>
                <button type="button" onClick={cancelCustomModule}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="proposal-panel">
          <h2>Descontos & Impostos</h2>
          <div className="proposal-discount-subtitle">Software</div>
          <div className="proposal-money-row">
            <label htmlFor="proposal-software-discount">Desconto</label>
            <input
              id="proposal-software-discount"
              aria-label="Desconto de software"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={softwareDiscountPercent}
              onChange={(event) => handleSoftwareDiscountChange(event.target.value)}
            />
            <span>%</span>
          </div>
          <div className="proposal-discount-subtitle">Serviços</div>
          <div className="proposal-money-row">
            <label htmlFor="proposal-tax">Imposto</label>
            <input id="proposal-tax" type="number" min="0" max="100" step="0.01" value={taxPercent} onChange={(event) => handleTaxChange(event.target.value)} />
            <span>%</span>
          </div>
          <div className="proposal-money-row">
            <label htmlFor="proposal-discount">Desconto</label>
            <input id="proposal-discount" type="number" min="0" max="100" step="0.5" value={discountPercent} onChange={(event) => handleDiscountChange(event.target.value)} />
            <span>%</span>
          </div>
          <div className="proposal-money-row">
            <label htmlFor="proposal-target-total">Total alvo</label>
            <input
              id="proposal-target-total"
              aria-label="Total alvo"
              type="number"
              min="0"
              step="0.01"
              value={targetTotal}
              onChange={(event) => handleTargetTotalChange(event.target.value)}
            />
            <span>R$</span>
          </div>
          <button type="button" className="proposal-target-discount" onClick={applyTargetDiscount}>
            Atingir total alvo
          </button>
          {snapMessage ? <p className="proposal-snap-message">{snapMessage}</p> : null}
          <label>
            Observações
            <textarea value={observations} onChange={(event) => updateObservations(event.target.value)} />
          </label>
        </section>

        <section className="proposal-panel">
          <h2>Representante Holand</h2>
          <label>
            Representante Holand
            <select value={selectedRepresentativeId} onChange={(event) => setSelectedRepresentativeId(event.target.value)} aria-label="Representante Holand">
              {representatives.map((representative) => (
                <option key={representative.id} value={representative.id}>
                  {representative.name} - {representative.role}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="proposal-add-module" onClick={() => setIsAddingRepresentative(true)}>
            Adicionar representante
          </button>

          {isAddingRepresentative ? (
            <div className="proposal-custom-form">
              <h3>Novo Representante</h3>
              <label>
                Nome
                <input
                  aria-label="Nome do representante"
                  value={representativeDraft.name}
                  onChange={(event) => setRepresentativeDraft((previous) => ({ ...previous, name: event.target.value }))}
                />
              </label>
              <label>
                Cargo/Função
                <input
                  aria-label="Cargo do representante"
                  value={representativeDraft.role}
                  onChange={(event) => setRepresentativeDraft((previous) => ({ ...previous, role: event.target.value }))}
                />
              </label>
              <div className="proposal-custom-actions">
                <button type="button" onClick={saveRepresentative}>
                  Salvar representante
                </button>
                <button type="button" onClick={cancelRepresentative}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <button
          type="button"
          className={`proposal-target-discount${includeRequirementsTerm ? " is-active" : ""}`}
          onClick={() => setIncludeRequirementsTerm((previous) => !previous)}
        >
          {includeRequirementsTerm ? "Remover termo de requisitos" : "Acrescentar termo de requisitos"}
        </button>

        <TotalsSummary
          hasProducts={selectedProducts.length > 0}
          hasServices={selectedServices.length > 0}
          softwareTotalUsd={totals.software.totalUsd}
          softwareDiscountValue={totals.software.discountValue}
          softwareFinalTotal={totals.software.finalTotal}
          serviceSubtotal={totals.subtotal}
          serviceTotalDays={totals.totalDays}
          serviceDiscountValue={totals.discountValue}
          taxPercent={numericValue(taxPercent, DEFAULT_TAX_PERCENT)}
          serviceTaxValue={totals.taxValue}
          serviceFinalTotalDisplay={totals.finalTotalDisplay}
          grandTotalDisplay={totals.grandTotalDisplay}
        />

        <button type="button" className="proposal-print" onClick={() => window.print()}>
          Imprimir / Salvar PDF
        </button>
          </>
        )}
      </aside>

      <main className="proposals-preview-wrap">
        <ProposalPreview
          client={client}
          proposal={proposal}
          selectedProducts={selectedProducts}
          selectedServices={selectedServices}
          observations={observations}
          taxPercent={numericValue(taxPercent, DEFAULT_TAX_PERCENT)}
          softwareDiscountPercent={numericValue(softwareDiscountPercent, 0)}
          discountPercent={numericValue(discountPercent, 0)}
          exchangeRate={numericValue(exchangeRate, DEFAULT_EXCHANGE_RATE)}
          totals={totals}
          representative={selectedRepresentative}
          includeRequirementsTerm={includeRequirementsTerm}
        />
      </main>

      {catalogProductModal ? (
        <SoftwareCatalogProductModal
          product={catalogProductModal.mode === "edit" ? catalogProductModal.product : null}
          busy={catalogProductBusy}
          error={catalogProductError}
          onClose={() => {
            if (!catalogProductBusy) setCatalogProductModal(null);
          }}
          onSave={saveCatalogProduct}
          onArchive={archiveCatalogProduct}
        />
      ) : null}
    </div>
  );
}
