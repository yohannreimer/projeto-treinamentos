import {
  loadProposalConfig,
  loadProposalObservations,
  loadProposalProductEdits,
  loadProposalServiceEdits,
  loadProposalCustomServices,
  loadProposalCustomProducts,
  loadProposalRepresentatives,
  saveProposalConfig,
  saveProposalObservations,
  saveProposalProductEdits,
  saveProposalServiceEdits,
  saveProposalCustomServices,
  saveProposalCustomProducts,
  saveProposalRepresentatives,
} from "./proposalStorage";
import { DEFAULT_OBSERVATIONS, type ProposalProduct, type ProposalService } from "./proposalData";

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
    saveProposalConfig({ taxPercent: "13.5", exchangeRate: "5.75", softwareDiscountPercent: "8" });
    expect(loadProposalConfig()).toEqual({ taxPercent: "13.5", exchangeRate: "5.75", softwareDiscountPercent: "8" });
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

  it("saves and loads custom products", () => {
    const products: ProposalProduct[] = [
      {
        id: "custom_product_1",
        code: "9000",
        name: "Produto customizado",
        unitValueUsd: 2500,
        defaultQuantity: 1,
        description: "Descricao",
        custom: true,
      },
    ];

    saveProposalCustomProducts(products);
    expect(loadProposalCustomProducts()).toEqual(products);
  });

  it("saves and loads representatives", () => {
    const representatives = [
      {
        id: "rep_1",
        name: "Joao Silva",
        role: "Vendedor da Holand Automacao de Engenharias Ltda",
      },
    ];

    saveProposalRepresentatives(representatives);
    expect(loadProposalRepresentatives()).toEqual(representatives);
  });

  it("saves and loads service edits", () => {
    saveProposalServiceEdits({
      s1: { name: "Nome editado", valuePerDay: 2000, durationDays: 4, description: "Nova desc" },
    });

    expect(loadProposalServiceEdits()).toEqual({
      s1: { name: "Nome editado", valuePerDay: 2000, durationDays: 4, description: "Nova desc" },
    });
  });

  it("saves and loads product edits", () => {
    saveProposalProductEdits({
      p1: { name: "Produto editado", unitValueUsd: 1200, description: "Nova desc" },
    });

    expect(loadProposalProductEdits()).toEqual({
      p1: { name: "Produto editado", unitValueUsd: 1200, description: "Nova desc" },
    });
  });

  it("ignores legacy product edit quantities when loading persisted defaults", () => {
    localStorage.setItem(
      "holand_product_edits",
      JSON.stringify({
        p1: { name: "Produto editado", unitValueUsd: 1200, quantity: 3, description: "Nova desc" },
      }),
    );

    expect(loadProposalProductEdits()).toEqual({
      p1: { name: "Produto editado", unitValueUsd: 1200, description: "Nova desc" },
    });
  });

  it("falls back when saved JSON is malformed", () => {
    localStorage.setItem("holand_config", "{");
    localStorage.setItem("holand_custom_services", "{");
    localStorage.setItem("holand_custom_products", "{");
    localStorage.setItem("holand_representatives", "{");
    localStorage.setItem("holand_service_edits", "{");
    localStorage.setItem("holand_product_edits", "{");

    expect(loadProposalConfig()).toEqual({});
    expect(loadProposalCustomServices()).toEqual([]);
    expect(loadProposalCustomProducts()).toEqual([]);
    expect(loadProposalRepresentatives()).toEqual([]);
    expect(loadProposalServiceEdits()).toEqual({});
    expect(loadProposalProductEdits()).toEqual({});
  });

  it("falls back when saved JSON has the wrong shape", () => {
    localStorage.setItem("holand_config", JSON.stringify("oops"));
    localStorage.setItem("holand_custom_services", JSON.stringify({}));
    localStorage.setItem("holand_custom_products", JSON.stringify({}));
    localStorage.setItem("holand_representatives", JSON.stringify({}));
    localStorage.setItem("holand_service_edits", JSON.stringify([]));
    localStorage.setItem("holand_product_edits", JSON.stringify([]));

    expect(loadProposalConfig()).toEqual({});
    expect(loadProposalCustomServices()).toEqual([]);
    expect(loadProposalCustomProducts()).toEqual([]);
    expect(loadProposalRepresentatives()).toEqual([]);
    expect(loadProposalServiceEdits()).toEqual({});
    expect(loadProposalProductEdits()).toEqual({});
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

  it("falls back when saved product edits contain invalid entries", () => {
    const validEdit = {
      name: "Produto editado",
      unitValueUsd: 1200,
      description: "Nova desc",
    };

    localStorage.setItem(
      "holand_product_edits",
      JSON.stringify({ p1: validEdit, p2: { ...validEdit, unitValueUsd: "1200" } }),
    );

    expect(loadProposalProductEdits()).toEqual({});
  });

  it("falls back when saved custom products contain invalid entries", () => {
    const validProduct: ProposalProduct = {
      id: "custom_product_1",
      code: "9000",
      name: "Produto customizado",
      unitValueUsd: 2500,
      defaultQuantity: 1,
      description: "Descricao",
      custom: true,
    };

    localStorage.setItem(
      "holand_custom_products",
      JSON.stringify([validProduct, { ...validProduct, unitValueUsd: "2500" }]),
    );

    expect(loadProposalCustomProducts()).toEqual([]);
  });

  it("falls back when saved representatives contain invalid entries", () => {
    const validRepresentative = {
      id: "rep_1",
      name: "Joao Silva",
      role: "Vendedor da Holand Automacao de Engenharias Ltda",
    };

    localStorage.setItem(
      "holand_representatives",
      JSON.stringify([validRepresentative, { ...validRepresentative, role: 123 }]),
    );

    expect(loadProposalRepresentatives()).toEqual([]);
  });

  it("keeps only string taxPercent from saved config", () => {
    localStorage.setItem(
      "holand_config",
      JSON.stringify({ taxPercent: "13.5", exchangeRate: "5.75", softwareDiscountPercent: "8", extra: true }),
    );
    expect(loadProposalConfig()).toEqual({ taxPercent: "13.5", exchangeRate: "5.75", softwareDiscountPercent: "8" });

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
    expect(() => loadProposalCustomProducts()).not.toThrow();
    expect(() => loadProposalRepresentatives()).not.toThrow();
    expect(() => loadProposalServiceEdits()).not.toThrow();
    expect(() => loadProposalProductEdits()).not.toThrow();
    expect(loadProposalObservations()).toBe(DEFAULT_OBSERVATIONS);
    expect(loadProposalConfig()).toEqual({});
    expect(loadProposalCustomServices()).toEqual([]);
    expect(loadProposalCustomProducts()).toEqual([]);
    expect(loadProposalRepresentatives()).toEqual([]);
    expect(loadProposalServiceEdits()).toEqual({});
    expect(loadProposalProductEdits()).toEqual({});
  });

  it("does not throw when storage writes fail", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(() => saveProposalObservations("Observacao comercial")).not.toThrow();
    expect(() => saveProposalConfig({ taxPercent: "13.5" })).not.toThrow();
    expect(() => saveProposalCustomServices([])).not.toThrow();
    expect(() => saveProposalCustomProducts([])).not.toThrow();
    expect(() => saveProposalRepresentatives([])).not.toThrow();
    expect(() => saveProposalServiceEdits({})).not.toThrow();
    expect(() => saveProposalProductEdits({})).not.toThrow();
  });
});
