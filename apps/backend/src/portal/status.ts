type ClientFacingStatus = 'Recebido' | 'Em análise' | 'Em execução' | 'Aguardando cliente' | 'Resolvido';
type WorkflowStage = 'Backlog' | 'A fazer' | 'Em andamento' | 'Concluído' | 'Sem etapa';

type InternalStatusInput = {
  ticketStatus: string;
  columnTitle?: string | null;
};

export function toWorkflowStage(internal: InternalStatusInput): WorkflowStage {
  const normalizedStatus = (internal.ticketStatus ?? '').toLowerCase();
  if (normalizedStatus.includes('resolvido') || normalizedStatus.includes('fechado') || normalizedStatus.includes('done')) {
    return 'Concluído';
  }

  const normalizedColumn = (internal.columnTitle ?? '').toLowerCase();
  if (normalizedColumn.includes('backlog')) {
    return 'Backlog';
  }
  if (normalizedColumn.includes('a fazer') || normalizedColumn.includes('todo') || normalizedColumn.includes('to do')) {
    return 'A fazer';
  }
  if (normalizedColumn.includes('andamento') || normalizedColumn.includes('doing') || normalizedColumn.includes('execuç') || normalizedColumn.includes('execuc')) {
    return 'Em andamento';
  }
  if (normalizedColumn.includes('conclu')) {
    return 'Concluído';
  }
  return 'Sem etapa';
}

export function toClientFacingStatus(internal: InternalStatusInput): ClientFacingStatus {
  if (internal.ticketStatus === 'Resolvido' || internal.ticketStatus === 'Fechado') {
    return 'Resolvido';
  }

  const workflowStage = toWorkflowStage(internal);
  if (workflowStage === 'Em andamento') return 'Em execução';
  if (workflowStage === 'Concluído') return 'Resolvido';
  if (workflowStage === 'A fazer') return 'Em análise';
  if (workflowStage === 'Backlog') return 'Recebido';

  const normalizedColumn = (internal.columnTitle ?? '').toLowerCase();
  if (normalizedColumn.includes('andamento')) {
    return 'Em execução';
  }
  if (normalizedColumn.includes('anál') || normalizedColumn.includes('anal')) {
    return 'Em análise';
  }
  if (normalizedColumn.includes('aguard')) {
    return 'Aguardando cliente';
  }

  return 'Recebido';
}
