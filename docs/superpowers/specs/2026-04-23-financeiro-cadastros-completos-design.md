# Design: Financeiro Cadastros Completos (Fase 2)

## Status de Implementação
Atualizado em 2026-04-23.

A Fase 2 está implementada no workspace principal, ainda sem commit/push por decisão do usuário.

Itens concluídos:

- CRUD de contas financeiras com criação, edição e inativação;
- CRUD de categorias com criação, edição, categoria pai e inativação;
- CRUD de centros de custo com criação, edição e inativação;
- CRUD de formas de pagamento com criação, edição e inativação;
- edição de entidades existentes;
- edição de tags e perfis inteligentes por contexto na própria aba de entidades;
- detecção de duplicidades por documento, razão social e nome fantasia normalizados;
- combinações favoritas com contexto, categoria, centro de custo, conta e forma de pagamento;
- tela `Cadastros` reorganizada em seções compactas preservando o estilo visual atual;
- testes backend/frontend cobrindo os novos contratos e fluxos principais.

Verificações executadas:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- finance
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceCadastrosPage FinancePayablesPage FinanceReceivablesPage FinanceReconciliationPage FinanceOverviewPage
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
```

Resultado:

- backend: 70 testes passando;
- frontend financeiro alvo: 19 testes passando;
- build backend/frontend passando;
- aviso restante apenas do Vite sobre chunk acima de 500 kB.

Pendente antes de encerramento definitivo:

- QA visual/manual em localhost pelo usuário;
- ajustes finos após análise visual;
- commit/push somente depois da validação.

## 1. Objetivo
A Fase 2 transforma a aba `Cadastros` na base operacional do financeiro.

Depois da Fase 1, o sistema já entende entidades, classificações, defaults por contexto e qualidade de dados. Agora a meta é permitir manutenção completa desses cadastros sem sair da tela, preservando a interface limpa e premium já aprovada.

## 2. Princípios
- A tela continua sendo uma área de trabalho, não uma página de configuração pesada.
- O usuário iniciante consegue cadastrar o básico sem entender contabilidade.
- O usuário avançado consegue organizar contas, categorias, centros, formas e combinações para deixar lançamentos mais automáticos.
- Edição e inativação são preferidas a exclusão destrutiva, porque cadastros podem estar ligados a lançamentos históricos.
- O estilo visual atual deve ser preservado: painéis brancos, bordas leves, tipografia compacta, botões discretos e densidade útil.

## 3. Escopo da Fase 2
### 3.1 Entidades
- editar entidade existente;
- ativar/inativar entidade;
- editar classificações/tags;
- editar perfis inteligentes por contexto;
- detectar possíveis duplicidades por documento, razão social ou nome fantasia normalizados.

### 3.2 Catálogos
CRUD completo para:

- contas financeiras;
- categorias;
- centros de custo;
- formas de pagamento.

O `delete` funcional será implementado como inativação quando houver risco de vínculo histórico.

### 3.3 Combinações Favoritas
Adicionar combinações salvas para acelerar lançamentos:

- nome da combinação;
- contexto: qualquer, conta a pagar, conta a receber ou movimentação;
- categoria;
- centro de custo;
- conta;
- forma de pagamento;
- status ativo/inativo.

Essas combinações não substituem perfis por entidade. Elas servem como atalhos reutilizáveis para padrões frequentes.

## 4. Experiência de Interface
A aba `Cadastros` passa a ter seções compactas:

- `Entidades`;
- `Contas`;
- `Categorias`;
- `Centros`;
- `Formas`;
- `Combinações`;
- `Duplicidades`.

O layout segue a estrutura já existente:

- coluna esquerda para criação/edição;
- área direita para lista e revisão;
- ações pequenas na linha;
- estados claros de ativo/inativo;
- sem adicionar hero, cards decorativos ou blocos explicativos longos.

## 5. Contratos de Backend
Novos endpoints esperados:

- `PATCH /finance/entities/:entityId`;
- `GET /finance/entities/duplicates`;
- `PATCH /finance/accounts/:id`;
- `DELETE /finance/accounts/:id`;
- `PATCH /finance/categories/:id`;
- `DELETE /finance/categories/:id`;
- `PATCH /finance/catalog/cost-centers/:id`;
- `DELETE /finance/catalog/cost-centers/:id`;
- `PATCH /finance/catalog/payment-methods/:id`;
- `DELETE /finance/catalog/payment-methods/:id`;
- `GET /finance/catalog/favorite-combinations`;
- `POST /finance/catalog/favorite-combinations`;
- `PATCH /finance/catalog/favorite-combinations/:id`;
- `DELETE /finance/catalog/favorite-combinations/:id`.

## 6. Critérios de Aceite
- O usuário consegue criar, editar e inativar cada cadastro principal.
- A lista de catálogo reflete alterações sem refresh manual.
- O usuário consegue editar perfil inteligente de entidade já existente.
- O sistema aponta duplicidades prováveis sem bloquear operação.
- O usuário consegue salvar combinações favoritas e inativá-las.
- Testes backend cobrem endpoints e regras principais.
- Testes frontend cobrem a jornada básica da aba `Cadastros`.
- Build segue passando.

## 7. Fora de Escopo
Ficam para fases seguintes:

- recorrência completa;
- parcelamento;
- baixa parcial;
- aprovação de pagamentos;
- relatórios/DRE por competência;
- regras automáticas avançadas;
- integrações bancárias.
