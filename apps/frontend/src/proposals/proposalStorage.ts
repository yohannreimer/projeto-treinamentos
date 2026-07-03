import { DEFAULT_OBSERVATIONS, type ProposalProduct, type ProposalService } from "./proposalData";

export type ProposalConfig = {
  taxPercent: string;
  exchangeRate?: string;
  softwareDiscountPercent?: string;
};

export type ProposalServiceEdit = {
  name: string;
  valuePerDay: number;
  durationDays: number;
  description: string;
};

export type ProposalServiceEdits = Record<string, ProposalServiceEdit>;

export type ProposalProductEdit = {
  name: string;
  unitValueUsd: number;
  description: string;
};

export type ProposalProductEdits = Record<string, ProposalProductEdit>;

export type ProposalRepresentative = {
  id: string;
  name: string;
  role: string;
};

const OBSERVATIONS_KEY = "holand_obs";
const CONFIG_KEY = "holand_config";
const CUSTOM_SERVICES_KEY = "holand_custom_services";
const CUSTOM_PRODUCTS_KEY = "holand_custom_products";
const REPRESENTATIVES_KEY = "holand_representatives";
const SERVICE_EDITS_KEY = "holand_service_edits";
const PRODUCT_EDITS_KEY = "holand_product_edits";

function readJson(key: string): unknown {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : undefined;
  } catch {
    return undefined;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preserve the standalone HTML behavior: storage failures should not break the generator.
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isProposalService(value: unknown): value is ProposalService {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.code === "string" &&
    typeof value.name === "string" &&
    typeof value.valuePerDay === "number" &&
    typeof value.defaultDurationDays === "number" &&
    typeof value.description === "string" &&
    (value.custom === undefined || typeof value.custom === "boolean")
  );
}

function isProposalProduct(value: unknown): value is ProposalProduct {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.code === "string" &&
    typeof value.name === "string" &&
    typeof value.unitValueUsd === "number" &&
    typeof value.defaultQuantity === "number" &&
    typeof value.description === "string" &&
    (value.custom === undefined || typeof value.custom === "boolean")
  );
}

function isProposalRepresentative(value: unknown): value is ProposalRepresentative {
  if (!isPlainObject(value)) {
    return false;
  }

  return typeof value.id === "string" && typeof value.name === "string" && typeof value.role === "string";
}

function isProposalServiceEdit(value: unknown): value is ProposalServiceEdit {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.name === "string" &&
    typeof value.valuePerDay === "number" &&
    typeof value.durationDays === "number" &&
    typeof value.description === "string"
  );
}

function isProposalProductEdit(value: unknown): value is ProposalProductEdit {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.name === "string" &&
    typeof value.unitValueUsd === "number" &&
    typeof value.description === "string"
  );
}

function normalizeProposalProductEdit(value: unknown): ProposalProductEdit | null {
  if (!isProposalProductEdit(value)) {
    return null;
  }

  return {
    name: value.name,
    unitValueUsd: value.unitValueUsd,
    description: value.description,
  };
}

export function loadProposalObservations(): string {
  try {
    const saved = localStorage.getItem(OBSERVATIONS_KEY);
    return saved !== null ? saved : DEFAULT_OBSERVATIONS;
  } catch {
    return DEFAULT_OBSERVATIONS;
  }
}

export function saveProposalObservations(value: string): void {
  try {
    localStorage.setItem(OBSERVATIONS_KEY, value);
  } catch {
    // Keep the page usable when storage is unavailable.
  }
}

export function loadProposalConfig(): Partial<ProposalConfig> {
  const parsed = readJson(CONFIG_KEY);
  if (!isPlainObject(parsed)) {
    return {};
  }

  const config: Partial<ProposalConfig> = {};

  if (typeof parsed.taxPercent === "string") {
    config.taxPercent = parsed.taxPercent;
  }
  if (typeof parsed.exchangeRate === "string") {
    config.exchangeRate = parsed.exchangeRate;
  }
  if (typeof parsed.softwareDiscountPercent === "string") {
    config.softwareDiscountPercent = parsed.softwareDiscountPercent;
  }

  return config;
}

export function saveProposalConfig(value: ProposalConfig): void {
  writeJson(CONFIG_KEY, value);
}

export function loadProposalCustomServices(): ProposalService[] {
  const parsed = readJson(CUSTOM_SERVICES_KEY);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.every(isProposalService) ? parsed : [];
}

export function saveProposalCustomServices(value: ProposalService[]): void {
  writeJson(CUSTOM_SERVICES_KEY, value);
}

export function loadProposalCustomProducts(): ProposalProduct[] {
  const parsed = readJson(CUSTOM_PRODUCTS_KEY);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.every(isProposalProduct) ? parsed : [];
}

export function saveProposalCustomProducts(value: ProposalProduct[]): void {
  writeJson(CUSTOM_PRODUCTS_KEY, value);
}

export function loadProposalRepresentatives(): ProposalRepresentative[] {
  const parsed = readJson(REPRESENTATIVES_KEY);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.every(isProposalRepresentative) ? parsed : [];
}

export function saveProposalRepresentatives(value: ProposalRepresentative[]): void {
  writeJson(REPRESENTATIVES_KEY, value);
}

export function loadProposalServiceEdits(): ProposalServiceEdits {
  const parsed = readJson(SERVICE_EDITS_KEY);
  if (!isPlainObject(parsed)) {
    return {};
  }

  return Object.values(parsed).every(isProposalServiceEdit) ? (parsed as ProposalServiceEdits) : {};
}

export function saveProposalServiceEdits(value: ProposalServiceEdits): void {
  writeJson(SERVICE_EDITS_KEY, value);
}

export function loadProposalProductEdits(): ProposalProductEdits {
  const parsed = readJson(PRODUCT_EDITS_KEY);
  if (!isPlainObject(parsed)) {
    return {};
  }

  const entries = Object.entries(parsed).map(([id, value]) => [id, normalizeProposalProductEdit(value)] as const);
  if (entries.some(([, value]) => value === null)) {
    return {};
  }

  return Object.fromEntries(entries) as ProposalProductEdits;
}

export function saveProposalProductEdits(value: ProposalProductEdits): void {
  writeJson(PRODUCT_EDITS_KEY, value);
}
