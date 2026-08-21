import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { PROPOSAL_SERVICES } from "../proposals/proposalData";
import type { ProposalDocumentV1 } from "../proposals/proposalDocument";
import { api, type ProposalSummary, type ProposalWritePayload } from "../services/api";
import { ProposalsPage } from "./ProposalsPage";

vi.mock("../services/api", () => ({
  api: {
    proposals: vi.fn(),
    proposal: vi.fn(),
    createProposal: vi.fn(),
    updateProposal: vi.fn(),
    deleteProposal: vi.fn(),
    proposalCatalogServices: vi.fn(),
    createProposalCatalogService: vi.fn(),
    updateProposalCatalogService: vi.fn(),
    deleteProposalCatalogService: vi.fn(),
  },
}));

const savedSummary: ProposalSummary = {
  id: "proposal-1",
  number: "P-001",
  client_company_name: "Cliente salvo",
  created_by: "user-1",
  updated_by: "user-1",
  created_at: "2026-06-17T10:00:00.000Z",
  updated_at: "2026-06-17T11:00:00.000Z",
};

const savedDocument: ProposalDocumentV1 = {
  version: 1,
  client: { companyName: "Cliente salvo", address: "Rua A", cep: "", cnpj: "", contact: "Ana", email: "" },
  proposal: { number: "P-001", date: "2026-06-17", validityDays: "15", modality: "Presencial" },
  selectedServiceIds: [PROPOSAL_SERVICES[0].id],
  selectedProductIds: [],
  serviceSnapshots: [PROPOSAL_SERVICES[0]],
  productSnapshots: [],
  proposalCustomServices: [],
  proposalCustomProducts: [],
  proposalServiceEdits: {},
  proposalProductEdits: {},
  taxPercent: "12",
  exchangeRate: "5.80",
  softwareDiscountPercent: "0",
  discountPercent: "0",
  targetTotal: "54000",
  selectedRepresentative: {
    id: "leonardo_holand",
    name: "Leonardo Holand",
    role: "Diretor Comercial da Holand Automação de Engenharias Ltda",
  },
  includeRequirementsTerm: false,
  snapToTarget: false,
  serviceTargetTotal: null,
  observations: "Observação salva",
};

async function addSoftwareFromCatalog(
  user: ReturnType<typeof userEvent.setup>,
  query: string,
  productName: string | RegExp,
) {
  await user.click(screen.getByRole("button", { name: "Adicionar software do catálogo" }));
  await user.type(screen.getByRole("searchbox", { name: "Buscar software" }), query);
  await user.click(screen.getByRole("button", { name: productName }));
  await user.click(screen.getByRole("button", { name: "Concluir seleção" }));
}

