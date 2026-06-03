import { useMemo, useState } from 'react';
import { DocsIcon } from './DocsIcon';
import {
  CLIENTS_PATH,
  INTERNAL_PATH,
  decodePathSegment,
  findNode,
  type FolderNode
} from './treeUtils';

// ────────────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────────────

type Section = {
  key: string;
  label: string;
  icon: 'building' | 'gear' | 'layout' | 'book';
  rootPath: string;
};

const SECTIONS: Section[] = [
  { key: 'clients', label: 'Clientes', icon: 'building', rootPath: CLIENTS_PATH },
  { key: 'processes', label: 'Processos Internos', icon: 'gear', rootPath: '/Processos' },
  { key: 'templates', label: 'Templates', icon: 'layout', rootPath: '/Templates' },
  { key: 'knowledge', label: 'Base de Conhecimento', icon: 'book', rootPath: '/Base' }
];

type DocsSidebarProps = {
  tree: FolderNode;
  selectedPath: string;
  onSelect: (path: string) => void;
  onCreateFolder?: (parentPath: string) => void;
};

// ────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ────────────────────────────────────────────────────────────────────────────

function TreeItem({
  node,
  selectedPath,
  onSelect,
  depth,
  query
}: {
  node: FolderNode;
  selectedPath: string;
  onSelect: (path: string) => void;
  depth: number;
  query: string;
}) {
  const hasChildren = node.children.length > 0;
  const isSelected = node.path === selectedPath;
  const [expanded, setExpanded] = useState(
    isSelected || selectedPath.startsWith(node.path + '/')
  );

  // Quando o path selecionado muda para dentro deste nó, expandir
  const shouldExpand = selectedPath.startsWith(node.path + '/') || isSelected;

  const displayExpanded = expanded || (shouldExpand && hasChildren);

  function handleClick() {
    onSelect(node.path);
    if (hasChildren) setExpanded((prev) => !prev);
  }

  // Filtragem por query: mostrar se nome bate ou se algum filho bate
  if (query) {
    const selfMatches = node.name.toLowerCase().includes(query.toLowerCase());
    const anyChildMatches = node.children.some(
      (child) => child.name.toLowerCase().includes(query.toLowerCase())
    );
    if (!selfMatches && !anyChildMatches) return null;
  }

  return (
    <>
      <button
        type="button"
        className={`dv2-tree-item${isSelected ? ' is-active' : ''}`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        onClick={handleClick}
      >
        {hasChildren && (
          <span className={`dv2-tree-item__chevron${displayExpanded ? ' is-open' : ''}`}>
            <DocsIcon name="chevron-right" size={12} />
          </span>
        )}
        {!hasChildren && <span style={{ width: 12, flexShrink: 0 }} />}
        <span className="dv2-tree-item__label">{node.name}</span>
      </button>

      {displayExpanded && node.children.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          selectedPath={selectedPath}
          onSelect={onSelect}
          depth={depth + 1}
          query={query}
        />
      ))}
    </>
  );
}

function SectionBlock({
  section,
  tree,
  selectedPath,
  onSelect,
  onCreateFolder,
  query
}: {
  section: Section;
  tree: FolderNode;
  selectedPath: string;
  onSelect: (path: string) => void;
  onCreateFolder?: (parentPath: string) => void;
  query: string;
}) {
  const sectionNode = useMemo(() => findNode(tree, section.rootPath), [tree, section.rootPath]);
  const isSelected = selectedPath === section.rootPath || selectedPath.startsWith(section.rootPath + '/');
  const [open, setOpen] = useState(isSelected);

  function handleSectionClick() {
    setOpen((prev) => !prev);
    if (sectionNode) onSelect(section.rootPath);
  }

  // Fallback quando a seção ainda não existe na árvore (ex: Templates, Base)
  const children = sectionNode?.children ?? [];

  return (
    <div className="dv2-sidebar__section">
      <button
        type="button"
        className={`dv2-sidebar__section-head${open ? ' is-open' : ''}`}
        onClick={handleSectionClick}
      >
        <DocsIcon name={section.icon} size={14} />
        <span style={{ flex: 1 }}>{section.label}</span>
        {onCreateFolder && (
          <span
            className="dv2-section-plus"
            title={`Nova pasta em ${section.label}`}
            onClick={(e) => {
              e.stopPropagation();
              onCreateFolder(section.rootPath);
            }}
          >
            <DocsIcon name="plus" size={12} />
          </span>
        )}
        <span className="dv2-chevron">
          <DocsIcon name="chevron-right" size={12} />
        </span>
      </button>

      {open && children.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          selectedPath={selectedPath}
          onSelect={onSelect}
          depth={0}
          query={query}
        />
      ))}

      {open && children.length === 0 && !query && (
        <div style={{ padding: '8px 16px', color: '#a0b0be', fontSize: '0.76rem' }}>
          Sem pastas
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Componente principal
// ────────────────────────────────────────────────────────────────────────────

export function DocsSidebar({ tree, selectedPath, onSelect, onCreateFolder }: DocsSidebarProps) {
  const [query, setQuery] = useState('');

  return (
    <aside className="dv2-panel dv2-sidebar">
      {/* Busca */}
      <div className="dv2-sidebar__search">
        <DocsIcon name="search" size={14} />
        <input
          type="text"
          placeholder="Buscar pastas e páginas…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar na documentação"
        />
      </div>

      {/* Seções */}
      <div className="dv2-sidebar__tree">
        {SECTIONS.map((section) => (
          <SectionBlock
            key={section.key}
            section={section}
            tree={tree}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onCreateFolder={onCreateFolder}
            query={query}
          />
        ))}
      </div>
    </aside>
  );
}

// Exporta também para uso na legacy InternalDocsPage enquanto a migração acontece
export { CLIENTS_PATH, INTERNAL_PATH, decodePathSegment };
