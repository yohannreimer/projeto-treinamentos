# PRD — Orquestrador de Jornadas de Treinamento (MVP)

## 1. Problema
Empresas compram uma jornada padronizada de treinamento em módulos, mas a execução real precisa ocorrer em turmas modulares, com entrada em módulos específicos sem repetir conteúdo já concluído.

## 2. Objetivo
Entregar um sistema operacional para planejar e executar jornadas em turmas, com visibilidade de calendário, progresso por cliente e alocação por módulo.

## 3. Escopo MVP
- Cadastro e gestão de jornada padrão (módulos obrigatórios e opcionais)
- Criação de turmas com blocos sequenciais de módulos
- Alocação de empresas por módulo e dia de entrada
- Controle de técnicos por especialidade
- Atualização de progresso por cliente ao executar alocações
- Dashboards operacionais e calendário

## 4. Perfis de usuário
- Admin: configura jornada, módulos, pré-requisitos e progresso manual
- Operação: cria turmas, aloca empresas, confirma e executa alocações
- Cliente (opcional pós-MVP): visualização da própria jornada

## 5. Regras de negócio críticas
1. MOD-01 (Instalação) é pré-requisito global para conclusão dos demais módulos.
2. Empresa entra em módulo da turma (não na turma inteira).
3. Turma pode ter vários blocos de módulos sequenciais.
4. Ao marcar alocação como `Executado`, o progresso do cliente no módulo vira `Concluido` e grava `completed_at`.
5. O sistema deve sugerir empresas pendentes para os módulos da turma.

## 6. Fluxos principais
### Fluxo A — Criar turma com blocos
1. Criar turma
2. Selecionar técnico
3. Definir data de início
4. Selecionar módulos da turma
5. Definir ordem, offset e duração dos blocos

### Fluxo B — Alocar empresa em módulo
1. Abrir turma
2. Escolher módulo do bloco
3. Selecionar empresa sugerida
4. Definir `entry_day` (padrão: `start_day_offset`)
5. Confirmar alocação

### Fluxo C — Dar baixa de execução
1. Marcar alocação como `Executado`
2. Sistema atualiza progresso do cliente para `Concluido`

## 7. Telas MVP
1. Dashboard
2. Calendário de Turmas
3. Detalhe da Turma
4. Lista de Clientes
5. Perfil do Cliente (timeline/checklist)
6. Técnicos
7. Admin da Jornada

## 8. Métricas de sucesso (MVP)
- Tempo de criação de turma com blocos < 5 min
- 100% das baixas de execução refletidas no progresso
- Redução de alocações manuais fora de regra de pré-requisito
- Visão semanal de capacidade por técnico disponível em 1 tela

## 9. Fora do escopo MVP
- Integrações WhatsApp/email
- Financeiro
- Exportações avançadas
- Recomendação automática por IA

## 10. Stack recomendada
- Front: Lovable + React
- Back: Supabase (Postgres + Auth + RLS)
- Calendário: FullCalendar
- UI: tabela filtrável, chips de status, drawer lateral
