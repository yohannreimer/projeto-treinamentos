# Jornada KPI Compacta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir, no topo da jornada de módulos do cliente, KPIs compactos e clicáveis para `Concluído`, `Em andamento`, `Planejado`, `Stand-by` e `Todos`, com filtro visual imediato na lista.

**Architecture:** Implementação 100% frontend na tela `ClientDetailPage`, sem mudanças de API/banco. A classificação é derivada do `timeline` já retornado (`status` + `is_enabled`), gerando contadores e lista filtrada em memória via `useMemo`.

**Tech Stack:** React 18 + TypeScript + CSS global (`apps/frontend/src/styles.css`) + Vite.

---

## File Structure

- Modify: `apps/frontend/src/pages/ClientDetailPage.tsx`
  - Responsabilidade: cálculo dos KPIs, estado de filtro e renderização dos chips compactos.
- Modify: `apps/frontend/src/styles.css`
  - Responsabilidade: estilo compacto/responsivo dos chips KPI e texto de contexto.
- Validate only: `apps/frontend/src/components/StatusChip.tsx`
  - Responsabilidade: manter consistência visual (sem mudança prevista).

## Task 1: Modelar estados derivados da jornada

**Files:**
- Modify: `apps/frontend/src/pages/ClientDetailPage.tsx`
- Test: verificação por build no frontend

- [ ] **Step 1: Adicionar tipo local para filtro de jornada**

```ts
type JourneyFilter = 'all' | 'Concluido' | 'Em_execucao' | 'Planejado' | 'Nao_iniciado';
```

- [ ] **Step 2: Criar estado de filtro**

```ts
const [journeyFilter, setJourneyFilter] = useState<JourneyFilter>('all');
```

- [ ] **Step 3: Criar memos para módulos ativos e desativados**

```ts
const activeTimeline = useMemo(
  () => timeline.filter((item: any) => Boolean(item.is_enabled)),
  [timeline]
);

const disabledCount = useMemo(
  () => timeline.filter((item: any) => !item.is_enabled).length,
  [timeline]
);
```

- [ ] **Step 4: Criar contadores de KPI com regra de negócio aprovada**

```ts
const journeyKpis = useMemo(() => {
  const counts = {
    Concluido: 0,
    Em_execucao: 0,
    Planejado: 0,
    Nao_iniciado: 0
  };

  activeTimeline.forEach((item: any) => {
    if (item.status === 'Concluido') counts.Concluido += 1;
    else if (item.status === 'Em_execucao') counts.Em_execucao += 1;
    else if (item.status === 'Planejado') counts.Planejado += 1;
    else counts.Nao_iniciado += 1; // stand-by automático
  });

  return counts;
}, [activeTimeline]);
```

- [ ] **Step 5: Criar memo da lista filtrada**

```ts
const filteredTimeline = useMemo(() => {
  if (journeyFilter === 'all') return activeTimeline;
  return activeTimeline.filter((item: any) => item.status === journeyFilter);
}, [activeTimeline, journeyFilter]);
```

- [ ] **Step 6: Rodar build para validar tipagem**

Run: `cd "/Users/yohannreimer/Documents/Projeto Treinamentos" && npm run build -w apps/frontend`  
Expected: build concluído sem erro TypeScript.

- [ ] **Step 7: Commit**

```bash
cd "/Users/yohannreimer/Documents/Projeto Treinamentos"
git add apps/frontend/src/pages/ClientDetailPage.tsx
git commit -m "feat: add compact journey KPI filter state for client detail"
```

## Task 2: Renderizar faixa compacta de KPIs e aplicar filtro na lista

**Files:**
- Modify: `apps/frontend/src/pages/ClientDetailPage.tsx`
- Test: validação manual da página de cliente

- [ ] **Step 1: Inserir bloco visual acima da `<ul className=\"timeline\">`**

```tsx
<div className="journey-kpi-strip">
  <button
    type="button"
    className={`journey-kpi-btn ${journeyFilter === 'Concluido' ? 'is-active' : ''}`}
    onClick={() => setJourneyFilter((prev) => (prev === 'Concluido' ? 'all' : 'Concluido'))}
  >
    Concluído {journeyKpis.Concluido}
  </button>
  <button
    type="button"
    className={`journey-kpi-btn ${journeyFilter === 'Em_execucao' ? 'is-active' : ''}`}
    onClick={() => setJourneyFilter((prev) => (prev === 'Em_execucao' ? 'all' : 'Em_execucao'))}
  >
    Em andamento {journeyKpis.Em_execucao}
  </button>
  <button
    type="button"
    className={`journey-kpi-btn ${journeyFilter === 'Planejado' ? 'is-active' : ''}`}
    onClick={() => setJourneyFilter((prev) => (prev === 'Planejado' ? 'all' : 'Planejado'))}
  >
    Planejado {journeyKpis.Planejado}
  </button>
  <button
    type="button"
    className={`journey-kpi-btn ${journeyFilter === 'Nao_iniciado' ? 'is-active' : ''}`}
    onClick={() => setJourneyFilter((prev) => (prev === 'Nao_iniciado' ? 'all' : 'Nao_iniciado'))}
  >
    Stand-by {journeyKpis.Nao_iniciado}
  </button>
  <button
    type="button"
    className={`journey-kpi-btn ${journeyFilter === 'all' ? 'is-active' : ''}`}
    onClick={() => setJourneyFilter('all')}
  >
    Todos {activeTimeline.length}
  </button>
</div>
```

