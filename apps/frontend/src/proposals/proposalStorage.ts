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

function readJson<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preserve the standalone HTML behavior: storage failures should not break the generator.
  }
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
  return readJson<Partial<ProposalConfig>>(CONFIG_KEY, {});
}

export function saveProposalConfig(value: ProposalConfig): void {
  writeJson(CONFIG_KEY, value);
}

export function loadProposalCustomServices(): ProposalService[] {
  return readJson<ProposalService[]>(CUSTOM_SERVICES_KEY, []);
}

export function saveProposalCustomServices(value: ProposalService[]): void {
  writeJson(CUSTOM_SERVICES_KEY, value);
}

export function loadProposalServiceEdits(): ProposalServiceEdits {
  return readJson<ProposalServiceEdits>(SERVICE_EDITS_KEY, {});
}

export function saveProposalServiceEdits(value: ProposalServiceEdits): void {
  writeJson(SERVICE_EDITS_KEY, value);
}