describe("ProposalsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-17T12:00:00-03:00"));
    vi.mocked(api.proposals).mockResolvedValue({ items: [] });
    vi.mocked(api.proposalCatalogServices).mockResolvedValue({ items: [] });
    vi.mocked(api.createProposalCatalogService).mockImplementation(async (payload) => ({
      id: "shared-service-1",
      ...payload,
      custom: true,
    }));
    vi.mocked(api.updateProposalCatalogService).mockImplementation(async (id, payload) => ({
      id,
      ...payload,
      custom: true,
    }));
    vi.mocked(api.deleteProposalCatalogService).mockResolvedValue({ ok: true });
    vi.mocked(api.deleteProposal).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("renders shell and default preview", () => {
    render(<ProposalsPage />);

    expect(screen.getByRole("heading", { name: "Gerador de Propostas" })).toBeInTheDocument();
    expect(screen.getByLabelText("Número da Proposta")).toHaveValue("P23005_OS");
    expect(screen.getByLabelText("Data")).toHaveValue("2026-06-17");
    expect(screen.getByLabelText("Validade")).toHaveValue(11);
    expect(screen.getByLabelText("Modalidade")).toHaveValue("Presencial e Online");

    const preview = screen.getByRole("region", { name: "Prévia da proposta" });
    expect(within(preview).getByText("Selecione software ou serviços no painel ao lado.")).toBeInTheDocument();
    expect(within(preview).getByText("P23005_OS")).toBeInTheDocument();
    expect(within(preview).getByText("Joinville, 17 de Junho de 2026")).toBeInTheDocument();
  });

  test("opens software catalog while keeping proposal preview mounted", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await user.click(screen.getByRole("button", { name: "Adicionar software do catálogo" }));
    expect(screen.getByRole("region", { name: "Catálogo de software" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Prévia da proposta" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Serviços" })).not.toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Buscar software" }), "Ext/Cam M2 Milling 7");
    await user.click(screen.getByRole("button", { name: /Adicionar Ext\/Cam M2 Milling 7 - Módulo - 0500/ }));
    expect(within(screen.getByRole("region", { name: "Prévia da proposta" })).getByText(/Ext\/Cam M2 Milling 7 - Módulo - 0500/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Concluir seleção" }));
    expect(screen.getByRole("heading", { name: "Serviços" })).toBeInTheDocument();
    expect(screen.getByText("Ext/Cam M2 Milling 7 - Módulo - 0500")).toBeInTheDocument();
  });

  test("returns focus to the catalog trigger after Escape", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);
    const trigger = screen.getByRole("button", { name: "Adicionar software do catálogo" });

    await user.click(trigger);
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Adicionar software do catálogo" })).toHaveFocus(),
    );
  });

  test("creates on first manual save and updates the same proposal afterwards", async () => {
    vi.mocked(api.createProposal).mockResolvedValue({ id: "proposal-1", updated_at: "2026-06-17T12:00:00.000Z" });
    vi.mocked(api.updateProposal).mockResolvedValue({ id: "proposal-1", updated_at: "2026-06-17T12:05:00.000Z" });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await user.clear(screen.getByLabelText("Número da Proposta"));
    await user.type(screen.getByLabelText("Número da Proposta"), "P-900");
    await user.type(screen.getByLabelText("Razão Social"), "Cliente Persistido");
    await user.click(screen.getByRole("button", { name: "Salvar proposta" }));

    expect(await screen.findByText("Proposta salva.")).toBeInTheDocument();
    expect(api.createProposal).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText("Contato"), "Maria");
    await user.click(screen.getByRole("button", { name: "Salvar proposta" }));
    expect(api.updateProposal).toHaveBeenCalledWith(
      "proposal-1",
      expect.objectContaining({ number: "P-900", client_company_name: "Cliente Persistido" }),
    );
  });

  test("manually saves and reopens a proposal with a generated catalog product", async () => {
    const camSummary: ProposalSummary = { ...savedSummary, number: "P-CAM" };
    let savedPayload: ProposalWritePayload | undefined;
    vi.mocked(api.proposals)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValue({ items: [camSummary] });
    vi.mocked(api.createProposal).mockImplementation(async (payload) => {
      savedPayload = payload;
      return { id: camSummary.id, updated_at: camSummary.updated_at };
    });
    vi.mocked(api.proposal).mockImplementation(async () => ({
      ...camSummary,
      document: savedPayload!.document,
    }));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await user.clear(screen.getByLabelText("Número da Proposta"));
    await user.type(screen.getByLabelText("Número da Proposta"), "P-CAM");
    await addSoftwareFromCatalog(user, "0500", /Adicionar Ext\/Cam M2 Milling 7 - Módulo - 0500/);
    await user.click(screen.getByRole("button", { name: "Salvar proposta" }));

    expect(await screen.findByText("Proposta salva.")).toBeInTheDocument();
    expect(savedPayload?.document.selectedProductIds).toContain("p4");
    expect(savedPayload?.document.productSnapshots).toEqual([
      expect.objectContaining({ id: "p4", code: "0500", name: "Ext/Cam M2 Milling 7 - Módulo - 0500" }),
    ]);

    await user.click(screen.getByRole("button", { name: "Nova proposta" }));
    expect(screen.queryByText("Ext/Cam M2 Milling 7 - Módulo - 0500")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Abrir P-CAM" }));

    expect(screen.getByText("Ext/Cam M2 Milling 7 - Módulo - 0500")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Prévia da proposta" })).getByText(/Ext\/Cam M2 Milling 7 - Módulo - 0500/)).toBeInTheDocument();
  });

  test("opens a saved proposal and restores fields and selections", async () => {
    vi.mocked(api.proposals).mockResolvedValue({ items: [savedSummary] });
    vi.mocked(api.proposal).mockResolvedValue({ ...savedSummary, document: savedDocument });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await user.click(await screen.findByRole("button", { name: "Abrir P-001" }));

    expect(screen.getByLabelText("Razão Social")).toHaveValue("Cliente salvo");
    expect(screen.getByLabelText("Contato")).toHaveValue("Ana");
    expect(screen.getByRole("checkbox", { name: `Selecionar ${PROPOSAL_SERVICES[0].name}` })).toBeChecked();
  });

  test("keeps edited fields when saving fails", async () => {
    vi.mocked(api.createProposal).mockRejectedValue(new Error("Falha de conexão com a API."));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await user.type(screen.getByLabelText("Razão Social"), "Não perder");
    await user.click(screen.getByRole("button", { name: "Salvar proposta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Falha de conexão");
    expect(screen.getByLabelText("Razão Social")).toHaveValue("Não perder");
  });

  test("asks before replacing unsaved changes", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.mocked(api.proposals).mockResolvedValue({ items: [savedSummary] });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await user.type(screen.getByLabelText("Razão Social"), "Rascunho");
    await user.click(await screen.findByRole("button", { name: "Abrir P-001" }));

    expect(window.confirm).toHaveBeenCalledWith("Descartar alterações não salvas?");
    expect(api.proposal).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Razão Social")).toHaveValue("Rascunho");
  });

  test("selecting Treinamento TopSolid'Design 7 - Básico updates totals and preview", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await user.click(screen.getByRole("checkbox", { name: "Selecionar Treinamento TopSolid'Design 7 - Básico" }));

    const totals = screen.getByRole("region", { name: "Totais da proposta" });
    expect(within(totals).getByText("R$ 5.100,00")).toBeInTheDocument();
    expect(within(totals).getByText("3 dia(s)")).toBeInTheDocument();
    expect(within(totals).getByText("R$ 612,00")).toBeInTheDocument();
    expect(within(totals).getAllByText("R$ 5.712,00").length).toBeGreaterThan(0);

    const preview = screen.getByRole("region", { name: "Prévia da proposta" });
    expect(within(preview).getByText("Treinamento TopSolid'Design 7 - Básico")).toBeInTheDocument();
    expect(within(preview).getByText("Criação de peças prismáticas e de revolução, montagens, desenhos de fabricação, utilização de componentes inteligentes e gerenciamento dos arquivos no PDM.")).toBeInTheDocument();
    expect(within(preview).getAllByText("R$ 5.100,00").length).toBeGreaterThan(0);
  });

  test("selecting software product updates software totals, preview, and grand total", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await addSoftwareFromCatalog(user, "1120", /Adicionar TopSolid’Pdm Server 7 - Módulo - 1120/);

    const totals = screen.getByRole("region", { name: "Totais da proposta" });
    expect(within(totals).getByText("US$ 1,000.00")).toBeInTheDocument();
    expect(within(totals).getAllByText("R$ 5.800,00").length).toBeGreaterThan(0);

    const preview = screen.getByRole("region", { name: "Prévia da proposta" });
    expect(within(preview).getByText("II – Software / Licenças")).toBeInTheDocument();
    expect(within(preview).getByText("1120 – TopSolid’Pdm Server 7 - Módulo - 1120")).toBeInTheDocument();
    expect(within(preview).getAllByText("US$ 1,000.00").length).toBeGreaterThan(0);
    expect(within(preview).getAllByText("R$ 5.800,00").length).toBeGreaterThan(0);
    expect(within(preview).getByText("III – Resumo Financeiro")).toBeInTheDocument();
  });

  test("editing software quantity, exchange rate, and discount updates totals without expanding the card", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await addSoftwareFromCatalog(user, "1120", /Adicionar TopSolid’Pdm Server 7 - Módulo - 1120/);
    await user.click(screen.getByRole("button", { name: "Editar TopSolid’Pdm Server 7 - Módulo - 1120" }));
    expect(screen.getByRole("region", { name: "Editor de produto" })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Quantidade nesta proposta de TopSolid’Pdm Server 7 - Módulo - 1120"));
    await user.type(screen.getByLabelText("Quantidade nesta proposta de TopSolid’Pdm Server 7 - Módulo - 1120"), "2");
    await user.clear(screen.getByLabelText("Cotação USD para BRL"));
    await user.type(screen.getByLabelText("Cotação USD para BRL"), "6");
    await user.clear(screen.getByLabelText("Desconto de software"));
    await user.type(screen.getByLabelText("Desconto de software"), "10");

    const totals = screen.getByRole("region", { name: "Totais da proposta" });
    expect(within(totals).getByText("US$ 2,000.00")).toBeInTheDocument();
    expect(within(totals).getByText("- R$ 1.200,00")).toBeInTheDocument();
    expect(within(totals).getAllByText("R$ 10.800,00").length).toBeGreaterThan(0);
  });

  test("product quantity is proposal-only but saving value as default persists without quantity", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = render(<ProposalsPage />);

    await addSoftwareFromCatalog(user, "1120", /Adicionar TopSolid’Pdm Server 7 - Módulo - 1120/);
    await user.click(screen.getByRole("button", { name: "Editar TopSolid’Pdm Server 7 - Módulo - 1120" }));
    await user.clear(screen.getByLabelText("Quantidade nesta proposta de TopSolid’Pdm Server 7 - Módulo - 1120"));
    await user.type(screen.getByLabelText("Quantidade nesta proposta de TopSolid’Pdm Server 7 - Módulo - 1120"), "3");
    await user.clear(screen.getByLabelText("Valor USD nesta proposta de TopSolid’Pdm Server 7 - Módulo - 1120"));
    await user.type(screen.getByLabelText("Valor USD nesta proposta de TopSolid’Pdm Server 7 - Módulo - 1120"), "1200");
    await user.click(screen.getByRole("button", { name: "Salvar produto como padrão" }));

    unmount();
    render(<ProposalsPage />);

    await user.click(screen.getByRole("button", { name: "Adicionar software do catálogo" }));
    await user.type(screen.getByRole("searchbox", { name: "Buscar software" }), "1120");
    const addButton = screen.getByRole("button", { name: /Adicionar TopSolid’Pdm Server 7 - Módulo - 1120/ });
    expect(within(addButton.closest("article")!).getByText("US$ 1,200.00")).toBeInTheDocument();
  });

  test("maintenance is optional per proposal and increases software unit value simply", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await addSoftwareFromCatalog(user, "0030", /Adicionar TopSolid’Design Pro 7 - Módulo - 0030/);
    await user.click(screen.getByRole("button", { name: "Editar TopSolid’Design Pro 7 - Módulo - 0030" }));
    await user.click(screen.getByLabelText("Ativar manutenção de TopSolid’Design Pro 7 - Módulo - 0030"));
    await user.clear(screen.getByLabelText("Percentual anual de manutenção de TopSolid’Design Pro 7 - Módulo - 0030"));
    await user.type(screen.getByLabelText("Percentual anual de manutenção de TopSolid’Design Pro 7 - Módulo - 0030"), "10");
    await user.clear(screen.getByLabelText("Anos de manutenção de TopSolid’Design Pro 7 - Módulo - 0030"));
    await user.type(screen.getByLabelText("Anos de manutenção de TopSolid’Design Pro 7 - Módulo - 0030"), "3");

    const preview = screen.getByRole("region", { name: "Prévia da proposta" });
    expect(within(preview).getByText("0030 – TopSolid’Design Pro 7 - Módulo - 0030 + 3 anos de manutenção")).toBeInTheDocument();
    expect(within(preview).getAllByText("US$ 8,450.00").length).toBeGreaterThan(0);
    expect(within(preview).getAllByText("R$ 49.010,00").length).toBeGreaterThan(0);
  });

  test("target discount considers software before applying service discount", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await addSoftwareFromCatalog(user, "1120", /Adicionar TopSolid’Pdm Server 7 - Módulo - 1120/);
    await user.click(screen.getByRole("checkbox", { name: "Selecionar Treinamento TopSolid'Design 7 - Básico" }));
    await user.click(screen.getByRole("button", { name: "Editar Treinamento TopSolid'Design 7 - Básico" }));
    await user.clear(screen.getByLabelText("Valor por dia nesta proposta de Treinamento TopSolid'Design 7 - Básico"));
    await user.type(screen.getByLabelText("Valor por dia nesta proposta de Treinamento TopSolid'Design 7 - Básico"), "60000");
    await user.clear(screen.getByLabelText("Total alvo"));
    await user.type(screen.getByLabelText("Total alvo"), "60000");
    await user.click(screen.getByRole("button", { name: "Atingir total alvo" }));

    const totals = screen.getByRole("region", { name: "Totais da proposta" });
    expect(within(totals).getByText("R$ 60.000,00")).toBeInTheDocument();
    expect(screen.getByText(/desconto de .* nos serviços/i)).toBeInTheDocument();
  });

  test("editing duration and value recalculates totals", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await user.click(screen.getByRole("checkbox", { name: "Selecionar Treinamento TopSolid'Design 7 - Básico" }));
    await user.click(screen.getByRole("button", { name: "Editar Treinamento TopSolid'Design 7 - Básico" }));
    expect(screen.getByRole("region", { name: "Editor de serviço" })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Duração nesta proposta de Treinamento TopSolid'Design 7 - Básico"));
    await user.type(screen.getByLabelText("Duração nesta proposta de Treinamento TopSolid'Design 7 - Básico"), "4");
    await user.clear(screen.getByLabelText("Valor por dia nesta proposta de Treinamento TopSolid'Design 7 - Básico"));
    await user.type(screen.getByLabelText("Valor por dia nesta proposta de Treinamento TopSolid'Design 7 - Básico"), "2000");

    const totals = screen.getByRole("region", { name: "Totais da proposta" });
    expect(within(totals).getByText("R$ 8.000,00")).toBeInTheDocument();
    expect(within(totals).getByText("4 dia(s)")).toBeInTheDocument();
    expect(within(totals).getByText("R$ 960,00")).toBeInTheDocument();
    expect(within(totals).getAllByText("R$ 8.960,00").length).toBeGreaterThan(0);

    const preview = screen.getByRole("region", { name: "Prévia da proposta" });
    expect(within(preview).getByText("R$ 2.000,00")).toBeInTheDocument();
    expect(within(preview).getAllByText("R$ 8.000,00").length).toBeGreaterThan(0);
  });

  test("creating and selecting a custom module updates list, totals, and preview", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await user.click(screen.getByRole("button", { name: "Adicionar módulo personalizado" }));
    await user.type(screen.getByLabelText("Código do módulo personalizado"), "020102090");
    await user.type(screen.getByLabelText("Nome do módulo personalizado"), "Treinamento Robodrill Especial");
    await user.clear(screen.getByLabelText("Valor por dia do módulo personalizado"));
    await user.type(screen.getByLabelText("Valor por dia do módulo personalizado"), "1500");
    await user.clear(screen.getByLabelText("Dias padrão do módulo personalizado"));
    await user.type(screen.getByLabelText("Dias padrão do módulo personalizado"), "2");
    await user.type(screen.getByLabelText("Descrição do módulo personalizado"), "Ajustes e rotinas sob medida.");
    await user.click(screen.getByRole("button", { name: "Salvar módulo no catálogo" }));
    expect(api.createProposalCatalogService).toHaveBeenCalledWith({
      code: "020102090",
      name: "Treinamento Robodrill Especial",
      valuePerDay: 1500,
      defaultDurationDays: 2,
      description: "Ajustes e rotinas sob medida.",
    });
    await user.click(screen.getByRole("checkbox", { name: "Selecionar Treinamento Robodrill Especial" }));

    const totals = screen.getByRole("region", { name: "Totais da proposta" });
    expect(within(totals).getByText("R$ 3.000,00")).toBeInTheDocument();
    expect(within(totals).getByText("2 dia(s)")).toBeInTheDocument();
    expect(within(totals).getAllByText("R$ 3.360,00").length).toBeGreaterThan(0);

    const preview = screen.getByRole("region", { name: "Prévia da proposta" });
    expect(within(preview).getByText("020102090 - Treinamento Robodrill Especial")).toBeInTheDocument();
    expect(within(preview).getByText("Ajustes e rotinas sob medida.")).toBeInTheDocument();
  });

  test("loads shared custom modules for every user entering the page", async () => {
    vi.mocked(api.proposalCatalogServices).mockResolvedValue({
      items: [{
        id: "shared-module",
        code: "MOD-SHARED",
        name: "Treinamento Compartilhado",
        valuePerDay: 1900,
        defaultDurationDays: 2,
        description: "Disponível para toda a equipe.",
        custom: true,
      }],
    });

    render(<ProposalsPage />);

    expect(api.proposalCatalogServices).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("checkbox", { name: "Selecionar Treinamento Compartilhado" })).toBeInTheDocument();
  });

  test("creating and selecting a custom product updates software preview", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await user.click(screen.getByRole("button", { name: "Adicionar produto personalizado" }));
    await user.type(screen.getByLabelText("Código do produto personalizado"), "9000");
    await user.type(screen.getByLabelText("Nome do produto personalizado"), "TopSolid Add-on Especial");
    await user.clear(screen.getByLabelText("Valor USD do produto personalizado"));
    await user.type(screen.getByLabelText("Valor USD do produto personalizado"), "2500");
    await user.type(screen.getByLabelText("Descrição do produto personalizado"), "Licença adicional sob medida.");
    await user.click(screen.getByRole("button", { name: "Adicionar produto nesta proposta" }));
    await addSoftwareFromCatalog(user, "TopSolid Add-on Especial", "Adicionar TopSolid Add-on Especial");

    const preview = screen.getByRole("region", { name: "Prévia da proposta" });
    expect(within(preview).getByText("9000 – TopSolid Add-on Especial")).toBeInTheDocument();
    expect(within(preview).getByText("Licença adicional sob medida.")).toBeInTheDocument();
    expect(within(preview).getAllByText("US$ 2,500.00").length).toBeGreaterThan(0);
  });

  test("resets target discount after selected services or amounts change", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await user.click(screen.getByRole("checkbox", { name: "Selecionar Treinamento TopSolid'Design 7 - Básico" }));
    await user.click(screen.getByRole("button", { name: "Editar Treinamento TopSolid'Design 7 - Básico" }));
    await user.clear(screen.getByLabelText("Valor por dia nesta proposta de Treinamento TopSolid'Design 7 - Básico"));
    await user.type(screen.getByLabelText("Valor por dia nesta proposta de Treinamento TopSolid'Design 7 - Básico"), "60000");
    await user.click(screen.getByRole("button", { name: "Atingir total alvo" }));

    const totals = screen.getByRole("region", { name: "Totais da proposta" });
    expect(within(totals).getAllByText("R$ 54.000,00").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("checkbox", { name: "Selecionar Treinamento TopSolid'Design 7 - Montagem" }));

    expect(within(totals).queryByText("R$ 54.000,00")).not.toBeInTheDocument();
    expect(screen.queryByText(/Desconto de .* aplicado/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Atingir total alvo" }));
    expect(within(totals).getAllByText("R$ 54.000,00").length).toBeGreaterThan(0);

    await user.clear(screen.getByLabelText("Valor por dia nesta proposta de Treinamento TopSolid'Design 7 - Básico"));
    await user.type(screen.getByLabelText("Valor por dia nesta proposta de Treinamento TopSolid'Design 7 - Básico"), "61000");

    expect(within(totals).queryByText("R$ 54.000,00")).not.toBeInTheDocument();
  });

  test("keeps observations blank when the textarea is cleared", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await user.clear(screen.getByLabelText("Observações"));

    const preview = screen.getByRole("region", { name: "Prévia da proposta" });
    expect(within(preview).queryByText(/A utilização do TopSolid 7/i)).not.toBeInTheDocument();
    expect(within(preview).queryByText(/O suporte técnico on-line/i)).not.toBeInTheDocument();
  });

  test("uses the selected representative in the Holand signature", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = render(<ProposalsPage />);

    const preview = screen.getByRole("region", { name: "Prévia da proposta" });
    expect(within(preview).getByText("Leonardo Holand")).toBeInTheDocument();
    expect(within(preview).getByText("Diretor Comercial da Holand Automação de Engenharias Ltda")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Adicionar representante" }));
    await user.type(screen.getByLabelText("Nome do representante"), "João Silva");
    await user.type(screen.getByLabelText("Cargo do representante"), "Vendedor da Holand Automação de Engenharias Ltda");
    await user.click(screen.getByRole("button", { name: "Salvar representante" }));

    expect(screen.getByLabelText("Representante Holand")).toHaveValue("custom_rep_1");
    expect(within(preview).getByText("João Silva")).toBeInTheDocument();
    expect(within(preview).getByText("Vendedor da Holand Automação de Engenharias Ltda")).toBeInTheDocument();

    unmount();
    render(<ProposalsPage />);
    expect(screen.getByRole("option", { name: "João Silva - Vendedor da Holand Automação de Engenharias Ltda" })).toBeInTheDocument();
  });

  test("moves acceptance and signatures to the requirements page when terms are included", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(<ProposalsPage />);

    expect(screen.queryByRole("region", { name: "Termo de requisitos TopSolid" })).not.toBeInTheDocument();
    expect(screen.getByText("Data do Aceite: _____ / _____ / _____")).toBeInTheDocument();
    expect(screen.getByText("Assinatura 1: Responsável Legal [Razão Social]")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Acrescentar termo de requisitos" }));

    const mainPage = container.querySelector(".proposal-main-page");
    const term = screen.getByRole("region", { name: "Termo de requisitos TopSolid" });
    expect(within(term).getByText("Requisitos de Estação de Trabalho - TopSolid 7.18")).toBeInTheDocument();
    expect(within(term).getByText("Windows 10 Pro (64 bits) · Windows 11 Pro (64 bits)")).toBeInTheDocument();
    expect(within(term).getAllByText("NVIDIA GeForce RTX Series").length).toBeGreaterThan(0);
    expect(within(term).getByText("TopSolid'Pdm Local requer Microsoft SQL Express (quando sem Pdm Server).")).toBeInTheDocument();
    expect(within(term).queryByText("Termo de Responsabilidade")).not.toBeInTheDocument();
    expect(mainPage ? within(mainPage as HTMLElement).queryByText("Data do Aceite: _____ / _____ / _____") : null).not.toBeInTheDocument();
    expect(mainPage ? within(mainPage as HTMLElement).queryByText("Assinatura 1: Responsável Legal [Razão Social]") : null).not.toBeInTheDocument();
    expect(within(term).getByText("Data do Aceite: _____ / _____ / _____")).toBeInTheDocument();
    expect(within(term).getByText("Assinatura 1: Responsável Legal [Razão Social]")).toBeInTheDocument();
    expect(within(term).getByText("Assinatura 2: Testemunha")).toBeInTheDocument();
    expect(within(term).getByText("Assinatura 3: Representante Legal Holand")).toBeInTheDocument();
  });

  test("clamps negative custom module values to zero", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await user.click(screen.getByRole("button", { name: "Adicionar módulo personalizado" }));
    await user.type(screen.getByLabelText("Nome do módulo personalizado"), "Módulo com valor negativo");
    await user.clear(screen.getByLabelText("Valor por dia do módulo personalizado"));
    await user.type(screen.getByLabelText("Valor por dia do módulo personalizado"), "-50");
    await user.clear(screen.getByLabelText("Dias padrão do módulo personalizado"));
    await user.type(screen.getByLabelText("Dias padrão do módulo personalizado"), "2");
    await user.click(screen.getByRole("button", { name: "Adicionar módulo nesta proposta" }));

    expect(screen.getByText("R$ 0,00 / dia · 2 dia(s)")).toBeInTheDocument();
  });

  test("print button calls window.print", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const print = vi.fn();
    vi.stubGlobal("print", print);

    render(<ProposalsPage />);

    await user.click(screen.getByRole("button", { name: "Imprimir / Salvar PDF" }));

    expect(print).toHaveBeenCalledTimes(1);
  });
});
