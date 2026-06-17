import { DEFAULT_OBSERVATIONS, type ProposalService } from "./proposalData";

export type ProposalConfig = {
  taxPercent: string;
};

export type ProposalServiceEdit = {
  name: string;
  valuePerDay: number;
  durationDays: number;
  description: string;
};

export type ProposalServiceEdits = Record<string, ProposalServiceEdit>;

const OBSERVATIONS_KEY = "holand_obs";
const CONFIG_KEY = "holand_config";
const CUSTOM_SERVICES_KEY = "holand_custom_services";
const SERVICE_EDITS_KEY = "holand_service_edits";

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

  return typeof parsed.taxPercent === "string" ? { taxPercent: parsed.taxPercent } : {};
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
