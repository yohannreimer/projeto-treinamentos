import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { Section } from '../components/Section';
import { api } from '../services/api';
import { askDestructiveConfirmation } from '../utils/destructive';

type KanbanPriority = 'Alta' | 'Normal' | 'Baixa' | 'Critica';

const KANBAN_PRIORITY_OPTIONS: KanbanPriority[] = ['Alta', 'Normal', 'Baixa', 'Critica'];
const KANBAN_IMAGE_MAX_BYTES = 750_000;

type KanbanCard = {
  id: string;
  title: string;
  description: string | null;
  column_id: string | null;
  client_name: string | null;
  module_name: string | null;
  priority: KanbanPriority;
  due_date: string | null;
  attachment_image_data_url: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

type KanbanColumn = {
  id: string;
  title: string;
  color: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  cards: KanbanCard[];
};

type ColumnDraft = {
  isOpen: boolean;
  title: string;
  description: string;
};

const defaultColumnDraft: ColumnDraft = {
  isOpen: false,
  title: '',
  description: ''
};

type CardDetailDraft = {
  cardId: string;
  title: string;
  description: string;
  client_name: string;
  module_name: string;
  priority: KanbanPriority;
  due_date: string;
  attachment_image_data_url: string | null;
} | null;

type ClientOption = {
  id: string;
  name: string;
};

type ModuleOption = {
  id: string;
  name: string;
};

function cardDetailFromCard(card: KanbanCard): Exclude<CardDetailDraft, null> {
  return {
    cardId: card.id,
    title: card.title,
    description: card.description ?? '',
    client_name: card.client_name ?? '',
    module_name: card.module_name ?? '',
    priority: card.priority ?? 'Normal',
    due_date: card.due_date ?? '',
    attachment_image_data_url: card.attachment_image_data_url ?? null
  };
}

function formatDateBr(dateIso?: string | null): string {
  if (!dateIso) return '-';
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateIso;
  return date.toLocaleDateString('pt-BR');
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

export function ImplementationPage() {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [columnDrafts, setColumnDrafts] = useState<Record<string, ColumnDraft>>({});
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [newColumnColor, setNewColumnColor] = useState('#7b8ea8');
  const [isConfigCollapsed, setIsConfigCollapsed] = useState(true);

  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [moduleOptions, setModuleOptions] = useState<ModuleOption[]>([]);

  const [cardDetail, setCardDetail] = useState<CardDetailDraft>(null);
  const [isSavingCardDetail, setIsSavingCardDetail] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadBoard() {
    const response = await api.implementationKanban() as { columns: KanbanColumn[] };
    const loadedColumns = (response.columns ?? []).sort((a, b) => a.position - b.position);
    setColumns(loadedColumns);
    return loadedColumns;
  }

  async function loadOptions() {
    const [companies, modules] = await Promise.all([
      api.companies() as Promise<Array<{ id: string; name: string }>>,
      api.modules() as Promise<Array<{ id: string; name: string }>>
    ]);

    setClientOptions((companies ?? [])
      .map((company) => ({ id: company.id, name: company.name }))
      .sort((a, b) => a.name.localeCompare(b.name)));

    setModuleOptions((modules ?? [])
      .map((module) => ({ id: module.id, name: module.name }))
      .sort((a, b) => a.name.localeCompare(b.name)));
  }

  useEffect(() => {
    Promise.all([loadBoard(), loadOptions()]).catch((err: Error) => setError(err.message));
  }, []);

  function getDraft(columnId: string): ColumnDraft {
    return columnDrafts[columnId] ?? defaultColumnDraft;
  }

  function setDraft(columnId: string, patch: Partial<ColumnDraft>) {
    setColumnDrafts((prev) => ({
      ...prev,
      [columnId]: {
        ...getDraft(columnId),
        ...patch
      }
    }));
  }

  async function persistBoard(nextColumns: KanbanColumn[]) {
    await api.reorderImplementationKanban({
      columns: nextColumns.map((column) => ({
        column_id: column.id,
        card_ids: column.cards.map((card) => card.id)
      }))
    });
  }

  async function onDragEnd(result: DropResult) {
    const { destination, source, type } = result;
    if (!destination) return;

    if (type === 'COLUMN') {
      if (destination.index === source.index) return;

      const reordered = [...columns];
      const [movedColumn] = reordered.splice(source.index, 1);
      if (!movedColumn) return;
      reordered.splice(destination.index, 0, movedColumn);
      setColumns(reordered);
      try {
        await api.reorderImplementationKanbanColumns({ column_ids: reordered.map((column) => column.id) });
      } catch (err) {
        setError((err as Error).message);
        await loadBoard();
      }
      return;
    }

    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const sourceColumnIndex = columns.findIndex((column) => column.id === source.droppableId);
    const destinationColumnIndex = columns.findIndex((column) => column.id === destination.droppableId);
    if (sourceColumnIndex === -1 || destinationColumnIndex === -1) return;

    const sourceColumn = columns[sourceColumnIndex];
    const destinationColumn = columns[destinationColumnIndex];
    const sourceCards = [...sourceColumn.cards];
    const destinationCards = sourceColumn.id === destinationColumn.id ? sourceCards : [...destinationColumn.cards];
    const [movedCard] = sourceCards.splice(source.index, 1);
    if (!movedCard) return;

    const movedCardNext: KanbanCard = {
      ...movedCard,
      column_id: destinationColumn.id
    };
    destinationCards.splice(destination.index, 0, movedCardNext);

    const nextColumns = columns.map((column) => {
      if (column.id === sourceColumn.id && column.id === destinationColumn.id) {
        return { ...column, cards: destinationCards };
      }
      if (column.id === sourceColumn.id) {
        return { ...column, cards: sourceCards };
      }
      if (column.id === destinationColumn.id) {
        return { ...column, cards: destinationCards };
      }
      return column;
    });

    setColumns(nextColumns);
    setError('');
    setMessage('');
    try {
      await persistBoard(nextColumns);
      if (sourceColumn.id !== destinationColumn.id) {
        await api.updateImplementationKanbanCard(movedCard.id, { column_id: destinationColumn.id });
      }
    } catch (err) {
      setError((err as Error).message);
      await loadBoard();
    }
  }

  async function createColumn() {
    if (!newColumnTitle.trim()) {
      setError('Informe o nome da coluna.');
      return;
    }

    setError('');
    setMessage('');
    try {
      await api.createImplementationKanbanColumn({
        title: newColumnTitle.trim(),
        color: newColumnColor
      });
      setNewColumnTitle('');
      setNewColumnColor('#7b8ea8');
      setMessage('Coluna criada.');
      await loadBoard();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function editColumn(column: KanbanColumn) {
    const nextTitle = window.prompt('Nome da coluna:', column.title);
    if (!nextTitle?.trim()) return;
    const nextColor = window.prompt('Cor da coluna (hex):', column.color ?? '#7b8ea8');
    if (!nextColor?.trim()) return;

    setError('');
    setMessage('');
    try {
      await api.updateImplementationKanbanColumn(column.id, {
        title: nextTitle.trim(),
        color: nextColor.trim()
      });
      setMessage('Coluna atualizada.');
      await loadBoard();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteColumn(column: KanbanColumn) {
    const confirmationPhrase = askDestructiveConfirmation(`Excluir coluna "${column.title}"`);
    if (!confirmationPhrase) return;

    setError('');
    setMessage('');
    try {
      await api.deleteImplementationKanbanColumn(column.id, confirmationPhrase);
      setMessage('Coluna excluída.');
      await loadBoard();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function createCardInColumn(columnId: string) {
    const draft = getDraft(columnId);
    if (!draft.title.trim()) {
      setError('Informe o título do cartão.');
      return;
    }

    setError('');
    setMessage('');
    try {
      const created = await api.createImplementationKanbanCard({
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        column_id: columnId
      }) as { id: string };
      setDraft(columnId, {
        isOpen: false,
        title: '',
        description: ''
      });
      const nextColumns = await loadBoard();
      const createdCard = nextColumns.flatMap((column) => column.cards).find((card) => card.id === created.id);
      if (createdCard) {
        setCardDetail(cardDetailFromCard(createdCard));
        setMessage('Cartão criado. Complete os detalhes no painel lateral.');
      } else {
        setMessage('Cartão criado.');
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function editCard(card: KanbanCard) {
    setCardDetail(cardDetailFromCard(card));
  }

  async function deleteCard(card: KanbanCard) {
    const confirmationPhrase = askDestructiveConfirmation(`Excluir card "${card.title}"`);
    if (!confirmationPhrase) return;

    setError('');
    setMessage('');
    try {
      await api.deleteImplementationKanbanCard(card.id, confirmationPhrase);
      setMessage('Card excluído.');
      await loadBoard();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveCardDetail() {
    if (!cardDetail) return;
    if (!cardDetail.title.trim()) {
      setError('Título da nota é obrigatório.');
      return;
    }

    setIsSavingCardDetail(true);
    setError('');
    setMessage('');
    try {
      await api.updateImplementationKanbanCard(cardDetail.cardId, {
        title: cardDetail.title.trim(),
        description: cardDetail.description.trim() || null,
        client_name: cardDetail.client_name.trim() || null,
        module_name: cardDetail.module_name.trim() || null,
        priority: cardDetail.priority,
        due_date: cardDetail.due_date || null,
        attachment_image_data_url: cardDetail.attachment_image_data_url ?? null
      });
      setMessage('Cartão atualizado.');
      setCardDetail(null);
      await loadBoard();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSavingCardDetail(false);
    }
  }

  async function onPickDetailImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !cardDetail) return;

    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem válido.');
      return;
    }

    if (file.size > KANBAN_IMAGE_MAX_BYTES) {
      setError('A imagem é grande demais. Use até 750 KB.');
      return;
    }

    try {
      const dataUrl = await toDataUrl(file);
      setCardDetail((prev) => (prev ? { ...prev, attachment_image_data_url: dataUrl } : prev));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const totalCards = useMemo(
    () => columns.reduce((acc, column) => acc + column.cards.length, 0),
    [columns]
  );

  return (
    <div className="page implementation-page">
      <header className="page-header">
        <h1>Implementação</h1>
        <p>Kanban customizável para organizar melhorias, bugs e entregas.</p>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="info">{message}</p> : null}

      <Section
        title="Adicionar coluna"
        className="kanban-config-panel"
        action={(
          <button
            type="button"
            className="kanban-collapse-config-btn"
            onClick={() => setIsConfigCollapsed((prev) => !prev)}
          >
            {isConfigCollapsed ? 'Expandir' : 'Minimizar'}
          </button>
        )}
      >
        <div className="form kanban-config-form">
          <p className="form-hint">Board: {columns.length} coluna(s) • {totalCards} nota(s)</p>
          {isConfigCollapsed ? null : (
            <>
              <div className="kanban-config-grid">
                <label>
                  Nome da coluna
                  <input
                    value={newColumnTitle}
                    onChange={(event) => setNewColumnTitle(event.target.value)}
                    placeholder="Ex.: Bloqueios"
                  />
                </label>
                <label>
                  Cor
                  <input
                    type="color"
                    value={newColumnColor}
                    onChange={(event) => setNewColumnColor(event.target.value)}
                  />
                </label>
              </div>
              <div className="actions actions-compact">
                <button type="button" onClick={createColumn}>Adicionar coluna</button>
              </div>
            </>
          )}
        </div>
      </Section>

      <datalist id="kanban-client-options">
        {clientOptions.map((company) => (
          <option key={company.id} value={company.name} />
        ))}
      </datalist>
      <datalist id="kanban-module-options">
        {moduleOptions.map((module) => (
          <option key={module.id} value={module.name} />
        ))}
      </datalist>

      <section className="kanban-workspace-shell">
        <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="kanban-columns" direction="horizontal" type="COLUMN">
          {(boardProvided) => (
            <div ref={boardProvided.innerRef} {...boardProvided.droppableProps} className="kanban-board">
              {columns.map((column, columnIndex) => {
                const draft = getDraft(column.id);
                return (
                  <Draggable key={column.id} draggableId={`column-${column.id}`} index={columnIndex}>
                    {(columnProvided, columnSnapshot) => (
                      <section
                        ref={columnProvided.innerRef}
                        {...columnProvided.draggableProps}
                        className={`kanban-column ${columnSnapshot.isDragging ? 'is-column-dragging' : ''}`}
                      >
                        <header className="kanban-column-header" {...columnProvided.dragHandleProps}>
                          <h2>
                            <span className="kanban-column-dot" style={{ backgroundColor: column.color ?? '#7b8ea8' }} />
                            {column.title}
                          </h2>
                          <div className="kanban-column-header-right">
                            <span className="chip">{column.cards.length}</span>
                            <div className="kanban-icon-actions">
                              <button type="button" className="kanban-icon-btn" onClick={() => editColumn(column)} title="Editar coluna">✎</button>
                            </div>
                          </div>
                        </header>

                        {draft.isOpen ? (
                          <div className="kanban-inline-form">
                            <div className="kanban-inline-form-header">
                              <strong>Novo cartão</strong>
                              <span>Criação rápida. Os detalhes completos são no painel lateral.</span>
                            </div>
                            <label>
                              Título
                              <input
                                value={draft.title}
                                onChange={(event) => setDraft(column.id, { title: event.target.value })}
                                placeholder="Título do cartão"
                              />
                            </label>
                            <label>
                              Descrição
                              <textarea
                                rows={2}
                                value={draft.description}
                                onChange={(event) => setDraft(column.id, { description: event.target.value })}
                                placeholder="Resumo do que precisa ser feito"
                              />
                            </label>
                            <div className="actions actions-compact">
                              <button type="button" onClick={() => createCardInColumn(column.id)}>Criar e abrir detalhes</button>
                              <button type="button" onClick={() => setDraft(column.id, { isOpen: false })}>Cancelar</button>
                            </div>
                          </div>
                        ) : null}

                        <Droppable droppableId={column.id} type="CARD">
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              className={`kanban-card-list ${snapshot.isDraggingOver ? 'is-drag-over' : ''}`}
                            >
                              {column.cards.length === 0 ? (
                                <div className="kanban-empty-state">
                                  Arraste cartões para cá ou crie um novo.
                                </div>
                              ) : null}
                              {column.cards.map((card, index) => (
                                <Draggable key={card.id} draggableId={card.id} index={index}>
                                  {(dragProvided, dragSnapshot) => (
                                    <article
                                      ref={dragProvided.innerRef}
                                      {...dragProvided.draggableProps}
                                      {...dragProvided.dragHandleProps}
                                      className={`kanban-card ${dragSnapshot.isDragging ? 'is-dragging' : ''}`}
                                    >
                                      <strong>{card.title}</strong>
                                      {card.description ? <p>{card.description}</p> : null}
                                      <div className="kanban-card-meta">
                                        {card.client_name ? <span className="kanban-meta-pill">Cliente: {card.client_name}</span> : null}
                                        {card.module_name ? <span className="kanban-meta-pill">Módulo: {card.module_name}</span> : null}
                                        <span className={`chip chip-${(card.priority ?? 'Normal').toLowerCase()}`}>{card.priority ?? 'Normal'}</span>
                                        {card.due_date ? <span className="kanban-meta-pill">Entrega: {formatDateBr(card.due_date)}</span> : null}
                                      </div>
                                      {card.attachment_image_data_url ? (
                                        <img className="kanban-card-thumb" src={card.attachment_image_data_url} alt={`Anexo do card ${card.title}`} />
                                      ) : null}
                                      <div className="actions actions-compact">
                                        <button type="button" className="kanban-card-secondary-btn" onClick={() => editCard(card)}>Abrir</button>
                                        <button type="button" className="kanban-card-danger-btn" onClick={() => deleteCard(card)}>Excluir</button>
                                      </div>
                                    </article>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>

                        <footer className="kanban-column-footer">
                          <button type="button" className="kanban-create-note-btn" onClick={() => setDraft(column.id, { isOpen: !draft.isOpen })}>
                            {draft.isOpen ? 'Fechar criação' : '+ Adicionar cartão'}
                          </button>
                          <button type="button" className="kanban-delete-column-btn" onClick={() => deleteColumn(column)}>Excluir coluna</button>
                        </footer>
                      </section>
                    )}
                  </Draggable>
                );
              })}
              {boardProvided.placeholder}
            </div>
          )}
        </Droppable>
        </DragDropContext>
      </section>

      {cardDetail ? (
        <div className="kanban-detail-overlay" role="dialog" aria-modal="true">
          <button type="button" className="kanban-detail-backdrop" onClick={() => setCardDetail(null)} aria-label="Fechar detalhe do cartão" />
          <aside className="kanban-detail-panel">
            <header className="kanban-detail-header">
              <h2>Detalhe do cartão</h2>
              <button type="button" className="kanban-icon-btn" onClick={() => setCardDetail(null)} aria-label="Fechar">✕</button>
            </header>
            <div className="form form-spacious">
              <label>
                Título
                <input
                  value={cardDetail.title}
                  onChange={(event) => setCardDetail((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
                />
              </label>
              <label>
                Descrição
                <textarea
                  rows={6}
                  value={cardDetail.description}
                  onChange={(event) => setCardDetail((prev) => (prev ? { ...prev, description: event.target.value } : prev))}
                />
              </label>

              <div className="kanban-detail-grid">
                <label>
                  Cliente
                  <input
                    value={cardDetail.client_name}
                    onChange={(event) => setCardDetail((prev) => (prev ? { ...prev, client_name: event.target.value } : prev))}
                    list="kanban-client-options"
                  />
                </label>
                <label>
                  Módulo
                  <input
                    value={cardDetail.module_name}
                    onChange={(event) => setCardDetail((prev) => (prev ? { ...prev, module_name: event.target.value } : prev))}
                    list="kanban-module-options"
                  />
                </label>
                <label>
                  Prioridade
                  <select
                    value={cardDetail.priority}
                    onChange={(event) => setCardDetail((prev) => (prev ? { ...prev, priority: event.target.value as KanbanPriority } : prev))}
                  >
                    {KANBAN_PRIORITY_OPTIONS.map((priority) => (
                      <option key={priority} value={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Data de entrega
                  <input
                    type="date"
                    value={cardDetail.due_date}
                    onChange={(event) => setCardDetail((prev) => (prev ? { ...prev, due_date: event.target.value } : prev))}
                  />
                </label>
              </div>

              <div className="kanban-detail-attachment">
                <label className="kanban-inline-attachment-label">
                  <span>Anexo de imagem</span>
                  <input type="file" accept="image/*" onChange={onPickDetailImage} />
                </label>
                {cardDetail.attachment_image_data_url ? (
                  <div className="kanban-attachment-preview">
                    <img src={cardDetail.attachment_image_data_url} alt="Anexo atual" />
                    <button
                      type="button"
                      onClick={() => setCardDetail((prev) => (prev ? { ...prev, attachment_image_data_url: null } : prev))}
                    >
                      Remover imagem
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="actions actions-compact">
                <button type="button" onClick={saveCardDetail} disabled={isSavingCardDetail}>
                  {isSavingCardDetail ? 'Salvando...' : 'Salvar alterações'}
                </button>
                <button type="button" onClick={() => setCardDetail(null)}>Fechar</button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
