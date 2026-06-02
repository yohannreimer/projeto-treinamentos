# Hub de Conhecimento — Redesign da Documentação

**Data:** 2026-06-01
**Status:** Aprovado

## Contexto

A página `InternalDocsPage.tsx` existe e funciona, mas está aquém visual e funcionalmente. O objetivo é transformá-la no hub central de conhecimento da Holand: gestão de arquivos por cliente, criação de páginas wiki internas, templates reutilizáveis, base de conhecimento e compartilhamento por link público para clientes.

A sidebar do app, topbar e design system existente estão ótimos — não mudam. O redesign é apenas da página de Documentação, dentro do mesmo DNA visual (Inter, `--brand-accent: #ef2f0f`, `--brand-ink: #1d2830`, superfícies brancas, bordas `--line: #d6dbe0`).

**Restrição de ícones:** nenhuma biblioteca externa. Usar exclusivamente SVG inline com `viewBox="0 0 16 16"`, `stroke="currentColor"`, `strokeWidth="1.5"`, `strokeLinecap="round"` — mesmo padrão de `FinanceSidebar.tsx`. Nenhum emoji em nenhum lugar.

---

## Arquitetura de Componentes

O `InternalDocsPage.tsx` atual (789 linhas) vira um shell fino. A lógica de construção da árvore, filtragem e dados é preservada — o que muda é a estrutura de apresentação.

```
pages/
  InternalDocsPage.tsx          ← shell (~100 linhas), orquestra estado global

components/docs/
  DocsSidebar.tsx               ← árvore com 4 seções fixas
  DocsMainArea.tsx              ← breadcrumb + toolbar + grade de itens
  DocsDetailPanel.tsx           ← painel direito contextual (detalhes + upload)
  FolderCard.tsx                ← card de pasta (3 variantes de cor por seção)
  WikiPageCard.tsx              ← card de página wiki (estilo âmbar)
  FileCard.tsx                  ← card de arquivo PDF/imagem com ações inline
  PageEditorModal.tsx           ← editor markdown para páginas wiki
  ShareLinkModal.tsx            ← geração e gestão de link público
  DocsIcon.tsx                  ← SVGs inline (padrão switch/case do FinanceSidebar)
```

### Fluxo de dados

`InternalDocsPage` carrega tudo no mount:
- dados existentes: `internalDocuments`, `internalDocumentFolders`, `companies`, `modules`
- dados novos: `docPages`, `shareLinks`

Estado selecionado (`selectedPath`, `selectedItem`) desce via props para os componentes filhos. Callbacks de mutação (`onCreatePage`, `onDeletePage`, `onGenerateLink`) sobem de volta ao shell.

---

## Seção 1 — Navegação e Sidebar (`DocsSidebar`)

### 4 seções fixas

| Seção | Ícone | Conteúdo | Pastas | Páginas | Arquivos |
|---|---|---|---|---|---|
| **Clientes** | building | Auto por cliente | ✓ auto | ✓ | ✓ |
| **Processos Internos** | gear | SOPs, manuais, procedimentos | ✓ manual | ✓ | ✓ |
| **Templates** | layout | Contratos, checklists, apresentações | ✓ manual | ✓ | ✓ |
| **Base de Conhecimento** | book | Guias técnicos, FAQs, política | ✓ manual | ✓ | ✓ |

### Comportamento

- Clientes expandem para subpastas já existentes: `Documentos` / `Módulos` / `Certificados` / `Pesquisa de satisfação` — lógica de árvore preservada sem alteração
- Cada cabeçalho de seção tem botão `+` que cria subpasta ou página diretamente naquele nível
- Item selecionado: barra vermelha `#ef2f0f` à esquerda (2.5px) + fundo `#fde8e4` — mesmo padrão visual do `nav-item.active` do app
- Busca no topo da sidebar filtra simultaneamente nas 4 seções (arquivos + pastas + páginas)
- Indicador de chevron (`›`) em itens com filhos, rotaciona 90° quando expandido

