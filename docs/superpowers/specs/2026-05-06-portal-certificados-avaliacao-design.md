# Portal Certificados e Avaliação de Treinamento

## Objetivo

Adicionar ao Portal do Cliente uma aba **Certificados**, permitindo que o cliente baixe certificados de treinamentos e entregáveis concluídos. Para treinamentos ministrados, o primeiro download de cada certificado exige uma avaliação de satisfação vinculada à empresa, turma e módulo. Entregáveis concluídos ficam liberados diretamente.

## Escopo

- Criar aba `Certificados` no Portal do Cliente, mantendo o mesmo estilo visual das abas atuais do portal.
- Listar certificados disponíveis para a empresa logada.
- Liberar certificados de entregáveis concluídos sem avaliação.
- Exigir uma avaliação por `empresa + turma + módulo` antes do primeiro download de certificados de treinamento ministrado.
- Abrir a avaliação como página inteira dentro do portal, com visual premium escuro inspirado no HTML aprovado pelo usuário.
- Salvar a avaliação enviada em Documentação interna, sem duplicar envios para o mesmo `empresa + turma + módulo`.
- Gerar/baixar certificados com o padrão de arquivo já definido: `Certificado - Nome da Empresa - Módulo.pdf`.

## Fora de Escopo

- Avaliação por participante individual.
- Dashboard analítico de notas.
- Edição da avaliação pelo cliente após envio.
- Transformar a aba Certificados inteira no tema escuro premium; esse visual pertence apenas à página de avaliação.

## Experiência do Cliente

### Aba Certificados

A nova aba aparece na sidebar do portal junto de `Planejamento`, `Agenda` e `Suporte`.

A página segue o estilo atual do portal e mostra uma lista de certificados com:

- Tipo: `Treinamento ministrado` ou `Entregável`.
- Nome do módulo.
- Turma, instrutor e data quando for treinamento.
- Status: `Avaliação pendente`, `Liberado`, `Concluído e aprovado`, ou equivalente.
- Ação principal:
  - `Responder avaliação` para treinamento concluído ainda não avaliado.
  - `Baixar PDF` para treinamento já avaliado.
  - `Baixar PDF` para entregável concluído.

### Página de Avaliação

Ao clicar em `Responder avaliação`, o cliente vai para esta rota de página inteira dentro do portal:

`/portal/:slug/certificados/:certificateId/avaliacao`

A página usa o estilo premium escuro aprovado:

- Fundo navy.
- Vermelho Holand como cor de destaque.
- Tipografia Inter.
- Cabeçalho com marca Holand e contexto da ficha.
- Hero “Avalie seu curso”.
- Seções numeradas.
- Notas clicáveis de 1 a 5.
- Alternativas em botões.
- Campos de comentário.
- Tela de sucesso após envio.

Dados como curso/módulo, turma, data e instrutor são preenchidos pelo sistema e não podem ser alterados pelo cliente. O campo `Respondido por` é obrigatório.

Após envio com sucesso:

- A avaliação é gravada.
- Uma cópia estruturada é salva em Documentação interna.
- O certificado fica liberado para download.
- O cliente volta para a aba Certificados ou vê uma ação clara para baixar o PDF.

## Perguntas da Avaliação

Todas as notas usam escala 1 a 5, exceto perguntas de escolha e campos abertos.

### 1. Avaliação do Instrutor

1. O instrutor demonstrou domínio técnico do conteúdo do curso?
2. O instrutor explicou os conceitos de forma clara e objetiva?
3. O instrutor foi paciente e disponível para tirar dúvidas?
4. O ritmo das aulas foi adequado?
5. O instrutor estimulou a participação e a prática dos alunos?
6. Qual foi o principal ponto forte do instrutor?
7. O que o instrutor poderia melhorar?

### 2. Avaliação do Conteúdo

8. O conteúdo do curso atendeu às suas expectativas?
9. Os temas abordados foram relevantes para sua realidade profissional?
10. O nível de dificuldade do curso foi adequado? Opções: `Muito fácil`, `Adequado`, `Um pouco difícil`, `Muito difícil`.
11. As aulas práticas foram suficientes?
12. A sequência dos tópicos foi lógica e bem organizada?
13. Você se sente mais confiante para aplicar o conteúdo após o curso?

### 3. Materiais e Recursos

14. O material didático foi de boa qualidade?
15. Os exercícios práticos foram úteis e bem elaborados?
16. O ambiente, laboratório ou licenças do software funcionaram bem?

### 4. Avaliação Geral

