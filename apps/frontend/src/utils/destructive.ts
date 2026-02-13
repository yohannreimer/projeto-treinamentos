export const DESTRUCTIVE_CONFIRMATION_PHRASE = 'APAGAR_BASE_TOTAL';

export function askDestructiveConfirmation(actionName: string): string | null {
  const typed = window.prompt(
    `Ação destrutiva: ${actionName}.\nDigite exatamente ${DESTRUCTIVE_CONFIRMATION_PHRASE} para confirmar.`
  );

  if (typed === null) {
    return null;
  }

  if (typed.trim() !== DESTRUCTIVE_CONFIRMATION_PHRASE) {
    window.alert(`Confirmação inválida. Digite exatamente ${DESTRUCTIVE_CONFIRMATION_PHRASE}.`);
    return null;
  }

  return typed.trim();
}
