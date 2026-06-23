# Área de Tarefas — Design

## Contexto

O aplicativo já possui um Kanban de Implementação focado em tickets de clientes (pré-vendas, pós-vendas, suporte). Essa nova área é diferente: gestão interna geral da equipe, para tarefas de qualquer natureza — terminar um módulo de treinamento, comprar equipamento, iniciar um MVP, gerenciar um processo interno. Sem vínculo obrigatório com cliente.

Tanto o gestor quanto os técnicos podem criar e receber tarefas.

## Rota e Navegação

Nova entrada no menu principal: **Tarefas**, rota `/tarefas`.

## Página Principal — TasksPage

### Header

Título "Tarefas" com subtítulo "Gestão interna da equipe" e botão "Nova tarefa" à direita.

### Abas de Visualização

| Aba | Comportamento |
|---|---|
| Todas | Lista geral sem filtro de usuário |
| Minhas | Filtrado pelo usuário logado (assignee_id) |
| Atrasadas | Tarefas com due_date vencida e status diferente de Concluida — badge com contador em vermelho |
| Por área | Mesmo conteúdo da aba "Todas" agrupado por task_area |

### Filtros

Linha de filtros acima da tabela: **Área ▾** · **Responsável ▾** · **Prioridade ▾** · **campo de busca** (filtra por título).

Filtros são combinados (AND). Busca por texto é case-insensitive e filtra pelo título da tarefa.

### Tabela

Colunas: **Título** (com badge inline de prioridade quando Crítica ou Alta) · **Área** · **Responsável** · **Prazo** · **Status**.

Prazo exibe em vermelho se a data já passou e o status não é Concluida. Status exibe como pill colorido:

- A fazer → azul
- Em andamento → amarelo
- Concluída → verde

Clicar em qualquer linha abre o **painel de detalhes** à direita. A linha selecionada recebe destaque de fundo.

## Painel de Detalhes — TaskDetailPanel

Painel lateral fixo à direita, visível enquanto uma tarefa está selecionada. Largura aproximada de 280px. Fecha ao clicar fora ou pressionar Esc.

Seções de cima para baixo:

1. **Cabeçalho** — título da tarefa + badges de prioridade, área e status
2. **Metadados** — Responsável e Prazo em grid 2 colunas; prazo em vermelho com texto "Atrasado" se vencido
3. **Descrição** — texto livre; exibe placeholder "Sem descrição" se vazio
4. **Checklist** — lista de itens com checkbox; botão "+ Adicionar item" no rodapé da seção; progresso exibido como "X/Y" ao lado do label da seção
5. **Comentários** — lista cronológica crescente com autor, timestamp relativo (ex: "há 2h") e texto; campo de texto + botão Enviar fixo no rodapé do painel
6. **Ações** — botões Editar (abre modal) e Concluir (atalho para mudar status para Concluida)

## Modal Nova/Editar Tarefa — TaskFormModal

Abre centralizado ao clicar em "Nova tarefa" ou "Editar" no painel. Campos:

| Campo | Tipo | Obrigatório |
|---|---|---|
| Título | input texto | sim |
| Área | select com opção "+ Criar nova área" | sim |
| Responsável | select com lista de técnicos cadastrados | sim |
| Prazo | date picker | sim |
| Prioridade | select: Crítica / Alta / Normal / Baixa | não (padrão: Normal) |
| Descrição | textarea | não |

Ao selecionar "+ Criar nova área" no select de área, exibe um campo inline para digitar o nome da nova área. A nova área é criada junto com a tarefa no mesmo submit.

## Banco de Dados

### task_area

```sql
create table if not exists task_area (
  id text primary key,
  name text not null unique,
  color text not null default '#6366f1',
  position integer not null default 0,
  created_at text not null,
  updated_at text not null
);
```

Áreas padrão inseridas na inicialização se a tabela estiver vazia: **Técnico**, **Comercial**, **Financeiro**, **Interno**, **RH**.

### task