- [ ] **Step 2: Inserir linha de contexto logo abaixo dos chips**

```tsx
<p className="journey-kpi-meta">
  Exibindo {filteredTimeline.length} de {activeTimeline.length} módulos ativos.
  {disabledCount > 0 ? ` Desativados: ${disabledCount}.` : ''}
</p>
```

- [ ] **Step 3: Trocar renderização da timeline para usar lista filtrada**

```tsx
{filteredTimeline.map((moduleItem: any) => {
  // bloco existente do item
})}
```

- [ ] **Step 4: Tratar estado vazio de filtro**

```tsx
{filteredTimeline.length === 0 ? (
  <li className="timeline-item">
    <div className="timeline-copy">
      <strong>Sem módulos neste filtro.</strong>
      <p>Ajuste o filtro para visualizar outros módulos ativos.</p>
    </div>
  </li>
) : (
  filteredTimeline.map(...)
)}
```

- [ ] **Step 5: Validar manualmente no browser**

Run:
`cd "/Users/yohannreimer/Documents/Projeto Treinamentos" && PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run dev:frontend`

Manual checks:
- clicar em cada KPI filtra corretamente
- clicar no KPI ativo volta para `all`
- `Todos` sempre reseta filtro
- `Stand-by` mostra apenas `Nao_iniciado` ativos
- contador de desativados aparece apenas quando `> 0`

- [ ] **Step 6: Commit**

```bash
cd "/Users/yohannreimer/Documents/Projeto Treinamentos"
git add apps/frontend/src/pages/ClientDetailPage.tsx
git commit -m "feat: add compact KPI strip and filtering in client journey"
```

## Task 3: Ajustar UI compacta e responsiva dos chips KPI

**Files:**
- Modify: `apps/frontend/src/styles.css`
- Test: build frontend + verificação manual de layout

- [ ] **Step 1: Adicionar estilos da faixa KPI**

```css
.journey-kpi-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
}

.journey-kpi-btn {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 5px 10px;
  background: #f3f7ff;
  color: var(--ink);
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1.1;
  cursor: pointer;
}

.journey-kpi-btn.is-active {
  border-color: #1d5fa8;
  background: #1d5fa8;
  color: #fff;
}

.journey-kpi-meta {
  margin: 0 0 10px;
  color: var(--ink-soft);
  font-size: 0.82rem;
}
```

- [ ] **Step 2: Adicionar regra mobile para reduzir densidade**

```css
@media (max-width: 900px) {
  .journey-kpi-btn {
    padding: 5px 9px;
    font-size: 0.78rem;
  }
}
```

- [ ] **Step 3: Rodar build frontend**

Run: `cd "/Users/yohannreimer/Documents/Projeto Treinamentos" && npm run build -w apps/frontend`  
Expected: build concluído sem erro.

- [ ] **Step 4: Commit**

```bash
cd "/Users/yohannreimer/Documents/Projeto Treinamentos"
git add apps/frontend/src/styles.css
git commit -m "style: compact KPI strip styles for client journey"
```

## Task 4: Regressão funcional da tela de cliente

**Files:**
- Validate: `apps/frontend/src/pages/ClientDetailPage.tsx`
- Validate: `apps/frontend/src/styles.css`

- [ ] **Step 1: Validar ações existentes por módulo**

Manual checks no perfil do cliente:
- `Salvar módulo` continua funcionando
- `Concluir (Admin)` continua mudando para `Concluido`
- `Desfazer conclusão` funciona para `Concluido`
- `Ativar/Desativar módulo` recalcula KPIs

- [ ] **Step 2: Validar histórico e opcionais sem regressão**

Manual checks:
- tabela de opcionais renderiza normalmente
- histórico de turmas e ordenação permanecem funcionais

- [ ] **Step 3: Validar build geral do monorepo**

Run: `cd "/Users/yohannreimer/Documents/Projeto Treinamentos" && npm run build`  
Expected: backend e frontend compilam sem erro.

- [ ] **Step 4: Commit final**

```bash
cd "/Users/yohannreimer/Documents/Projeto Treinamentos"
git add apps/frontend/src/pages/ClientDetailPage.tsx apps/frontend/src/styles.css
git commit -m "feat: improve client module journey with compact status overview"
```

## Self-Review

### 1) Spec coverage

- Regra de stand-by automático: coberta em Task 1 (`Nao_iniciado` + ativo).
- Visual compacto com 4 estados + todos: coberto em Task 2/3.
- Filtro por clique e reset: coberto em Task 2.
- Contador de desativados fora dos 4 KPIs: coberto em Task 1/2.
- Critério de pouco espaço: coberto em Task 3 (chip compacto + responsivo).

### 2) Placeholder scan

- Sem `TODO`, `TBD` ou “implementar depois”.
- Todos os passos têm comando ou snippet executável.

### 3) Type consistency

- Status usados no filtro (`Concluido`, `Em_execucao`, `Planejado`, `Nao_iniciado`) seguem os mesmos valores já usados na tela.
- `JourneyFilter` mantém `all` para reset sem conflito com payload de API.
