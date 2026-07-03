# Area Propostas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class **Propostas** area to the React app and migrate the current standalone Holand proposal generator into it without changing the user-facing behavior.

**Architecture:** Implement the generator as a React page under `apps/frontend/src/pages/ProposalsPage.tsx`, with small proposal-specific helper modules for static data, calculations, and browser storage. Wire the page into the existing app route/menu/navigation while preserving the current two-column generator layout, localStorage persistence, calculations, preview, and browser print flow.

**Tech Stack:** React, TypeScript, Vite, existing app layout/navigation, Vitest/React Testing Library if already configured.

---

## File Structure

- Create `apps/frontend/src/proposals/proposalData.ts`: static service catalog and default observations copied from the current HTML.
- Create `apps/frontend/src/proposals/proposalMath.ts`: pure helpers for currency/date formatting and proposal total calculations.
- Create `apps/frontend/src/proposals/proposalStorage.ts`: guarded `localStorage` helpers for custom services, service edits, config, and observations.
- Create `apps/frontend/src/pages/ProposalsPage.tsx`: React implementation of the current generator UI and preview.
- Create `apps/frontend/src/pages/ProposalsPage.test.tsx`: focused tests for render, totals, service editing, custom modules, and print.
- Modify `apps/frontend/src/App.tsx`: register the `/propostas` route.
- Modify `apps/frontend/src/components/Layout.tsx` or `apps/frontend/src/auth/navigation.ts`: add **Propostas** to the main menu, following the existing navigation source of truth.
- Modify `apps/frontend/src/styles.css`: add scoped styles for the proposal generator, using `.proposals-page` as the root class to avoid leaking styles into the rest of the app.

## Task 0: Hydrate And Inspect Frontend Files

**Files:**
- Inspect: `apps/frontend/package.json`
- Inspect: `apps/frontend/src/App.tsx`
- Inspect: `apps/frontend/src/components/Layout.tsx`
- Inspect: `apps/frontend/src/auth/navigation.ts`
- Inspect: `apps/frontend/src/styles.css`

- [ ] **Step 1: Confirm the frontend source files are readable**

Run:

```bash
ls -l@ apps/frontend/package.json apps/frontend/src/App.tsx apps/frontend/src/components/Layout.tsx apps/frontend/src/auth/navigation.ts apps/frontend/src/styles.css
du -h apps/frontend/package.json apps/frontend/src/App.tsx apps/frontend/src/components/Layout.tsx apps/frontend/src/auth/navigation.ts apps/frontend/src/styles.css
```

Expected: `ls` shows normal files, and `du` shows non-zero disk usage for each file. If `du` shows `0B` for any file, open that file once in Finder or the editor to force local hydration, then rerun the commands.

- [ ] **Step 2: Read routing, layout, navigation, and scripts**

Run:

```bash
sed -n '1,260p' apps/frontend/package.json
sed -n '1,260p' apps/frontend/src/App.tsx
sed -n '1,320p' apps/frontend/src/components/Layout.tsx
sed -n '1,260p' apps/frontend/src/auth/navigation.ts
```

Expected: commands complete immediately. Record which file owns main navigation:

- If menu items are defined in `apps/frontend/src/auth/navigation.ts`, modify that file in Task 5.
- If menu items are hard-coded in `apps/frontend/src/components/Layout.tsx`, modify `Layout.tsx` in Task 5.

- [ ] **Step 3: Confirm test command**

Run:

```bash
npm --prefix apps/frontend test -- --run
```

Expected: existing frontend tests run. If the package uses a different script name, identify it from `apps/frontend/package.json` and use that exact script for later test steps.

- [ ] **Step 4: Commit nothing**

Do not commit after Task 0. This task only restores local file readability and gathers context.

## Task 1: Add Proposal Data And Pure Math

**Files:**
- Create: `apps/frontend/src/proposals/proposalData.ts`
- Create: `apps/frontend/src/proposals/proposalMath.ts`
- Test: `apps/frontend/src/proposals/proposalMath.test.ts`

- [ ] **Step 1: Write failing math tests**

Create `apps/frontend/src/proposals/proposalMath.test.ts`:

```ts
import { addDays, calculateProposalTotals, formatCurrency, formatLongDate } from "./proposalMath";

describe("proposalMath", () => {
  it("formats currency in Brazilian format without the R$ prefix", () => {
    expect(formatCurrency(54000)).toBe("54.000,00");
    expect(formatCurrency(1600.5)).toBe("1.600,50");
  });

  it("formats long proposal dates in Portuguese", () => {
    expect(formatLongDate("2026-06-17")).toBe("17 de Junho de 2026");
    expect(formatLongDate("")).toBe("___/___/______");
  });

  it("adds validity days using the yyyy-mm-dd input format", () => {
    expect(addDays("2026-06-17", 11)).toBe("28/06/2026");
    expect(addDays("", 11)).toBe("___/___/______");
  });

  it("calculates subtotal, discount, taxes, final total, and total days", () => {
    const totals = calculateProposalTotals({
      selectedServices: [
        { id: "s1", valuePerDay: 1700, durationDays: 3 },
        { id: "s2", valuePerDay: 1600, durationDays: 2 },
      ],
      discountPercent: 10,
      taxPercent: 12,
      snapTo54000: false,
    });

    expect(totals.subtotal).toBe(8300);
    expect(totals.totalDays).toBe(5);
    expect(totals.discountValue).toBe(830);
    expect(totals.subtotalAfterDiscount).toBe(7470);
    expect(totals.taxValue).toBeCloseTo(896.4);
    expect(totals.finalTotal).toBeCloseTo(8366.4);
    expect(totals.finalTotalDisplay).toBe("8.366,40");
  });

  it("uses the fixed display total when snap-to-54000 is active", () => {
    const totals = calculateProposalTotals({
      selectedServices: [{ id: "s1", valuePerDay: 60000, durationDays: 1 }],
      discountPercent: 19.64285714,
      taxPercent: 12,
      snapTo54000: true,
    });

    expect(totals.finalTotalDisplay).toBe("54.000,00");
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npm --prefix apps/frontend test -- --run apps/frontend/src/proposals/proposalMath.test.ts
```

Expected: FAIL because `proposalMath.ts` does not exist.

- [ ] **Step 3: Add static proposal data**

Create `apps/frontend/src/proposals/proposalData.ts`:

```ts
export type ProposalService = {
  id: string;
  code: string;
  name: string;
  valuePerDay: number;
  defaultDurationDays: number;
  description: string;
  custom?: boolean;
};

export const DEFAULT_TAX_PERCENT = 12;
export const DEFAULT_VALIDITY_DAYS = 11;
export const SNAP_TOTAL_TARGET = 54000;

export const DEFAULT_OBSERVATIONS = `A utilização do TopSolid 7 por pessoas não certificadas/treinadas isenta a HOLAND de quaisquer responsabilidades do insucesso da correta e eficiente utilização do produto.

