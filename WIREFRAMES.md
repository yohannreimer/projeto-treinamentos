# Wireframes Textuais — Orquestrador de Jornadas

## 1) Dashboard
### Estrutura
- Header: filtros globais (`técnico`, `categoria`, `período`)
- Linha de KPIs:
  - Turmas em aberto
  - Próximas turmas (7/14/30 dias)
  - Pendências por módulo (top 5)
  - Clientes travados por pré-requisito
- Bloco esquerdo: tabela “Pendências por Módulo”
- Bloco direito: “Carga por Técnico” (barra/lista)

### Ações
- Clique em KPI abre lista filtrada
- Atalho “Criar Turma”

---

## 2) Calendário de Turmas
### Estrutura
- Toolbar: `Month | Week | Agenda`, filtros, botão `Nova Turma`
- Área principal: calendário com eventos (Cohorts)
- Evento mostra: nome da turma, técnico, status

### Interação
- Clique no evento abre drawer lateral:
  - Dados gerais da turma
  - Blocos de módulo (ordem + dias)
  - Capacidade ocupada x total
  - Empresas alocadas por módulo
  - Botões: `Editar turma`, `Alocar empresas`

---

## 3) Turma (detalhe)
### Estrutura
- Card 1: dados gerais (nome, técnico, início, status, capacidade)
- Card 2: blocos da turma (lista ordenada)
- Card 3: alocações (tabela com filtro por módulo)

### Tabela de Alocação
Colunas:
- Empresa
- Módulo
- Entry Day
- Status
- Ações

Ações rápidas:
- Confirmar
- Marcar executado
- Cancelar

---

## 4) Clientes (lista)
### Estrutura
- Filtro por status e por próximo módulo
- Tabela principal com colunas:
  - Empresa
  - % jornada concluída
  - Próximo módulo pendente
  - Status
  - Alertas
  - Ações

### Ações
- Abrir perfil
- Adicionar opcional
- Ver histórico

---

## 5) Cliente (perfil)
### Estrutura
- Cabeçalho com dados da empresa
- Seção Jornada (timeline/checklist MOD-01...MOD-12)
- Seção Opcionais
- Seção Histórico de turmas

### Ações
- Admin: marcar módulo concluído manualmente
- Sugerir próximas turmas compatíveis

---

## 6) Técnicos
### Estrutura
- Lista com:
  - Nome
  - Especialidades
  - Próximas turmas
  - Carga mensal
- Página detalhe:
  - Calendário filtrado por técnico
  - Editor de especialidades

---

## 7) Admin Jornada
### Estrutura
- Aba Módulos da Jornada
- Aba Módulos Opcionais
- Aba Regras Globais

### Ações
- Editar ordem/duração/obrigatoriedade/pré-requisitos
- Ativar flag de pré-requisito global de Instalação

---

## Padrões de UI
- Chips de status com cores fixas
- Drawer para edição rápida
- Tabelas com busca + filtros + paginação
- Timeline de blocos por turma (dia inicial e duração)
