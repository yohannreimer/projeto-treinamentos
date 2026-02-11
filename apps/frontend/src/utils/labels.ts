export function statusLabel(value: string): string {
  const labels: Record<string, string> = {
    Planejada: 'Planejada',
    Aguardando_quorum: 'Aguardando quórum',
    Confirmada: 'Confirmada',
    Concluida: 'Concluída',
    Cancelada: 'Cancelada',
    Previsto: 'Previsto',
    Confirmado: 'Confirmado',
    Executado: 'Executado',
    Cancelado: 'Cancelado',
    Nao_iniciado: 'Não iniciado',
    Planejado: 'Planejado',
    Em_execucao: 'Em execução',
    Concluido: 'Concluído',
    Ativo: 'Ativo',
    Inativo: 'Inativo'
  };
  return labels[value] ?? value.replace(/_/g, ' ');
}