O suporte técnico on-line, via e-mail e/ou telefônico, somente será dado para as pessoas certificadas durante os treinamentos e/ou reciclagens ministrados pela HOLAND na qualidade de representante autorizado do produto TopSolid em SC.`;

export const PROPOSAL_SERVICES: ProposalService[] = [
  {
    id: "s1",
    code: "",
    name: "Treinamento TopSolid'Design 7 - Básico",
    valuePerDay: 1700,
    defaultDurationDays: 3,
    description:
      "Criação de peças prismáticas e de revolução, montagens, desenhos de fabricação, utilização de componentes inteligentes e gerenciamento dos arquivos no PDM.",
  },
  {
    id: "s2",
    code: "",
    name: "Treinamento TopSolid'Design 7 - Montagem",
    valuePerDay: 1700,
    defaultDurationDays: 2,
    description:
      "Criação de montagens com mecanismo e cinemática, estrutura metálica, vista explodida, lista de material, desenhos de fabricação e documentos de família.\n*Exige o Treinamento 000102",
  },
  {
    id: "s3",
    code: "020102010",
    name: "Treinamento TopSolid'Cam 7 - Fresamento 2D",
    valuePerDay: 1600,
    defaultDurationDays: 3,
    description:
      "Configuração e edição do material em bruto, criação do documento de usinagem, determinação do zero peça, verificação do caminho de ferramenta, reposicionamento de peça, simulação de máquina, geração e gerenciamento do código ISO. Realização de usinagens de fresamento de 2 ½ eixos.\n*Exige o Treinamento 000102",
  },
  {
    id: "s4",
    code: "020102020",
    name: "Treinamento TopSolid'Cam 7 - Fresamento 3D",
    valuePerDay: 1600,
    defaultDurationDays: 2,
    description: "Realização de usinagens 3D. Criação de arestas fronteiriças.\n*Exige o Treinamento 000401",
  },
  {
    id: "s5",
    code: "020102120",
    name: "Treinamento TopSolid'Cam 7 - Condições de Cortes",
    valuePerDay: 1900,
    defaultDurationDays: 1,
    description:
      "Criação e configuração da gestão de condições de corte de ferramentas em bibliotecas, cadastramento por operações, ferramentas e associações entre Material x Tipo de máquina.",
  },
  {
    id: "s6",
    code: "020102070",
    name: "Treinamento TopSolid'Cam 7 – TopTool",
    valuePerDay: 1900,
    defaultDurationDays: 3,
    description: "À Definir – 020104070 Treinamento TopSolid'Cam 7 - TopTool",
  },
  {
    id: "s7",
    code: "020102075",
    name: "Treinamento TopSolid'Cam 7 - Folha de Processos",
    valuePerDay: 1900,
    defaultDurationDays: 2,
    description:
      "Criação e configuração dos modelos de folhas de processos. Realização de usinagens em 4/5 eixos indexado.\n*Exige o Treinamento 000102",
  },
  {
    id: "s8",
    code: "020102080",
    name: "Treinamento TopSolid'Cam 7 - Processos Automáticos",
    valuePerDay: 1900,
    defaultDurationDays: 3,
    description: "À Definir – 020104080 Treinamento TopSolid'Cam 7 - Processos Automáticos",
  },
  {
    id: "s9",
    code: "020202030",
    name: "Digital Twin - Cinemática de máquina Virtual 3D – Simplificada",
    valuePerDay: 1900,
    defaultDurationDays: 3,
    description:
      "O arquivo CAD da máquina é fornecido pelo fabricante. A Holand configura a cinemática da máquina definindo movimentos e limites dos eixos lineares e rotacionais.",
  },
  {
    id: "s10",
    code: "020202020",
    name: "Implantação TopSolid'Cam 7",
    valuePerDay: 2100,
    defaultDurationDays: 1,
    description:
      "Customização do TopSolid'Cam 7. Configuração do modelo de detalhamento, do modelo de usinagem e do modelo de folha de processos. Criação da biblioteca de dispositivos e de máquinas.",
  },
  {
    id: "s11",
    code: "020302050",
    name: "Acompanhamento TopSolid'Cam",
    valuePerDay: 2100,
    defaultDurationDays: 2,
    description: "Acompanhamento técnico de implantação.",
  },
  {
    id: "s12",
    code: "960001010",
    name: "Instalação / Configuração",
    valuePerDay: 615,
    defaultDurationDays: 1,
    description: "Serviços de instalação e configuração de software e hardware.",
  },
];
```

- [ ] **Step 4: Add pure math helpers**

Create `apps/frontend/src/proposals/proposalMath.ts`:

```ts
export type SelectedProposalService = {
  id: string;
  valuePerDay: number;
  durationDays: number;
};

export type ProposalTotalsInput = {
  selectedServices: SelectedProposalService[];
  discountPercent: number;
  taxPercent: number;
  snapTo54000: boolean;
};

export type ProposalTotals = {
  subtotal: number;
  totalDays: number;
  discountValue: number;
  subtotalAfterDiscount: number;
  taxValue: number;
  finalTotal: number;
  finalTotalDisplay: string;
};

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatLongDate(value: string): string {
  if (!value) return "___/___/______";
  const [year, month, day] = value.split("-");
  return `${Number.parseInt(day, 10)} de ${MONTHS[Number.parseInt(month, 10) - 1]} de ${year}`;
}

export function addDays(value: string, days: number): string {
  if (!value) return "___/___/______";
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  const [year, month, day] = date.toISOString().split("T")[0].split("-");
  return `${day}/${month}/${year}`;
}

export function calculateProposalTotals(input: ProposalTotalsInput): ProposalTotals {
  const subtotal = input.selectedServices.reduce(
    (sum, service) => sum + service.valuePerDay * service.durationDays,
    0,
  );
  const totalDays = input.selectedServices.reduce((sum, service) => sum + service.durationDays, 0);
  const discountValue = subtotal * (input.discountPercent / 100);
  const subtotalAfterDiscount = subtotal - discountValue;
  const taxValue = subtotalAfterDiscount * (input.taxPercent / 100);
  const finalTotal = subtotalAfterDiscount + taxValue;

  return {
    subtotal,
    totalDays,
    discountValue,
    subtotalAfterDiscount,
    taxValue,
    finalTotal,
    finalTotalDisplay: input.snapTo54000 ? "54.000,00" : formatCurrency(Math.round(finalTotal * 100) / 100),
  };
}
```