17. No geral, como você avalia o curso? Opções: `Excelente`, `Bom`, `Regular`, `Ruim`, `Péssimo`.
18. Recomendaria este curso para outros colegas? Opções: `Sim, com certeza`, `Sim, com ressalvas`, `Não`.
19. Qual foi o tópico mais útil do curso?
20. Qual tópico você achou menos útil ou precisa de mais aprofundamento?

### 5. Sugestões e Comentários

21. O que mais você gostou no curso?
22. O que podemos melhorar para as próximas turmas?
23. Sugestões de novos temas ou módulos que gostaria de ver?

## Backend

### Fonte dos Certificados

O backend deve construir a lista de certificados a partir dos dados reais:

- Treinamentos ministrados: alocações de turma executadas/concluídas para a empresa, com módulo concluído.
- Entregáveis: módulos do tipo `entregavel` concluídos na jornada da empresa.

O backend deve calcular para cada item:

- `certificate_id` estável.
- `company_id`.
- `module_id`.
- `cohort_id` quando existir.
- `certificate_type`: `training` ou `deliverable`.
- `requires_evaluation`.
- `evaluation_submitted`.
- `download_available`.
- `download_url`.
- `evaluation_url`.

### Persistência da Avaliação

Criar persistência própria para avaliações na tabela `portal_certificate_evaluation`, com:

- `id`.
- `company_id`.
- `portal_client_id`.
- `cohort_id`.
- `module_id`.
- `respondent_name`.
- `answers_json`.
- `created_at`.
- `updated_at`.

A unicidade deve impedir duplicidade por `company_id + cohort_id + module_id`. Para entregáveis, não há avaliação obrigatória.

### Documentação Interna

Ao enviar a avaliação, o backend deve criar ou atualizar um documento interno em `internal_document`:

- Categoria sugerida: `Pesquisas de Satisfação`.
- Título sugerido: `Pesquisa - Nome da Empresa - Módulo`.
- Notas contendo:
  - Chave estável da avaliação.
  - Empresa.
  - Turma.
  - Módulo.
  - Respondido por.
  - Data de envio.
  - Respostas em formato legível.

O salvamento deve ser idempotente: reenviar ou reprocessar a mesma avaliação não cria documentos duplicados.

### Segurança

- Todas as rotas ficam sob `/portal/api` e exigem sessão do portal.
- O cliente só acessa certificados da própria empresa da sessão.
- A liberação do download é validada no backend.
- O frontend não pode liberar certificado apenas alterando estado local.

## Rotas Propostas

- `GET /portal/api/certificates`
  - Lista certificados disponíveis e seus estados.
- `GET /portal/api/certificates/:certificateId/evaluation`
  - Retorna metadados e respostas existentes, se houver.
- `POST /portal/api/certificates/:certificateId/evaluation`
  - Salva a avaliação, registra documentação e libera certificado.
- `GET /portal/api/certificates/:certificateId/download`
  - Baixa o certificado se a regra permitir.

As rotas podem delegar para a geração de certificado já existente, mas devem preservar a regra de autorização e avaliação do portal.

## Frontend

### Arquivos Esperados

- Nova página `PortalCertificatesPage`.
- Nova página `PortalCertificateEvaluationPage`.
- Novos métodos em `portal/api.ts`.
- Tipos em `portal/types.ts`.
- Entrada na navegação de `PortalShell`.
- CSS no sistema visual do portal, com um bloco específico para a avaliação premium.

### Estados da Lista

- Carregando.
- Sem certificados disponíveis.
- Certificado bloqueado por avaliação.
- Certificado liberado.
- Erro de API.

### Estados da Avaliação

- Carregando metadados.
- Formulário incompleto.
- Enviando.
- Sucesso.
- Avaliação já enviada.
- Erro de API.

## Testes

Backend:

- Lista treinamento concluído como pendente quando não há avaliação.
- Lista treinamento concluído como liberado quando há avaliação.
- Lista entregável concluído como liberado sem avaliação.
- Bloqueia download de treinamento sem avaliação.
- Permite download após avaliação.
- Salva avaliação e documento interno sem duplicar.
- Impede acesso a certificado de outra empresa.

Frontend:

- Renderiza aba Certificados na navegação.
- Mostra ação correta por tipo/status.
- Envia avaliação com campos obrigatórios.
- Após envio, mostra sucesso/liberação.

## Decisões Aprovadas

- Avaliação é por módulo/turma.
- Avaliação é uma vez por empresa.
- Entregáveis e treinamentos aparecem na aba Certificados, com regras diferentes.
- Avaliação é obrigatória somente antes do primeiro download.
- Campo `Respondido por` é obrigatório.
- Escalas numéricas serão padronizadas em 1 a 5, com opções nomeadas onde fizer sentido.
- A aba Certificados mantém o estilo atual do portal.
- A avaliação abre como página inteira dentro do portal, com visual premium escuro.