---

## Seção 2 — Área Principal (`DocsMainArea`)

### Breadcrumb

Pills clicáveis. A pill atual (última) usa fundo `#fde8e4` + texto `#b91c1c` e não é clicável. As anteriores são neutras e navegam ao clicar.

### Toolbar

```
[Título da pasta]  [contador: "3 pastas · 2 páginas · 4 arquivos"]  [badge de seção]  ·····  [Grade] [Ordenar] [+ Novo]
```

- `+ Novo`: dropdown com "Nova subpasta", "Nova página", "Enviar arquivo"
- `Grade / Lista`: toggle de visualização (persiste no localStorage)
- Badge de seção (ex: "Cliente", "Processo") com fundo `#1d2830` e texto branco

### Grade de itens

`auto-fill, minmax(180px, 1fr)`, gap 10px. Três tipos de card coexistem na mesma grade.

#### FolderCard

Barra superior (2.5px) colorida por seção:
- Clientes → navy `#1d2830 → #2d4a5e`
- Processos → cinza `#5a646e → #8a9aaa`
- Templates → verde `#21744d → #38b27a`
- Base de Conhecimento → âmbar `#9a5f0a → #f59e0b`
- Certificados → vermelho→âmbar `#ef2f0f → #f59e0b`

Conteúdo: ícone SVG da pasta (variante por tipo) + nome + pills de contagem ("3 subpastas", "4 docs"). Hover: `translateY(-1px)` + sombra suave.

#### WikiPageCard

Fundo `linear-gradient(180deg, #fffef8 0%, #fff 100%)`. Barra âmbar. Badge "Página" em âmbar. Título, trecho (2 linhas com `line-clamp`), data de atualização. Se tiver link público ativo: badge "Compartilhado" verde no rodapé. Clique abre `PageEditorModal`.

#### FileCard

Ícone por tipo (`PDF` vermelho, `IMG` verde, `CERT` âmbar). Nome do arquivo, tamanho, data. Ações inline: Visualizar · Download · Compartilhar. "Compartilhar" abre `ShareLinkModal` para esse arquivo.

---

## Seção 3 — Painel de Detalhes (`DocsDetailPanel`)

Sempre visível à direita. Conteúdo muda conforme o item selecionado na sidebar.

**Quando uma pasta está selecionada:**
- Header com ícone SVG e nome da pasta
- Bloco de stats: subpastas / páginas / arquivos / certificados (grid 2×2)
- Última atualização + autor
- Ações: "Nova página" (vermelho), "Nova subpasta" (neutro), "Gerar link público" (verde)
- Zona de drag-and-drop para upload (borda dashed, hover ativa borda vermelha)

**Quando uma página ou arquivo está selecionado:**
- Preview do título e metadados
- Ações específicas do item (editar, baixar, compartilhar, excluir)
- Link público ativo (se existir): URL copiável

---

## Seção 4 — Editor de Páginas (`PageEditorModal`)

Modal de tela inteira (mesmo padrão do `internal-doc-preview-modal` existente: backdrop blur, `border-radius: 18px`, sombra profunda).

**Modo criação/edição:**
- Campo título (destaque, `font-size: 1.4rem`, `font-weight: 800`)
- Área de texto Markdown (`<textarea>` com fonte monospace `DM Mono` — já importada no projeto)
- Campo tags (opcional, chips removíveis)
- Rodapé: "Salvar rascunho" (neutro) · "Publicar" (vermelho) · "Cancelar"

**Modo leitura:**
- Renderização do Markdown como HTML (biblioteca leve — `marked` ou similar, a definir na implementação)
- Botão "Editar" no header
- Badge de status: "Rascunho" (âmbar) ou "Publicado" (verde)

---

## Seção 5 — Compartilhamento (`ShareLinkModal`)

