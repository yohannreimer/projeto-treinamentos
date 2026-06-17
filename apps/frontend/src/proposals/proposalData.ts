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
