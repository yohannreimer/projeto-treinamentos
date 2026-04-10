type ClientFacingStatus = 'Recebido' | 'Em análise' | 'Em execução' | 'Aguardando cliente' | 'Resolvido';

type InternalStatusInput = {
  ticketStatus: string;
  columnTitle?: string | null;
};

export function toClientFacingStatus(internal: InternalStatusInput): ClientFacingStatus {
  if (internal.ticketStatus === 'Resolvido' || internal.ticketStatus === 'Fechado') {
    return 'Resolvido';
  }

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