Modal menor, centralizado.

**Conteúdo:**
- Toggle "Compartilhar externamente" (desligado por padrão)
- Quando ligado: exibe URL pública gerada — ex: `orquestrador.yrdnegocios.com.br/p/{token}`
- Botão "Copiar link" com feedback visual (texto muda para "Copiado!" por 2s)
- Toggle "Permitir download" (on/off)
- Validade: "Sem expiração" ou "30 dias"
- Botão "Revogar link" (vermelho, confirma antes de agir)

**Rota pública `/p/:token`:**
- Sem autenticação
- Retorna apenas os dados do item (título, conteúdo ou arquivo)
- Se `allow_download=false`: não exibe botão de download
- Se expirado ou revogado: página de erro amigável

---

## Seção 6 — Backend

### Tabelas novas

**`doc_pages`**
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
folder_path   TEXT NOT NULL
title         TEXT NOT NULL
content       TEXT NOT NULL DEFAULT ''
tags          TEXT[] DEFAULT '{}'
is_draft      BOOLEAN DEFAULT TRUE
created_by    TEXT
created_at    TIMESTAMPTZ DEFAULT now()
updated_at    TIMESTAMPTZ DEFAULT now()
```

**`doc_share_links`**
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
resource_type   TEXT NOT NULL  -- 'document' | 'page'
resource_id     UUID NOT NULL
token           UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE
allow_download  BOOLEAN DEFAULT TRUE
expires_at      TIMESTAMPTZ    -- NULL = sem expiração
created_by      TEXT
created_at      TIMESTAMPTZ DEFAULT now()
```

### Rotas novas

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/internal/doc-pages` | Listar todas as páginas |
| POST | `/api/internal/doc-pages` | Criar página |
| GET | `/api/internal/doc-pages/:id` | Ler página |
| PATCH | `/api/internal/doc-pages/:id` | Editar página |
| DELETE | `/api/internal/doc-pages/:id` | Excluir página |
| POST | `/api/internal/share-links` | Gerar link público |
| DELETE | `/api/internal/share-links/:id` | Revogar link |
| GET | `/p/:token` | Acesso público (sem auth) |

As rotas `/api/internal/*` seguem o mesmo middleware de autenticação interna já usado pelas rotas existentes. A rota `/p/:token` é pública e retorna apenas o necessário para renderizar o item.

---

## CSS

Novas classes adicionadas ao `styles.css` existente — sem remover nada que já existe. Prefixo `.docs-` mantido para consistência. As classes atuais (`.docs-explorer`, `.docs-sidebar`, `.docs-main`, etc.) são substituídas pelas novas versões — o HTML gerado pelos novos componentes usa as classes redesenhadas.

---

## O que não muda

- Lógica de construção da árvore de pastas (`folderDisplayName`, `ensureNode`, `findNode`, `fileFolderPath`) — extraída para `src/components/docs/treeUtils.ts`
- Lógica de download e preview de arquivos (mesma implementação, movida para `FileCard`)
- Tabelas `internal_documents` e `internal_document_folders` — sem alteração de schema
- Modal de preview de PDF/imagem (`internal-doc-preview-*`) — mantido, reutilizado pelo `FileCard` para Visualizar
- `PageEditorModal` é exclusivo para páginas wiki (conteúdo escrito) — não substitui o preview de arquivos
- Rotas de API existentes para documentos e pastas — sem alteração

---

## Estimativa de esforço

~5 dias de desenvolvimento:
- Dia 1: componentes visuais (cards, sidebar, ícones SVG, CSS)
- Dia 2: `DocsMainArea`, `DocsDetailPanel`, refactor do shell
- Dia 3: `PageEditorModal` (editor Markdown)
- Dia 4: `ShareLinkModal` + backend (`doc_share_links`, rota `/p/:token`)
- Dia 5: `doc_pages` backend + integração frontend + testes
