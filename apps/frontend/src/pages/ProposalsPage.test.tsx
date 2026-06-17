import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ProposalsPage } from "./ProposalsPage";

describe("ProposalsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-17T12:00:00-03:00"));
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
    expect(within(preview).getByText("Selecione os serviços no painel ao lado.")).toBeInTheDocument();
    expect(within(preview).getByText("P23005_OS")).toBeInTheDocument();
    expect(within(preview).getByText("Joinville, 17 de Junho de 2026")).toBeInTheDocument();
  });

  test("selecting Treinamento TopSolid'Design 7 - Básico updates totals and preview", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await user.click(screen.getByRole("checkbox", { name: "Selecionar Treinamento TopSolid'Design 7 - Básico" }));

    const totals = screen.getByRole("region", { name: "Totais da proposta" });
    expect(within(totals).getByText("R$ 5.100,00")).toBeInTheDocument();
    expect(within(totals).getByText("3 dia(s)")).toBeInTheDocument();
    expect(within(totals).getByText("R$ 612,00")).toBeInTheDocument();
    expect(within(totals).getByText("R$ 5.712,00")).toBeInTheDocument();

    const preview = screen.getByRole("region", { name: "Prévia da proposta" });
    expect(within(preview).getByText("Treinamento TopSolid'Design 7 - Básico")).toBeInTheDocument();
    expect(within(preview).getByText("Criação de peças prismáticas e de revolução, montagens, desenhos de fabricação, utilização de componentes inteligentes e gerenciamento dos arquivos no PDM.")).toBeInTheDocument();
    expect(within(preview).getAllByText("R$ 5.100,00").length).toBeGreaterThan(0);
  });

  test("editing duration and value recalculates totals", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProposalsPage />);

    await user.click(screen.getByRole("checkbox", { name: "Selecionar Treinamento TopSolid'Design 7 - Básico" }));
    await user.click(screen.getByRole("button", { name: "Editar Treinamento TopSolid'Design 7 - Básico" }));
    await user.clear(screen.getByLabelText("Duração de Treinamento TopSolid'Design 7 - Básico"));
    await user.type(screen.getByLabelText("Duração de Treinamento TopSolid'Design 7 - Básico"), "4");
    await user.clear(screen.getByLabelText("Valor por dia de Treinamento TopSolid'Design 7 - Básico"));
    await user.type(screen.getByLabelText("Valor por dia de Treinamento TopSolid'Design 7 - Básico"), "2000");

    const totals = screen.getByRole("region", { name: "Totais da proposta" });
    expect(within(totals).getByText("R$ 8.000,00")).toBeInTheDocument();
    expect(within(totals).getByText("4 dia(s)")).toBeInTheDocument();
    expect(within(totals).getByText("R$ 960,00")).toBeInTheDocument();
    expect(within(totals).getByText("R$ 8.960,00")).toBeInTheDocument();

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
    await user.click(screen.getByRole("button", { name: "Salvar módulo" }));
    await user.click(screen.getByRole("checkbox", { name: "Selecionar Treinamento Robodrill Especial" }));

    const totals = screen.getByRole("region", { name: "Totais da proposta" });
    expect(within(totals).getByText("R$ 3.000,00")).toBeInTheDocument();
    expect(within(totals).getByText("2 dia(s)")).toBeInTheDocument();
    expect(within(totals).getByText("R$ 3.360,00")).toBeInTheDocument();

    const preview = screen.getByRole("region", { name: "Prévia da proposta" });
    expect(within(preview).getByText("020102090 - Treinamento Robodrill Especial")).toBeInTheDocument();
    expect(within(preview).getByText("Ajustes e rotinas sob medida.")).toBeInTheDocument();
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