- [ ] **Step 5: Run math tests**

Run:

```bash
npm --prefix apps/frontend test -- --run apps/frontend/src/proposals/proposalMath.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add apps/frontend/src/proposals/proposalData.ts apps/frontend/src/proposals/proposalMath.ts apps/frontend/src/proposals/proposalMath.test.ts
git commit -m "feat: add proposal data and calculations"
```

Expected: commit succeeds. If Git still hangs because of the existing repository issue, stop and report the blocked Git state before continuing.

## Task 2: Add Guarded Proposal Storage

**Files:**
- Create: `apps/frontend/src/proposals/proposalStorage.ts`
- Test: `apps/frontend/src/proposals/proposalStorage.test.ts`

- [ ] **Step 1: Write failing storage tests**

Create `apps/frontend/src/proposals/proposalStorage.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npm --prefix apps/frontend test -- --run apps/frontend/src/proposals/proposalStorage.test.ts
```

Expected: FAIL because `proposalStorage.ts` does not exist.

- [ ] **Step 3: Add storage helpers**

Create `apps/frontend/src/proposals/proposalStorage.ts`:

```ts
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
```

- [ ] **Step 4: Run storage tests**

Run:

```bash
npm --prefix apps/frontend test -- --run apps/frontend/src/proposals/proposalStorage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add apps/frontend/src/proposals/proposalStorage.ts apps/frontend/src/proposals/proposalStorage.test.ts
git commit -m "feat: persist proposal generator state locally"
```

Expected: commit succeeds.

## Task 3: Build The Proposals Page

**Files:**
- Create: `apps/frontend/src/pages/ProposalsPage.tsx`
- Test: `apps/frontend/src/pages/ProposalsPage.test.tsx`
- Modify: `apps/frontend/src/styles.css`

- [ ] **Step 1: Write failing page tests**

Create `apps/frontend/src/pages/ProposalsPage.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import ProposalsPage from "./ProposalsPage";

describe("ProposalsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, "print").mockImplementation(() => undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the generator shell and default proposal preview", () => {
    render(<ProposalsPage />);

    expect(screen.getByRole("heading", { name: "Gerador de Propostas" })).toBeInTheDocument();
    expect(screen.getByLabelText("Razão Social")).toBeInTheDocument();
    expect(screen.getByText("I – Objeto")).toBeInTheDocument();
    expect(screen.getByText("Selecione os serviços no painel ao lado.")).toBeInTheDocument();
  });

  it("selects a service and updates totals and preview", () => {
    render(<ProposalsPage />);

    fireEvent.click(screen.getByLabelText("Selecionar Treinamento TopSolid'Design 7 - Básico"));

    expect(screen.getByText("R$ 5.100,00")).toBeInTheDocument();
    expect(screen.getByText("3 dia(s)")).toBeInTheDocument();
    expect(screen.getByText("Treinamento TopSolid'Design 7 - Básico")).toBeInTheDocument();
  });

  it("edits duration and value and recalculates totals", () => {
    render(<ProposalsPage />);

    fireEvent.click(screen.getByLabelText("Selecionar Treinamento TopSolid'Design 7 - Básico"));
    fireEvent.click(screen.getByRole("button", { name: "Editar Treinamento TopSolid'Design 7 - Básico" }));
    fireEvent.change(screen.getByLabelText("Duração de Treinamento TopSolid'Design 7 - Básico"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Valor por dia de Treinamento TopSolid'Design 7 - Básico"), {
      target: { value: "2000" },
    });

    expect(screen.getByText("R$ 8.000,00")).toBeInTheDocument();
    expect(screen.getByText("4 dia(s)")).toBeInTheDocument();
  });

  it("creates and selects a custom module", () => {
    render(<ProposalsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Adicionar módulo personalizado" }));
    fireEvent.change(screen.getByLabelText("Código do novo módulo"), { target: { value: "ABC" } });
    fireEvent.change(screen.getByLabelText("Nome do novo módulo"), { target: { value: "Treinamento Especial" } });
    fireEvent.change(screen.getByLabelText("Valor por dia do novo módulo"), { target: { value: "2500" } });
    fireEvent.change(screen.getByLabelText("Dias padrão do novo módulo"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Descrição do novo módulo"), { target: { value: "Conteúdo especial" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar módulo" }));

    fireEvent.click(screen.getByLabelText("Selecionar Treinamento Especial"));

    expect(screen.getByText("ABC – Treinamento Especial")).toBeInTheDocument();
    expect(screen.getByText("R$ 5.000,00")).toBeInTheDocument();
  });

  it("prints through the browser print dialog", () => {
    render(<ProposalsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Imprimir / Salvar PDF" }));

    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run page tests and verify they fail**

Run:

```bash
npm --prefix apps/frontend test -- --run apps/frontend/src/pages/ProposalsPage.test.tsx
```

Expected: FAIL because `ProposalsPage.tsx` does not exist.

- [ ] **Step 3: Create the page component**

Create `apps/frontend/src/pages/ProposalsPage.tsx`. Use this implementation as the baseline, then adjust imports only if the project uses different test or asset conventions:

```tsx
import { useMemo, useState } from "react";
import holandLogo from "../assets/holand-horizontal.svg";
import {
  DEFAULT_OBSERVATIONS,
  DEFAULT_TAX_PERCENT,
  DEFAULT_VALIDITY_DAYS,
  PROPOSAL_SERVICES,
  SNAP_TOTAL_TARGET,
  type ProposalService,
} from "../proposals/proposalData";
import { addDays, calculateProposalTotals, formatCurrency, formatLongDate } from "../proposals/proposalMath";
import {
  loadProposalConfig,
  loadProposalCustomServices,
  loadProposalObservations,
  loadProposalServiceEdits,
  saveProposalConfig,
  saveProposalCustomServices,
  saveProposalObservations,
  saveProposalServiceEdits,
  type ProposalServiceEdits,
} from "../proposals/proposalStorage";

type ServiceState = {
  checked: Record<string, boolean>;
  durationDays: Record<string, number>;
  valuePerDay: Record<string, number>;
  description: Record<string, string>;
  name: Record<string, string>;
};

type ClientFields = {
  name: string;
  address: string;
  cep: string;
  cnpj: string;
  contact: string;
  email: string;
};

function todayInputValue() {
  return new Date().toISOString().split("T")[0];
}

