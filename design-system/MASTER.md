# Design System v1 — Orquestrador de Jornadas

## 1. Direcao Visual
- Produto operacional B2B para planejamento de treinamento tecnico.
- Estilo: clean tecnico, alta legibilidade, densidade controlada, foco em tabela/calendario.
- Prioridade: clareza de dados e velocidade operacional acima de decoracao.

## 2. Tokens Base
### Cores
- Primaria: `--color-primary` / `--color-primary-strong`
- Texto: `--color-text` / `--color-text-muted`
- Superficie: `--color-surface` / `--color-surface-soft`
- Borda: `--color-border` / `--color-border-strong`
- Semanticas:
  - Sucesso: `--color-success`
  - Aviso: `--color-warning`
  - Erro: `--color-danger`

### Espacamento
- Escala padrao: `--space-1` ate `--space-8` (4px a 32px).
- Espacamentos principais:
  - gap de formulario: 9-14px
  - gap de grid de pagina: 14-16px
  - padding de painel: 15px

### Borda e Elevacao
- Raio:
  - pequeno: `--radius-sm`
  - medio: `--radius-md`
  - grande: `--radius-lg`
- Sombra:
  - base: `--shadow-soft`
  - destaque: `--shadow`

### Interacao
- Focus ring unico: `--focus-ring`
- Duracoes:
  - rapido: `--motion-fast`
  - base: `--motion-base`
  - lento: `--motion-slow`

## 3. Tipografia
- Heading: `Manrope`
- Body/UI: `IBM Plex Sans`
- Regras:
  - `h1` por tela com contexto claro
  - Tabela densa em 0.84rem-0.9rem
  - Labels de formulario com peso 600

## 4. Componentes Base
### Panel
- Uso: agrupar contexto funcional por bloco.
- Estrutura:
  - `.panel`
  - `.panel-header`
  - `.panel-header-actions`
  - `.panel-content`

### KPI
- Uso: indicadores de topo por tela.
- Estrutura:
  - `.kpi-card`
  - `.kpi-helper` para explicacao secundaria.

### Tabela Operacional
- Regras:
  - cabecalho fixo, zebra suave, hover claro
  - colunas de acao alinhadas a direita (`td.actions`)
  - links com padrao visual consistente

### Formulario Operacional
- Regras:
  - label visivel
  - feedback de foco unico
  - hint opcional via `.form-hint`

## 5. Acessibilidade Minima Obrigatoria
- Foco visivel em todos os controles.
- Contraste AA para texto e acoes.
- Controles clicaveis com area adequada.
- Nao depender apenas de cor para status.

## 6. Responsividade
- Breakpoints operacionais:
  - desktop: >1160px
  - tablet: <=1160px
  - mobile: <=960px
- Em mobile:
  - acao de header ocupa largura total
  - grids convertem para 1 coluna

## 7. Convencoes de Evolucao
- Toda nova tela deve usar componentes base.
- Evitar estilos inline para layout.
- Priorizar tokens ao inves de valores hardcoded.
