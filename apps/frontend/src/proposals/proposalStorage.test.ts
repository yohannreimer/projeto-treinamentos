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

import { beforeEach, describe, expect, it } from "vitest";

describe("proposalStorage", () => {
  beforeEach(() => {
    localStorage.clear();
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
});