function createInitialServiceState(services: ProposalService[], edits: ProposalServiceEdits): ServiceState {
  return services.reduce<ServiceState>(
    (state, service) => {
      const edit = edits[service.id];
      state.checked[service.id] = false;
      state.durationDays[service.id] = edit?.durationDays ?? service.defaultDurationDays;
      state.valuePerDay[service.id] = edit?.valuePerDay ?? service.valuePerDay;
      state.description[service.id] = edit?.description ?? service.description;
      state.name[service.id] = edit?.name ?? service.name;
      return state;
    },
    { checked: {}, durationDays: {}, valuePerDay: {}, description: {}, name: {} },
  );
}

function buildServiceEdits(services: ProposalService[], state: ServiceState): ProposalServiceEdits {
  return services.reduce<ProposalServiceEdits>((edits, service) => {
    edits[service.id] = {
      name: state.name[service.id] ?? service.name,
      valuePerDay: state.valuePerDay[service.id] ?? service.valuePerDay,
      durationDays: state.durationDays[service.id] ?? service.defaultDurationDays,
      description: state.description[service.id] ?? service.description,
    };
    return edits;
  }, {});
}

function linesToNodes(value: string) {
  return value.split("\n").map((line, index) =>
    line ? (
      <span key={`${line}-${index}`}>
        {line}
        <br />
      </span>
    ) : (
      <br key={`blank-${index}`} />
    ),
  );
}