```sql
create table if not exists task (
  id text primary key,
  title text not null,
  description text,
  area_id text not null,
  assignee_id text not null,
  assignee_name text not null,
  due_date text not null,
  priority text not null default 'Normal',
  status text not null default 'A_fazer',
  created_by text not null,
  created_at text not null,
  updated_at text not null,
  foreign key(area_id) references task_area(id)
);
```

`assignee_id` armazena o `id` do técnico da tabela `technician`. `assignee_name` é denormalizado para exibição rápida sem JOIN. Não há FK hard em `assignee_id` para permitir que o gestor (que não tem registro em `technician`) também seja responsável — nesse caso `assignee_id` recebe o `id` do `internal_user` e `assignee_name` o `display_name`.

Valores de `priority`: `Critica` · `Alta` · `Normal` · `Baixa`

Valores de `status`: `A_fazer` · `Em_andamento` · `Concluida`

### task_checklist_item

```sql
create table if not exists task_checklist_item (
  id text primary key,
  task_id text not null,
  label text not null,
  completed integer not null default 0,
  position integer not null default 0,
  created_at text not null,
  foreign key(task_id) references task(id) on delete cascade
);
```

### task_comment

```sql
create table if not exists task_comment (
  id text primary key,
  task_id text not null,
  author_id text not null,
  author_name text not null,
  body text not null,
  created_at text not null,
  foreign key(task_id) references task(id) on delete cascade
);
```

## Backend — Rotas

Todas as rotas exigem autenticação interna existente.

### Áreas

| Método | Rota | Descrição |
|---|---|---|
| GET | `/task-areas` | Lista todas as áreas ordenadas por position |
| POST | `/task-areas` | Cria nova área (name obrigatório) |

### Tarefas

| Método | Rota | Descrição |
|---|---|---|
| GET | `/tasks` | Lista tarefas com filtros opcionais: `area_id`, `assignee_id`, `priority`, `status`, `overdue=true`, `q` (busca por título) |
| POST | `/tasks` | Cria tarefa |
| GET | `/tasks/:id` | Detalhe de uma tarefa com checklist e comentários |
| PATCH | `/tasks/:id` | Atualiza campos da tarefa |
| DELETE | `/tasks/:id` | Remove tarefa |

### Checklist

| Método | Rota | Descrição |
|---|---|---|
| POST | `/tasks/:id/checklist` | Adiciona item ao checklist |
| PATCH | `/tasks/:id/checklist/:itemId` | Atualiza label ou completed do item |
| DELETE | `/tasks/:id/checklist/:itemId` | Remove item |

### Comentários

| Método | Rota | Descrição |
|---|---|---|
| GET | `/tasks/:id/comments` | Lista comentários ordenados por created_at asc |
| POST | `/tasks/:id/comments` | Adiciona comentário (body obrigatório) |

## Frontend — Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `apps/frontend/src/pages/TasksPage.tsx` | Página principal: abas, filtros, tabela, estado de seleção |
| `apps/frontend/src/components/tasks/TaskDetailPanel.tsx` | Painel lateral de detalhes |
| `apps/frontend/src/components/tasks/TaskFormModal.tsx` | Modal de criação e edição |
| `apps/frontend/src/components/tasks/TaskChecklist.tsx` | Checklist interativo com add/toggle/remove |
| `apps/frontend/src/components/tasks/TaskComments.tsx` | Thread de comentários com campo de envio |

Rota `/tarefas` adicionada ao router existente. Item "Tarefas" adicionado ao menu de navegação principal.

## Padrões a Seguir

- Seguir o padrão de autenticação interna já usado nas demais rotas (`requireInternalAuth`)
- IDs gerados com `uuid()` do db.ts
- Datas ISO 8601 com `nowDateIso()` do db.ts
- Tipos TypeScript no frontend alinhados com os tipos retornados pelas rotas
- Testes unitários para as rotas seguindo o padrão dos arquivos `.test.ts` existentes

## O que Esta Entrega Não Inclui

- Notificações por email ou push quando tarefas são atribuídas ou atrasadas
- Dependências entre tarefas
- Templates de tarefa
- Tarefas recorrentes
- Vínculo com cliente, proposta ou módulo
