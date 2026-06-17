import {
  loadProposalConfig,
  loadProposalObservations,
  loadProposalServiceEdits,
  loadProposalCustomServices,
  saveProposalConfig,
  saveProposalObservations,
  saveProposalServiceEdits,
  saveProposalCustomServices,
} from "./proposalStorage";
import { DEFAULT_OBSERVATIONS, type ProposalService } from "./proposalData";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("proposalStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads default observations when none are saved", () => {
    expect(loadProposalObservations()).toBe(DEFAULT_OBSERVATIONS);
  });

  it("saves and loads observations", () => {
    saveProposalObservations("Observacao comercial");
    expect(loadProposalObservations()).toBe("Observacao comercial");
  });

  it("saves and loads config", () => {
    saveProposalConfig({ taxPercent: "13.5" });
    expect(loadProposalConfig()).toEqual({ taxPercent: "13.5" });
  });

  it("saves and loads custom services", () => {
    const services: ProposalService[] = [
      {
        id: "custom_1",
        code: "X",
        name: "Servico customizado",
        valuePerDay: 1000,
        defaultDurationDays: 1,
        description: "Descricao",
        custom: true,
      },
    ];

    saveProposalCustomServices(services);
    expect(loadProposalCustomServices()).toEqual(services);
  });

  it("saves and loads service edits", () => {
    saveProposalServiceEdits({
      s1: { name: "Nome editado", valuePerDay: 2000, durationDays: 4, description: "Nova desc" },
    });

    expect(loadProposalServiceEdits()).toEqual({
      s1: { name: "Nome editado", valuePerDay: 2000, durationDays: 4, description: "Nova desc" },
    });
  });

  it("falls back when saved JSON is malformed", () => {
    localStorage.setItem("holand_config", "{");
    localStorage.setItem("holand_custom_services", "{");
    localStorage.setItem("holand_service_edits", "{");

    expect(loadProposalConfig()).toEqual({});
    expect(loadProposalCustomServices()).toEqual([]);
    expect(loadProposalServiceEdits()).toEqual({});
  });

  it("falls back when saved JSON has the wrong shape", () => {
    localStorage.setItem("holand_config", JSON.stringify("oops"));
    localStorage.setItem("holand_custom_services", JSON.stringify({}));
    localStorage.setItem("holand_service_edits", JSON.stringify([]));

    expect(loadProposalConfig()).toEqual({});
    expect(loadProposalCustomServices()).toEqual([]);
    expect(loadProposalServiceEdits()).toEqual({});
  });

  it("falls back when saved custom services or service edits contain invalid entries", () => {
    const validService: ProposalService = {
      id: "custom_1",
      code: "X",
      name: "Servico customizado",
      valuePerDay: 1000,
      defaultDurationDays: 1,
      description: "Descricao",
      custom: true,
    };
    const validEdit = {
      name: "Nome editado",
      valuePerDay: 2000,
      durationDays: 4,
      description: "Nova desc",
    };

    localStorage.setItem(
      "holand_custom_services",
      JSON.stringify([validService, { ...validService, valuePerDay: "1000" }]),
    );
    localStorage.setItem(
      "holand_service_edits",
      JSON.stringify({ s1: validEdit, s2: { ...validEdit, durationDays: "4" } }),
    );

    expect(loadProposalCustomServices()).toEqual([]);
    expect(loadProposalServiceEdits()).toEqual({});
  });

  it("keeps only string taxPercent from saved config", () => {
    localStorage.setItem("holand_config", JSON.stringify({ taxPercent: "13.5", extra: true }));
    expect(loadProposalConfig()).toEqual({ taxPercent: "13.5" });

    localStorage.setItem("holand_config", JSON.stringify({ taxPercent: 13.5 }));
    expect(loadProposalConfig()).toEqual({});
  });

  it("does not throw when storage reads fail and keeps load fallbacks safe", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(() => loadProposalObservations()).not.toThrow();
    expect(() => loadProposalConfig()).not.toThrow();
    expect(() => loadProposalCustomServices()).not.toThrow();
    expect(() => loadProposalServiceEdits()).not.toThrow();
    expect(loadProposalObservations()).toBe(DEFAULT_OBSERVATIONS);
    expect(loadProposalConfig()).toEqual({});
    expect(loadProposalCustomServices()).toEqual([]);
    expect(loadProposalServiceEdits()).toEqual({});
  });

  it("does not throw when storage writes fail", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(() => saveProposalObservations("Observacao comercial")).not.toThrow();
    expect(() => saveProposalConfig({ taxPercent: "13.5" })).not.toThrow();
    expect(() => saveProposalCustomServices([])).not.toThrow();
    expect(() => saveProposalServiceEdits({})).not.toThrow();
  });
});