export default function ProposalsPage() {
  const [client, setClient] = useState<ClientFields>({
    name: "",
    address: "",
    cep: "",
    cnpj: "",
    contact: "",
    email: "",
  });
  const [proposalNumber, setProposalNumber] = useState("P23005_OS");
  const [proposalDate, setProposalDate] = useState(todayInputValue());
  const [validityDays, setValidityDays] = useState(DEFAULT_VALIDITY_DAYS);
  const [modality, setModality] = useState<"presencial" | "remoto" | "ambos">("ambos");
  const [customServices, setCustomServices] = useState<ProposalService[]>(() => loadProposalCustomServices());
  const allServices = useMemo(() => [...PROPOSAL_SERVICES, ...customServices], [customServices]);
  const [serviceState, setServiceState] = useState<ServiceState>(() =>
    createInitialServiceState([...PROPOSAL_SERVICES, ...loadProposalCustomServices()], loadProposalServiceEdits()),
  );
  const [editingServices, setEditingServices] = useState<Record<string, boolean>>({});
  const savedConfig = loadProposalConfig();
  const [taxPercent, setTaxPercent] = useState(savedConfig.taxPercent ?? String(DEFAULT_TAX_PERCENT));
  const [discountPercent, setDiscountPercent] = useState("0");
  const [snapTo54000, setSnapTo54000] = useState(false);
  const [snapMessage, setSnapMessage] = useState("");
  const [observations, setObservations] = useState(() => loadProposalObservations());
  const [isAddingModule, setIsAddingModule] = useState(false);
  const [newModule, setNewModule] = useState({
    code: "",
    name: "",
    valuePerDay: "",
    durationDays: "1",
    description: "",
  });

  const selectedServices = allServices.filter((service) => serviceState.checked[service.id]);
  const numericTaxPercent = Number.parseFloat(taxPercent) || 0;
  const numericDiscountPercent = Number.parseFloat(discountPercent) || 0;
  const totals = calculateProposalTotals({
    selectedServices: selectedServices.map((service) => ({
      id: service.id,
      valuePerDay: serviceState.valuePerDay[service.id] ?? service.valuePerDay,
      durationDays: serviceState.durationDays[service.id] ?? service.defaultDurationDays,
    })),
    discountPercent: numericDiscountPercent,
    taxPercent: numericTaxPercent,
    snapTo54000,
  });

  const modalText = modality === "presencial" ? "presencial" : modality === "remoto" ? "remoto" : "presencial e online";
  const modalLabel =
    modality === "presencial" ? "Presencial" : modality === "remoto" ? "Remoto / Online" : "Presencial e Online";
  const taxLabel = numericTaxPercent % 1 === 0 ? `${numericTaxPercent},00` : numericTaxPercent.toFixed(2).replace(".", ",");

  function persistServiceState(nextState: ServiceState, nextServices = allServices) {
    saveProposalServiceEdits(buildServiceEdits(nextServices, nextState));
  }

  function updateServiceState(updater: (current: ServiceState) => ServiceState) {
    setServiceState((current) => {
      const next = updater(current);
      persistServiceState(next);
      return next;
    });
  }

  function toggleService(id: string) {
    updateServiceState((current) => ({
      ...current,
      checked: { ...current.checked, [id]: !current.checked[id] },
    }));
  }

  function selectAll(value: boolean) {
    updateServiceState((current) => ({
      ...current,
      checked: allServices.reduce<Record<string, boolean>>((checked, service) => {
        checked[service.id] = value;
        return checked;
      }, {}),
    }));
  }

  function updateTaxPercent(value: string) {
    setTaxPercent(value);
    saveProposalConfig({ taxPercent: value });
  }

  function updateDiscountPercent(value: string) {
    setSnapTo54000(false);
    setSnapMessage("");
    setDiscountPercent(value);
  }

  function applySnapDiscount() {
    if (totals.subtotal === 0) {
      setSnapMessage("Selecione os serviços primeiro.");
      return;
    }

    const targetSubtotal = SNAP_TOTAL_TARGET / (1 + numericTaxPercent / 100);
    if (totals.subtotal <= targetSubtotal) {
      setSnapTo54000(false);
      setDiscountPercent("0");
      setSnapMessage("Total já está abaixo de R$ 54.000,00 — nenhum desconto necessário.");
      return;
    }

    const discountValue = totals.subtotal - targetSubtotal;
    const discount = (discountValue / totals.subtotal) * 100;
    setDiscountPercent(discount.toFixed(8));
    setSnapTo54000(true);
    setSnapMessage(`Desconto de ${discount.toFixed(2)}% aplicado (- R$ ${formatCurrency(discountValue)})`);
  }

  function saveNewModule() {
    const name = newModule.name.trim();
    if (!name) {
      window.alert("O nome do serviço é obrigatório.");
      return;
    }

    const service: ProposalService = {
      id: `custom_${Date.now()}`,
      code: newModule.code.trim(),
      name,
      valuePerDay: Number.parseFloat(newModule.valuePerDay) || 1000,
      defaultDurationDays: Number.parseInt(newModule.durationDays, 10) || 1,
      description: newModule.description.trim(),
      custom: true,
    };
    const nextCustomServices = [...customServices, service];
    const nextAllServices = [...PROPOSAL_SERVICES, ...nextCustomServices];
    const nextState: ServiceState = {
      checked: { ...serviceState.checked, [service.id]: false },
      durationDays: { ...serviceState.durationDays, [service.id]: service.defaultDurationDays },
      valuePerDay: { ...serviceState.valuePerDay, [service.id]: service.valuePerDay },
      description: { ...serviceState.description, [service.id]: service.description },
      name: { ...serviceState.name, [service.id]: service.name },
    };

    setCustomServices(nextCustomServices);
    setServiceState(nextState);
    saveProposalCustomServices(nextCustomServices);
    persistServiceState(nextState, nextAllServices);
    setNewModule({ code: "", name: "", valuePerDay: "", durationDays: "1", description: "" });
    setIsAddingModule(false);
  }

  function deleteCustomService(id: string) {
    if (!window.confirm("Excluir este módulo permanentemente?")) return;
    const nextCustomServices = customServices.filter((service) => service.id !== id);
    const nextState: ServiceState = {
      checked: { ...serviceState.checked },
      durationDays: { ...serviceState.durationDays },
      valuePerDay: { ...serviceState.valuePerDay },
      description: { ...serviceState.description },
      name: { ...serviceState.name },
    };
    delete nextState.checked[id];
    delete nextState.durationDays[id];
    delete nextState.valuePerDay[id];
    delete nextState.description[id];
    delete nextState.name[id];

    setCustomServices(nextCustomServices);
    setServiceState(nextState);
    saveProposalCustomServices(nextCustomServices);
    persistServiceState(nextState, [...PROPOSAL_SERVICES, ...nextCustomServices]);
  }

  return (
    <div className="proposals-page">
      <aside className="proposal-sidebar">
        <div>
          <div className="proposal-sidebar-title">Holand Automação</div>
          <h1>Gerador de Propostas</h1>
        </div>

        <section className="proposal-panel">
          <h2>Dados do Cliente</h2>
          <label>
            Razão Social
            <input value={client.name} placeholder="Ex: Krah Industria e Comercio..." onChange={(event) => setClient({ ...client, name: event.target.value })} />
          </label>
          <label>
            Endereço
            <input value={client.address} placeholder="Rua, nº – Bairro, Cidade – UF" onChange={(event) => setClient({ ...client, address: event.target.value })} />
          </label>
          <label>
            CEP
            <input value={client.cep} placeholder="00000-000" onChange={(event) => setClient({ ...client, cep: event.target.value })} />
          </label>
          <label>
            CNPJ
            <input value={client.cnpj} placeholder="00.000.000/0001-00" onChange={(event) => setClient({ ...client, cnpj: event.target.value })} />
          </label>
          <label>
            Contato
            <input value={client.contact} placeholder="Nome do responsável" onChange={(event) => setClient({ ...client, contact: event.target.value })} />
          </label>
          <label>
            E-mail
            <input value={client.email} placeholder="email@empresa.com.br" onChange={(event) => setClient({ ...client, email: event.target.value })} />
          </label>
        </section>

        <section className="proposal-panel">
          <h2>Proposta</h2>
          <label>
            Número da Proposta
            <input value={proposalNumber} onChange={(event) => setProposalNumber(event.target.value)} />
          </label>
          <label>
            Data
            <input type="date" value={proposalDate} onChange={(event) => setProposalDate(event.target.value)} />
          </label>
          <label>
            Validade (dias)
            <input type="number" min={1} value={validityDays} onChange={(event) => setValidityDays(Math.max(1, Number.parseInt(event.target.value, 10) || 1))} />
          </label>
          <label>
            Modalidade
            <select value={modality} onChange={(event) => setModality(event.target.value as "presencial" | "remoto" | "ambos")}>
              <option value="presencial">Presencial</option>
              <option value="remoto">Remoto / Online</option>
              <option value="ambos">Presencial e Online</option>
            </select>
          </label>
        </section>

        <section className="proposal-panel">
          <div className="proposal-panel-header">
            <h2>Serviços</h2>
            <div>
              <button type="button" className="proposal-small-button" onClick={() => selectAll(true)}>Todos</button>
              <button type="button" className="proposal-small-button" onClick={() => selectAll(false)}>Nenhum</button>
            </div>
          </div>

          {allServices.map((service) => {
            const isEditing = editingServices[service.id];
            const serviceName = serviceState.name[service.id] ?? service.name;
            const servicePrice = serviceState.valuePerDay[service.id] ?? service.valuePerDay;
            const serviceDuration = serviceState.durationDays[service.id] ?? service.defaultDurationDays;
            return (
              <div key={service.id} className={`proposal-service-item ${serviceState.checked[service.id] ? "active" : ""}`}>
                <div className="proposal-service-header" onClick={() => toggleService(service.id)}>
                  <input
                    aria-label={`Selecionar ${serviceName}`}
                    type="checkbox"
                    checked={Boolean(serviceState.checked[service.id])}
                    onChange={() => toggleService(service.id)}
                    onClick={(event) => event.stopPropagation()}
                  />
                  <div>
                    <div className="proposal-service-name">{service.code ? `${service.code} – ` : ""}{serviceName}{service.custom ? <span className="proposal-custom-badge">CUSTOM</span> : null}</div>
                    <div className="proposal-service-price">R$ {formatCurrency(servicePrice)} / dia · {serviceDuration} dia(s)</div>
                  </div>
                  <button
                    type="button"
                    className="proposal-small-button"
                    aria-label={`Editar ${serviceName}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditingServices({ ...editingServices, [service.id]: !isEditing });
                    }}
                  >
                    {isEditing ? "Fechar" : "Editar"}
                  </button>
                  {service.custom ? (
                    <button type="button" className="proposal-small-button" onClick={(event) => { event.stopPropagation(); deleteCustomService(service.id); }}>Excluir</button>
                  ) : null}
                </div>
                {isEditing ? (
                  <div className="proposal-service-controls">
                    <label>
                      Nome do serviço
                      <input
                        value={serviceName}
                        onChange={(event) =>
                          updateServiceState((current) => ({ ...current, name: { ...current.name, [service.id]: event.target.value } }))
                        }
                      />
                    </label>
                    <label>
                      Duração de {serviceName}
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={serviceDuration}
                        onChange={(event) =>
                          updateServiceState((current) => ({
                            ...current,
                            durationDays: { ...current.durationDays, [service.id]: Math.max(1, Number.parseInt(event.target.value, 10) || 1) },
                          }))
                        }
                      />
                    </label>
                    <label>
                      Valor por dia de {serviceName}
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={servicePrice}
                        onChange={(event) =>
                          updateServiceState((current) => ({
                            ...current,
                            valuePerDay: { ...current.valuePerDay, [service.id]: Math.max(0, Number.parseFloat(event.target.value) || 0) },
                          }))
                        }
                      />
                    </label>
                    <label>
                      Descrição
                      <textarea
                        value={serviceState.description[service.id] ?? service.description}
                        onChange={(event) =>
                          updateServiceState((current) => ({ ...current, description: { ...current.description, [service.id]: event.target.value } }))
                        }
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            );
          })}

          <button type="button" className="proposal-add-module-button" onClick={() => setIsAddingModule(true)}>Adicionar módulo personalizado</button>
          {isAddingModule ? (
            <div className="proposal-add-module-form">
              <h3>Novo Módulo</h3>
              <label>Código do novo módulo<input value={newModule.code} onChange={(event) => setNewModule({ ...newModule, code: event.target.value })} /></label>
              <label>Nome do novo módulo<input value={newModule.name} onChange={(event) => setNewModule({ ...newModule, name: event.target.value })} /></label>
              <label>Valor por dia do novo módulo<input type="number" min={0} step="0.01" value={newModule.valuePerDay} onChange={(event) => setNewModule({ ...newModule, valuePerDay: event.target.value })} /></label>
              <label>Dias padrão do novo módulo<input type="number" min={1} value={newModule.durationDays} onChange={(event) => setNewModule({ ...newModule, durationDays: event.target.value })} /></label>
              <label>Descrição do novo módulo<textarea value={newModule.description} onChange={(event) => setNewModule({ ...newModule, description: event.target.value })} /></label>
              <button type="button" onClick={saveNewModule}>Salvar módulo</button>
              <button type="button" onClick={() => setIsAddingModule(false)}>Cancelar</button>
            </div>
          ) : null}
        </section>

        <section className="proposal-panel">
          <h2>Desconto & Observações</h2>
          <label>Imposto:<input type="number" min={0} max={100} step="0.01" value={taxPercent} onChange={(event) => updateTaxPercent(event.target.value)} /></label>
          <label>Desconto:<input type="number" min={0} max={100} step="0.5" value={discountPercent} onChange={(event) => updateDiscountPercent(event.target.value)} /></label>
          <button type="button" className="proposal-snap-button" onClick={applySnapDiscount}>Desconto para R$ 54.000</button>
          {snapMessage ? <div className="proposal-snap-message">{snapMessage}</div> : null}
          <label>Observações (abaixo da tabela)<textarea value={observations} onChange={(event) => { setObservations(event.target.value); saveProposalObservations(event.target.value); }} /></label>
        </section>

        <section className="proposal-totals">
          <div><span>Subtotal</span><strong>R$ {formatCurrency(totals.subtotal)}</strong></div>
          <div><span>Total de Diárias</span><strong>{totals.totalDays} dia(s)</strong></div>
          {numericDiscountPercent > 0 ? <div><span>Desconto</span><strong>– R$ {formatCurrency(totals.discountValue)}</strong></div> : null}
          <div><span>Impostos ({numericTaxPercent}%)</span><strong>R$ {formatCurrency(totals.taxValue)}</strong></div>
          <div className="main"><span>Total c/ Impostos</span><strong>R$ {totals.finalTotalDisplay}</strong></div>
        </section>

        <button type="button" className="proposal-print-button" onClick={() => window.print()}>Imprimir / Salvar PDF</button>
        <p className="proposal-print-note">No Chrome: desmarque Cabeçalhos e rodapés para remover o caminho do arquivo</p>
      </aside>

      <main className="proposal-preview-wrap">
        <article className="proposal-document">
          <header className="proposal-document-header">
            <img src={holandLogo} alt="Holand" />
            <div>
              <strong>PROPOSTA Nº {proposalNumber || "P00000_OS"}</strong>
              <span>{formatLongDate(proposalDate)}</span>
            </div>
          </header>
          <section className="proposal-client-box">
            <strong>{client.name || "[Razão Social]"}</strong>
            <span>{client.address || "[Endereço]"}</span>
            <span>CEP: {client.cep || "[CEP]"} · CNPJ: {client.cnpj || "[CNPJ]"}</span>
            <span>Contato: {client.contact || "[Contato]"} · {client.email || "[E-mail]"}</span>
          </section>
          <p><strong>Prezado(a) Sr(a). {client.contact || "[Contato]"}</strong></p>
          <p>Agradecemos seu interesse pelos serviços de consultoria, suporte técnico e treinamentos em sistemas PDM/CAD/CAM oferecidos pela HOLAND.</p>
          <h2>I – Objeto</h2>
          <p>Serviços de Treinamento, Implantação e Consultoria.</p>
          <h2>II – Especificações</h2>
          <p>Os treinamentos abaixo orçados serão ministrados na modalidade <strong>{modalText}</strong>.<br />Os serviços serão executados pela HOLAND, representante exclusiva da TopSolid em SC.</p>
          {selectedServices.length === 0 ? (
            <p className="proposal-empty">Selecione os serviços no painel ao lado.</p>
          ) : (
            <table className="proposal-table">
              <thead>
                <tr><th>Serviços / Descrição</th><th>Valor Unit.</th><th>Duração</th><th>Total</th></tr>
              </thead>
              <tbody>
                {selectedServices.map((service) => {
                  const serviceName = serviceState.name[service.id] ?? service.name;
                  const valuePerDay = serviceState.valuePerDay[service.id] ?? service.valuePerDay;
                  const duration = serviceState.durationDays[service.id] ?? service.defaultDurationDays;
                  return (
                    <tr key={service.id}>
                      <td><strong>{service.code ? `${service.code} - ` : ""}{serviceName}</strong><span>{linesToNodes(serviceState.description[service.id] ?? service.description)}</span></td>
                      <td>R$ {formatCurrency(valuePerDay)}</td>
                      <td>{duration}</td>
                      <td>R$ {formatCurrency(valuePerDay * duration)}</td>
                    </tr>
                  );
                })}
                <tr><td colSpan={2}>Total de diárias</td><td><strong>{totals.totalDays} Diárias</strong></td><td /></tr>
                {numericDiscountPercent > 0 ? <tr><td colSpan={3}>Desconto ({formatCurrency(numericDiscountPercent)}%)</td><td>– R$ {formatCurrency(totals.discountValue)}</td></tr> : null}
                <tr><td colSpan={3}>Valor Total</td><td>R$ {formatCurrency(totals.subtotalAfterDiscount)}</td></tr>
                <tr><td colSpan={3}>Valor total c/ Impostos ({taxLabel}%)</td><td>R$ {totals.finalTotalDisplay}</td></tr>
              </tbody>
            </table>
          )}
          <div className="proposal-notes">{linesToNodes(observations || DEFAULT_OBSERVATIONS)}</div>
          <section className="proposal-commercial">
            <strong>IV – Condições Comerciais</strong>
            <p><strong>Treinamento, Implantação, Consultoria e Acompanhamento.</strong></p>
            <p>Modalidade {modalLabel}:</p>
            <p>( &nbsp;) À vista &nbsp; R$ {totals.finalTotalDisplay}</p>
          </section>
          <p><strong>VIII – Impostos</strong><br />Composição dos impostos para serviços: {taxLabel}%</p>
          <p><strong>IX – Considerações Finais</strong><br />Esta proposta tem validade até <strong>{addDays(proposalDate, validityDays)}</strong>.</p>
          <p>Na ausência de um pedido de compra, o mesmo reconhece que sua assinatura nesta proposta autoriza o início do faturamento e que esta proposta terá validade como Ordem de Compra.<br />Todas as páginas desta proposta deverão ser rubricadas.</p>
          <p>Cordialmente,</p>
          <div className="proposal-accept">Data do Aceite: _____ / _____ / _____</div>
          <div className="proposal-signatures">
            <div><strong>Assinatura 1: Responsável Legal {client.name || "[Razão Social]"}</strong><span>Nome: ________________________________</span><span>Cargo: ________________________________</span></div>
            <div><strong>Assinatura 2: Testemunha</strong><span>Nome: ________________________________</span><span>Cargo: ________________________________</span></div>
            <div><strong>Assinatura 3: Representante Legal Holand</strong><span>Leonardo Holand</span><span>Diretor Comercial da Holand Automação de Engenharias Ltda</span></div>
          </div>
          <footer>Holand Automação de Engenharias Ltda | Av. Juscelino Kubitscheck, 350 - Centro, Joinville - SC, 89201-100<br />Fone: (47) 98859-3553 | www.holand.com.br | leonardo@holand.com.br</footer>
        </article>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Add scoped styles**

Append to `apps/frontend/src/styles.css`:

```css
.proposals-page {
  --proposal-red: #c0281c;
  --proposal-dark: #1a1a1a;
  --proposal-border: #ddd;
  display: flex;
  min-height: calc(100vh - 64px);
  background: #e8e8e8;
  color: #1a1a1a;
  font-family: "IBM Plex Sans", system-ui, sans-serif;
}

.proposal-sidebar {
  width: 420px;
  min-width: 420px;
  background: var(--proposal-dark);
  color: #eee;
  padding: 28px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.proposal-sidebar-title,
.proposal-panel h2 {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--proposal-red);
  font-weight: 700;
}

.proposal-sidebar h1 {
  color: #fff;
  font-size: 20px;
  line-height: 1.2;
}

.proposal-panel {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 16px;
}

.proposal-panel label,
.proposal-service-controls label,
.proposal-add-module-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #aaa;
  font-size: 11px;
  font-weight: 500;
  margin-top: 10px;
}

.proposal-panel input,
.proposal-panel textarea,
.proposal-panel select,
.proposal-service-controls input,
.proposal-service-controls textarea,
.proposal-add-module-form input,
.proposal-add-module-form textarea {
  width: 100%;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 5px;
  color: #fff;
  font: inherit;
  font-size: 13px;
  padding: 7px 10px;
}

.proposal-panel textarea,
.proposal-service-controls textarea,
.proposal-add-module-form textarea {
  min-height: 60px;
  resize: vertical;
}

.proposal-panel-header,
.proposal-service-header,
.proposal-totals div {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.proposal-service-item {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 10px 12px;
  margin-top: 8px;
}

.proposal-service-item.active {
  border-color: var(--proposal-red);
  background: rgba(192, 40, 28, 0.08);
}

.proposal-service-header {
  cursor: pointer;
}

.proposal-service-header input[type="checkbox"] {
  width: 16px;
  min-width: 16px;
  accent-color: var(--proposal-red);
}

.proposal-service-name {
  color: #ddd;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}

.proposal-service-price {
  color: #888;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  margin-top: 2px;
}

.proposal-small-button,
.proposal-add-module-button,
.proposal-snap-button,
.proposal-print-button,
.proposal-add-module-form button {
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 5px;
  background: transparent;
  color: #bbb;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  padding: 5px 9px;
}

.proposal-add-module-button,
.proposal-print-button {
  width: 100%;
  margin-top: 10px;
}

.proposal-print-button {
  background: var(--proposal-red);
  border-color: var(--proposal-red);
  color: #fff;
  font-weight: 700;
  padding: 12px;
}

.proposal-custom-badge {
  color: #999;
  font-size: 9px;
  margin-left: 6px;
}

.proposal-totals {
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  padding: 12px 0;
}

.proposal-totals div {
  color: #aaa;
  font-size: 12px;
  margin-bottom: 6px;
}

.proposal-totals .main {
  color: #fff;
  font-size: 15px;
  font-weight: 700;
}

.proposal-print-note,
.proposal-snap-message {
  color: #888;
  font-size: 10px;
  line-height: 1.5;
  text-align: center;
}

.proposal-preview-wrap {
  flex: 1;
  overflow: auto;
  padding: 24px 32px;
}

.proposal-document {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  background: #fff;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18);
  color: #111;
  font-size: 9pt;
  line-height: 1.45;
  padding: 16mm 14mm 18mm;
}

.proposal-document-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  border-bottom: 2px solid var(--proposal-red);
  padding-bottom: 8mm;
}

.proposal-document-header img {
  max-width: 180px;
  height: auto;
}

.proposal-client-box {
  border: 1px solid var(--proposal-border);
  margin: 8mm 0;
  padding: 8px 10px;
  display: grid;
  gap: 2px;
}

.proposal-document h2 {
  color: var(--proposal-red);
  font-size: 9pt;
  margin-top: 12px;
  text-transform: uppercase;
}

.proposal-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
  table-layout: fixed;
  word-wrap: break-word;
}

.proposal-table th,
.proposal-table td {
  border-bottom: 1px solid #eee;
  padding: 5px 7px;
  vertical-align: top;
}

.proposal-table th {
  background: #f4f4f4;
  text-align: left;
}

.proposal-table td:nth-child(2),
.proposal-table td:nth-child(3),
.proposal-table td:nth-child(4),
.proposal-table th:nth-child(2),
.proposal-table th:nth-child(3),
.proposal-table th:nth-child(4) {
  text-align: center;
  white-space: nowrap;
}

.proposal-table td span {
  color: #555;
  display: block;
  font-size: 7.5pt;
  margin-top: 2px;
}

.proposal-notes,
.proposal-commercial,
.proposal-accept,
.proposal-signatures {
  margin-top: 12px;
}

.proposal-signatures {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.proposal-signatures div {
  display: grid;
  gap: 6px;
  border-top: 1px solid #111;
  padding-top: 6px;
}

.proposal-document footer {
  border-top: 1px solid #ddd;
  color: #555;
  font-size: 7.5pt;
  margin-top: 18px;
  padding-top: 6px;
  text-align: center;
}

@media print {
  body * {
    visibility: hidden;
  }

  .proposal-document,
  .proposal-document * {
    visibility: visible;
  }

  .proposal-document {
    box-shadow: none;
    left: 0;
    margin: 0;
    min-height: auto;
    position: absolute;
    top: 0;
    width: 100%;
  }
}
```

- [ ] **Step 5: Run page tests**

Run:

```bash
npm --prefix apps/frontend test -- --run apps/frontend/src/pages/ProposalsPage.test.tsx
```

Expected: PASS. If assertions fail because the existing test setup does not include `@testing-library/jest-dom`, import its matcher setup from the existing test setup file instead of changing the behavior under test.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add apps/frontend/src/pages/ProposalsPage.tsx apps/frontend/src/pages/ProposalsPage.test.tsx apps/frontend/src/styles.css
git commit -m "feat: add proposals generator page"
```

Expected: commit succeeds.

## Task 4: Wire Route And Main Menu

**Files:**
- Modify: `apps/frontend/src/App.tsx`
- Modify: `apps/frontend/src/auth/navigation.ts` or `apps/frontend/src/components/Layout.tsx`
- Test: existing routing/navigation tests, plus add a Propostas assertion where the existing tests live

- [ ] **Step 1: Add a failing route/navigation test in the existing test file**

If `apps/frontend/src/auth/navigation.test.ts` owns menu visibility tests, add:

```ts
it("includes Propostas in the main app navigation", () => {
  const labels = getNavigationItemsForRole("admin").map((item) => item.label);
  expect(labels).toContain("Propostas");
});
```

If `getNavigationItemsForRole` has a different exported name, use the existing helper already used in that file and add the same `expect(labels).toContain("Propostas")` assertion.

If navigation is tested through `apps/frontend/src/components/Layout.test.tsx`, add:

```tsx
it("renders a link to Propostas in the sidebar", () => {
  render(<Layout />);
  expect(screen.getByRole("link", { name: /propostas/i })).toHaveAttribute("href", "/propostas");
});
```

- [ ] **Step 2: Run the relevant navigation test and verify it fails**

Run one of:

```bash
npm --prefix apps/frontend test -- --run apps/frontend/src/auth/navigation.test.ts
npm --prefix apps/frontend test -- --run apps/frontend/src/components/Layout.test.tsx
```

Expected: FAIL because **Propostas** has not been added to navigation.

- [ ] **Step 3: Add the route**

Modify `apps/frontend/src/App.tsx`:

```tsx
import ProposalsPage from "./pages/ProposalsPage";
```

Add the route beside the other authenticated app routes:

```tsx
<Route path="/propostas" element={<ProposalsPage />} />
```

Use the existing route nesting pattern exactly. If routes are children of a layout route, add the route as a child of that layout route.

- [ ] **Step 4: Add the menu item**

If `apps/frontend/src/auth/navigation.ts` owns navigation, add this item in the main app navigation array:

```ts
{
  label: "Propostas",
  path: "/propostas",
}
```

If the existing items include icons, permissions, or IDs, follow that shape:

```ts
{
  id: "propostas",
  label: "Propostas",
  path: "/propostas",
  icon: "file-text",
  roles: ["admin", "manager", "technician"],
}
```

If navigation is hard-coded in `apps/frontend/src/components/Layout.tsx`, add a link equivalent to:

```tsx
<NavLink to="/propostas">Propostas</NavLink>
```

Use the same component and active-state class as the surrounding links.

- [ ] **Step 5: Run route/navigation tests**

Run:

```bash
npm --prefix apps/frontend test -- --run apps/frontend/src/auth/navigation.test.ts apps/frontend/src/components/Layout.test.tsx
```

Expected: PASS for existing tests and the new **Propostas** assertion.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add apps/frontend/src/App.tsx apps/frontend/src/auth/navigation.ts apps/frontend/src/components/Layout.tsx apps/frontend/src/auth/navigation.test.ts apps/frontend/src/components/Layout.test.tsx
git commit -m "feat: add proposals app area"
```

Expected: commit succeeds. If only one navigation file/test changed, Git will ignore unchanged paths or report no changes for them; ensure the commit contains the actual route and menu files.

## Task 5: Full Verification And Visual Check

**Files:**
- Verify: frontend app and proposal page

- [ ] **Step 1: Run the full frontend test suite**

Run:

```bash
npm --prefix apps/frontend test -- --run
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript/build verification**

Run:

```bash
npm --prefix apps/frontend run build
```

Expected: PASS and Vite produces a production build.

- [ ] **Step 3: Start the frontend dev server**

Run:

```bash
npm --prefix apps/frontend run dev -- --host 127.0.0.1
```

Expected: dev server prints a localhost URL. Keep it running for browser verification.

- [ ] **Step 4: Browser smoke test**

Open the dev server URL and navigate to `/propostas`.

Verify manually:

- **Propostas** appears in the app navigation.
- The generator page renders with a dark sidebar and proposal preview.
- Selecting "Treinamento TopSolid'Design 7 - Básico" updates subtotal to `R$ 5.100,00`.
- Changing duration to `4` and value to `2000` updates subtotal to `R$ 8.000,00`.
- Creating a custom module shows it in the list and preview.
- Clicking **Desconto para R$ 54.000** applies the same target-total behavior as the standalone HTML.
- Clicking **Imprimir / Salvar PDF** opens the browser print flow.

- [ ] **Step 5: Compare against the standalone HTML**

Open `/Users/yohannreimer/Downloads/Gerador de Proposta Holand oficial.html` in Chrome and compare against `/propostas`.

Expected: the app version preserves the same fields, service catalog, calculations, commercial text, observations, preview structure, and print behavior. Minor app-shell differences are acceptable; proposal rules and content differences are not.

- [ ] **Step 6: Final commit if verification required fixes**

If Task 5 required any fixes, commit them:

```bash
git add apps/frontend/src
git commit -m "fix: align proposals generator migration"
```

Expected: commit succeeds, or no commit is needed because verification required no changes.

## Self-Review

- Spec coverage: The plan creates a **Propostas** area, migrates the standalone generator into React, preserves services, calculations, custom modules, observations, `localStorage`, preview, and browser print flow. It explicitly excludes database/history/client integration.
- Placeholder scan: No `TBD`, `TODO`, or "implement later" instructions are present. Conditional route/menu steps are explicit because the owning file must be confirmed after local file hydration.
- Type consistency: `ProposalService`, `ProposalServiceEdit`, `ServiceState`, `calculateProposalTotals`, `formatCurrency`, `formatLongDate`, and `addDays` are defined before use and referenced consistently in later tasks.
