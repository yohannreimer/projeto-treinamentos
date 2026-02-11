# Orquestrador de Jornadas de Treinamento

Projeto full-stack com front React + API Express + SQLite para operar jornadas modulares em turmas.

## Estrutura
- `apps/backend`: API e persistencia
- `apps/frontend`: interface web operacional

## Como rodar
0. Use Node.js 22.x (recomendado para compatibilidade com `better-sqlite3`):
   - `nvm use` (com `.nvmrc`) ou
   - `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`
1. Instale dependencias na raiz:
   - `npm install`
2. Inicie API:
   - `npm run dev:backend`
3. Em outro terminal, inicie frontend:
   - `npm run dev:frontend`
4. Acesse:
   - Front: `http://localhost:5173`
   - API: `http://localhost:4000`

## Regras implementadas
- Empresa entra em modulo especifico da turma
- `entry_day` nao pode ser menor que o inicio do bloco
- Alocacao so pode ser criada para modulo que existe no bloco da turma
- Para executar modulo diferente de MOD-01, empresa precisa ter MOD-01 concluido
- Ao marcar alocacao como `Executado`, progresso da empresa no modulo vira `Concluido`
- Priorizacao manual por cliente para sugestao de alocacao
- Sugestao de empresas ordenada por elegibilidade, prioridade e tempo parado

## Telas implementadas
- Dashboard
- Calendario de Turmas
- Turmas (lista + criacao)
- Turma (detalhe + alocacao + mudanca de status)
- Clientes (lista)
- Cliente (timeline + historico + acao admin)
- Tecnicos (lista + especialidades)
- Admin Jornada

## Importacao inicial via planilha Excel
1. Abra `Admin Jornada` no front.
2. Informe o caminho da planilha `.xlsx` (padrao):
   - `/Users/yohannreimer/Downloads/Planejamento_Jornada_Treinamentos_v3.xlsx`
3. Clique em `Importar planilha`.

### O que o import cria
- Modulos da jornada (`Jornada_Padrao`)
- Clientes (`Clientes`)
- Progresso por cliente (`Progresso_do_Cliente`) com default `Nao_iniciado` para todos os pares cliente x modulo
- Tecnicos + especialidades (`Tecnicos`)
- Turmas (`Turmas`)
- Blocos das turmas (`Turma_Modulos`)
- Alocacoes (`Alocacao_Turma_Modulo`)
- Modulos opcionais (`Modulos_Opcionais`)
- Progresso opcional (`Progresso_Opcionais`)
