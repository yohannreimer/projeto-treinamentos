import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import {
  financeApi,
  type FinanceAssistantAnswerBreakdownItem,
  type FinanceAssistantExecutionResult,
  type FinanceAssistantPlan
} from '../api';
import { useFinanceSpeechRecognition } from '../hooks/useFinanceSpeechRecognition';
import {
  FINANCE_QUICK_LAUNCH_CREATED_EVENT,
  FINANCE_QUICK_LAUNCH_OPEN_EVENT,
  FINANCE_WHISPER_FLOW_OPEN_EVENT
} from './financeFloatingEvents';

type WhisperPhase = 'listening' | 'preview' | 'done';
type AnalystRowStatus = 'idle' | 'settling' | 'settled' | 'undoing';
type ConversationItem = { role: 'user' | 'assistant'; content: string };
type ThreadMessage =
  | { id: string; role: 'user'; content: string }
  | { id: string; role: 'assistant'; plan: FinanceAssistantPlan; content: string }
  | { id: string; role: 'execution'; execution: FinanceAssistantExecutionResult; content: string };

function friendlyError(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Não consegui processar esse comando agora. Revise o texto e tente novamente.';
}

function createdDetailFromExecution(execution: FinanceAssistantExecutionResult) {
  const created = execution.results.find((result) => result.resource_type === 'payable' || result.resource_type === 'receivable');
  if (!created || !created.resource_id) {
    return null;
  }
  const payload = created.payload && typeof created.payload === 'object' ? created.payload as Record<string, unknown> : {};
  const resource = (created.resource_type === 'payable' ? payload.payable : payload.receivable) as Record<string, unknown> | undefined;
  return {
    type: created.resource_type,
    id: created.resource_id,
    description: typeof resource?.description === 'string' ? resource.description : null,
    amount_cents: typeof resource?.amount_cents === 'number' ? resource.amount_cents : null,
    due_date: typeof resource?.due_date === 'string' ? resource.due_date : null
  };
}

function formatAssistantCurrency(amountCents: number | null | undefined) {
  if (typeof amountCents !== 'number') return null;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(amountCents / 100);
}

function formatAssistantDate(dateIso: string | null | undefined) {
  if (!dateIso) return null;
  const [year, month, day] = dateIso.split('-');
  if (!year || !month || !day) return dateIso;
  return `${day}/${month}/${year}`;
}

function assistantConversationMemoryFromPlan(plan: FinanceAssistantPlan) {
  const parts = [
    plan.answer?.title,
    plan.answer?.summary ?? plan.human_summary
  ];

  if (plan.answer?.primary_metric) {
    const metricValue = formatAssistantCurrency(plan.answer.primary_metric.amount_cents)
      ?? plan.answer.primary_metric.count
      ?? null;
    parts.push(`Métrica: ${[
      plan.answer.primary_metric.label,
      metricValue
    ].filter(Boolean).join(' ')}`);
  }

  if (plan.answer?.breakdown?.length) {
    parts.push(`Composição e sugestões: ${plan.answer.breakdown.slice(0, 10).map((item) => [
      item.title,
      item.resource_type,
      item.status,
      formatAssistantCurrency(item.amount_cents),
      item.due_date ? formatAssistantDate(item.due_date) : null,
      item.meta?.length ? item.meta.join('/') : null
    ].filter(Boolean).join(' · ')).join('; ')}`);
  }

  if (plan.answer?.insights?.length) {
    parts.push(`Insights: ${plan.answer.insights.slice(0, 5).join(' | ')}`);
  }

  if (plan.answer?.suggested_actions?.length) {
    parts.push(`Botões sugeridos: ${plan.answer.suggested_actions.slice(0, 6).join('; ')}`);
  }

  if (plan.actions?.length) {
    parts.push(`Ações prontas: ${plan.actions.slice(0, 8).map((action) =>
      `${action.id}:${action.intent}:${action.human_summary}`
    ).join('; ')}`);
  }

  return parts.filter(Boolean).join('\n').slice(0, 1400);
}

function conversationContextFromThread(messages: ThreadMessage[]): ConversationItem[] {
  return messages
    .flatMap((message): ConversationItem[] => {
      if (message.role === 'user') {
        return [{ role: 'user', content: message.content }];
      }
      if (message.role === 'assistant') {
        return [{ role: 'assistant', content: message.content }];
      }
      return [{ role: 'assistant', content: message.content }];
    })
    .slice(-10);
}

export function FinanceWhisperFlow() {
  const location = useLocation();
  const commandId = useId();
  const autoInterpretTimerRef = useRef<number | null>(null);
  const threadCounterRef = useRef(0);
  const {
    supported,
    listening,
    paused,
    processing,
    transcript,
    error: speechError,
    start,
    stop,
    pause,
    resume,
    reset,
    setTranscript
  } = useFinanceSpeechRecognition();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<WhisperPhase>('listening');
  const [plan, setPlan] = useState<FinanceAssistantPlan | null>(null);
  const [execution, setExecution] = useState<FinanceAssistantExecutionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [voiceAutoSubmitArmed, setVoiceAutoSubmitArmed] = useState(false);
  const [analystRowStatus, setAnalystRowStatus] = useState<Record<string, AnalystRowStatus>>({});
  const [conversationInput, setConversationInput] = useState('');
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [actionStatus, setActionStatus] = useState<Record<string, 'idle' | 'executing' | 'done'>>({});

  const nextThreadId = useCallback((prefix: string) => {
    threadCounterRef.current += 1;
    return `${prefix}-${threadCounterRef.current}`;
  }, []);

  const interpretTranscript = useCallback(async (nextTranscript: string) => {
    const trimmedTranscript = nextTranscript.trim();
    if (!trimmedTranscript) {
      setError('Digite ou dite um comando financeiro antes de interpretar.');
      return;
    }

    setLoading(true);
    setError('');
    setExecution(null);
    const contextSnapshot = conversationContextFromThread(threadMessages);
    const userMessage: ThreadMessage = {
      id: nextThreadId('user'),
      role: 'user',
      content: trimmedTranscript
    };
    setThreadMessages((current) => [...current, userMessage]);

    try {
      if (listening) {
        stop();
      }
      const nextPlan = await financeApi.interpretAssistantCommand({
        transcript: trimmedTranscript,
        surface_path: location.pathname,
        conversation_context: contextSnapshot
      });
      setPlan(nextPlan);
      setPhase('preview');
      setTranscript('');
      setConversationInput('');
      const assistantMessage: ThreadMessage = {
        id: nextThreadId('assistant'),
        role: 'assistant',
        plan: nextPlan,
        content: assistantConversationMemoryFromPlan(nextPlan)
      };
      setThreadMessages((current) => [
        ...current,
        assistantMessage
      ].slice(-14));
    } catch (interpretError) {
      setError(friendlyError(interpretError));
      setThreadMessages((current) => current.filter((message) => message.id !== userMessage.id));
    } finally {
      setLoading(false);
    }
  }, [listening, location.pathname, nextThreadId, setTranscript, stop, threadMessages]);

  const openListening = useCallback(() => {
    window.dispatchEvent(new CustomEvent(FINANCE_WHISPER_FLOW_OPEN_EVENT));
    setOpen(true);
    setPhase('listening');
    setPlan(null);
    setExecution(null);
    setAnalystRowStatus({});
    setActionStatus({});
    setThreadMessages([]);
    setConversationInput('');
    setError('');
    reset();
    setVoiceAutoSubmitArmed(true);
    void start();
  }, [reset, start]);

  const close = useCallback(() => {
    if (autoInterpretTimerRef.current) {
      window.clearTimeout(autoInterpretTimerRef.current);
      autoInterpretTimerRef.current = null;
    }
    stop();
    setVoiceAutoSubmitArmed(false);
    setOpen(false);
  }, [stop]);

  useEffect(() => {
    function handleQuickLaunchOpen() {
      stop();
      setOpen(false);
    }

    window.addEventListener(FINANCE_QUICK_LAUNCH_OPEN_EVENT, handleQuickLaunchOpen);
    return () => window.removeEventListener(FINANCE_QUICK_LAUNCH_OPEN_EVENT, handleQuickLaunchOpen);
  }, [stop]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        openListening();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openListening]);

  useEffect(() => {
    if (!open || phase !== 'listening' || loading || listening || processing || !voiceAutoSubmitArmed || !transcript.trim()) {
      return undefined;
    }

    autoInterpretTimerRef.current = window.setTimeout(() => {
      setVoiceAutoSubmitArmed(false);
      void interpretTranscript(transcript);
    }, 650);

    return () => {
      if (autoInterpretTimerRef.current) {
        window.clearTimeout(autoInterpretTimerRef.current);
        autoInterpretTimerRef.current = null;
      }
    };
  }, [interpretTranscript, listening, loading, open, phase, processing, transcript, voiceAutoSubmitArmed]);

  useEffect(() => {
    if (speechError) {
      setError(speechError);
      setVoiceAutoSubmitArmed(false);
    }
  }, [speechError]);

  function handleInterpret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVoiceAutoSubmitArmed(false);
    if (autoInterpretTimerRef.current) {
      window.clearTimeout(autoInterpretTimerRef.current);
      autoInterpretTimerRef.current = null;
    }
    void interpretTranscript(transcript);
  }

  async function handleExecute() {
    if (!plan) return;

    setLoading(true);
    setError('');

    try {
      const result = await financeApi.executeAssistantPlan(plan.id);
      setExecution(result);
      setPhase('done');
      const executionMessage: ThreadMessage = {
        id: nextThreadId('execution'),
        role: 'execution',
        execution: result,
        content: `Plano executado. ${result.results.length} ação${result.results.length === 1 ? '' : 'ões'} concluída${result.results.length === 1 ? '' : 's'}.`
      };
      setThreadMessages((current) => [
        ...current,
        executionMessage
      ].slice(-14));
      const createdDetail = createdDetailFromExecution(result);
      if (createdDetail) {
        window.dispatchEvent(new CustomEvent(FINANCE_QUICK_LAUNCH_CREATED_EVENT, { detail: createdDetail }));
      }
    } catch (executeError) {
      setError(friendlyError(executeError));
    } finally {
      setLoading(false);
    }
  }

  async function handleExecuteAction(actionId: string, targetPlan: FinanceAssistantPlan = plan as FinanceAssistantPlan) {
    if (!targetPlan) return;
    setActionStatus((current) => ({ ...current, [actionId]: 'executing' }));
    setError('');

    try {
      const result = await financeApi.executeAssistantPlanAction(targetPlan.id, actionId);
      setExecution(result);
      setActionStatus((current) => ({ ...current, [actionId]: 'done' }));
      const executionMessage: ThreadMessage = {
        id: nextThreadId('execution'),
        role: 'execution',
        execution: result,
        content: `Ação executada. ${result.results.length} atualização concluída${result.results.length === 1 ? '' : 's'}.`
      };
      setThreadMessages((current) => [
        ...current,
        executionMessage
      ].slice(-14));
      const createdDetail = createdDetailFromExecution(result);
      if (createdDetail) {
        window.dispatchEvent(new CustomEvent(FINANCE_QUICK_LAUNCH_CREATED_EVENT, { detail: createdDetail }));
      }
    } catch (executeError) {
      setActionStatus((current) => ({ ...current, [actionId]: 'idle' }));
      setError(friendlyError(executeError));
    }
  }

  function handleContinueConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextMessage = conversationInput.trim();
    if (!nextMessage) return;
    setVoiceAutoSubmitArmed(false);
    void interpretTranscript(nextMessage);
  }

  function handleSuggestedActionClick(suggestion: string, sourcePlan: FinanceAssistantPlan) {
    const prompt = [
      `O usuário clicou na sugestão "${suggestion}" da sua resposta anterior.`,
      'Use a resposta anterior, as recomendações e o contexto da conversa para continuar.',
      'Se a sugestão já trouxer itens concretos para criar/ajustar, proponha as ações confirmáveis diretamente.',
      'Não repita a mesma pergunta se os itens já estiverem claros no contexto.'
    ].join(' ');
    setConversationInput('');
    void interpretTranscript(`${prompt}\n\nResumo anterior:\n${assistantConversationMemoryFromPlan(sourcePlan)}`);
  }

  async function handleSettleAnalystItem(item: FinanceAssistantAnswerBreakdownItem) {
    if (item.resource_type !== 'payable') return;
    setAnalystRowStatus((current) => ({ ...current, [item.id]: 'settling' }));
    setError('');

    try {
      await financeApi.settlePayable(item.id, { note: 'Baixa pelo Chat Financeiro.' });
      setAnalystRowStatus((current) => ({ ...current, [item.id]: 'settled' }));
      window.dispatchEvent(new CustomEvent(FINANCE_QUICK_LAUNCH_CREATED_EVENT, {
        detail: {
          type: 'payable',
          id: item.id,
          description: item.title,
          amount_cents: item.amount_cents,
          due_date: item.due_date ?? null
        }
      }));
    } catch (settleError) {
      setAnalystRowStatus((current) => ({ ...current, [item.id]: 'idle' }));
      setError(friendlyError(settleError));
    }
  }

  async function handleUndoSettleAnalystItem(item: FinanceAssistantAnswerBreakdownItem) {
    if (item.resource_type !== 'payable') return;
    setAnalystRowStatus((current) => ({ ...current, [item.id]: 'undoing' }));
    setError('');

    try {
      await financeApi.undoSettlePayable(item.id, { note: 'Baixa desfeita pelo Chat Financeiro.' });
      setAnalystRowStatus((current) => ({ ...current, [item.id]: 'idle' }));
      window.dispatchEvent(new CustomEvent(FINANCE_QUICK_LAUNCH_CREATED_EVENT, {
        detail: {
          type: 'payable',
          id: item.id,
          description: item.title,
          amount_cents: item.amount_cents,
          due_date: item.due_date ?? null
        }
      }));
    } catch (undoError) {
      setAnalystRowStatus((current) => ({ ...current, [item.id]: 'settled' }));
      setError(friendlyError(undoError));
    }
  }

  const reviewMode = open && (phase === 'preview' || phase === 'done');
  const compactMode = open && !reviewMode;
  const analysisAnswer = phase === 'preview' && plan?.answer ? plan.answer : undefined;
  const createdExecutionDetail = execution ? createdDetailFromExecution(execution) : null;
  const compactTitle = processing
    ? 'Transcrevendo...'
    : loading
      ? 'Preparando ação...'
      : paused
        ? 'Pausado'
        : listening
          ? 'Ouvindo'
        : transcript.trim()
          ? 'Comando capturado'
          : 'Pronto para falar';
  const compactHint = processing
    ? 'Convertendo sua fala em texto.'
    : loading
      ? 'Lendo intenção e montando o plano.'
      : paused
        ? 'Continue, finalize ou edite o texto.'
        : listening
          ? 'Fale naturalmente. O texto aparece abaixo quando o navegador permitir.'
        : supported
          ? 'Clique na cápsula ou escreva um comando curto.'
          : 'Microfone indisponível. Escreva o comando abaixo.';
  const priorThreadMessages = threadMessages.filter((message) =>
    !(message.role === 'assistant' && plan && message.plan.id === plan.id)
  );

  return (
    <div className={`finance-whisper-flow${open ? ' finance-whisper-flow--open' : ''}${compactMode ? ' finance-whisper-flow--capsule' : ''}${listening ? ' finance-whisper-flow--listening' : ''}${processing ? ' finance-whisper-flow--processing' : ''}`}>
      {compactMode ? (
        <section className="finance-whisper-flow__compact" aria-label="Whisper Flow financeiro">
          <button
            type="button"
            className="finance-whisper-flow__listen-pill"
            aria-label={listening ? 'Finalizar gravação do Whisper Flow' : 'Iniciar gravação do Whisper Flow'}
            onClick={() => {
              if (listening) {
                stop();
                return;
              }
              setVoiceAutoSubmitArmed(true);
              void start();
            }}
            disabled={!supported || loading || processing}
          >
            <span className="finance-whisper-flow__listen-wave" aria-hidden="true">
              {Array.from({ length: 14 }).map((_, index) => <i key={index} />)}
            </span>
          </button>

          <form className="finance-whisper-flow__command-palette" onSubmit={handleInterpret}>
            <div className="finance-whisper-flow__command-status">
              <strong>{compactTitle}</strong>
              <span>{compactHint}</span>
            </div>
            {listening ? (
              <div className="finance-whisper-flow__voice-controls" aria-label="Controles de gravação">
                <button
                  type="button"
                  className="finance-whisper-flow__voice-secondary"
                  onClick={paused ? resume : pause}
                  disabled={loading || processing}
                >
                  {paused ? 'Continuar' : 'Pausar'}
                </button>
                <button
                  type="button"
                  className="finance-whisper-flow__voice-primary"
                  onClick={stop}
                  disabled={loading || processing}
                >
                  Finalizar
                </button>
              </div>
            ) : null}
            <label className="finance-whisper-flow__sr-only" htmlFor={commandId}>Comando do Whisper Flow</label>
            <div className="finance-whisper-flow__command-row">
              <input
                id={commandId}
                value={transcript}
                onChange={(event) => {
                  setTranscript(event.target.value);
                  setVoiceAutoSubmitArmed(false);
                }}
                placeholder="Ex.: lançar aluguel de 8000 dia 15"
                disabled={processing || loading}
              />
              <button type="submit" disabled={processing || loading || !transcript.trim()} aria-label="Interpretar comando">
                Enter
              </button>
            </div>
            {error ? <p className="finance-whisper-flow__compact-error">{error}</p> : null}
            <button type="button" className="finance-whisper-flow__compact-close" aria-label="Fechar Whisper Flow" onClick={close}>
              ×
            </button>
          </form>
        </section>
      ) : null}

      {reviewMode ? (
        <section className={`finance-whisper-flow__panel${analysisAnswer ? ' finance-whisper-flow__panel--analyst' : ''}`} aria-label="Whisper Flow financeiro">
          <header className="finance-whisper-flow__header">
            <div>
              <small>{analysisAnswer ? 'Whisper Finance' : 'Whisper Flow'}</small>
              <h2>{analysisAnswer ? 'Análise pronta' : phase === 'done' ? 'Execução concluída' : phase === 'preview' ? 'Prévia do plano' : listening ? 'Gravando comando' : 'Pronto para ditar'}</h2>
            </div>
            <button type="button" className="finance-whisper-flow__close" aria-label="Fechar Whisper Flow" onClick={close}>
              ×
            </button>
          </header>

          <div className={`finance-whisper-flow__signal${listening ? ' is-listening' : ''}${processing ? ' is-processing' : ''}`} aria-live="polite">
            <span className="finance-whisper-flow__signal-dot" aria-hidden="true" />
            <div>
              <strong>{processing ? 'Transcrevendo áudio...' : listening ? 'Gravando agora' : supported ? 'Diga o comando financeiro' : 'Microfone indisponível'}</strong>
              <p>{processing ? 'Transformando sua fala em comando financeiro.' : paused ? 'Gravação pausada. Continue quando quiser.' : listening ? 'Fale naturalmente. Você também pode editar o texto enquanto grava.' : supported ? 'Clique no botão e comece a falar.' : 'Libere o microfone ou escreva o comando abaixo.'}</p>
            </div>
            <div className="finance-whisper-flow__wave" aria-hidden="true">
              {Array.from({ length: 18 }).map((_, index) => <i key={index} />)}
            </div>
          </div>

          <form className="finance-whisper-flow__form" onSubmit={handleInterpret}>
            <label htmlFor={commandId}>Comando do Whisper Flow</label>
            <textarea
              id={commandId}
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder="Ex.: lança aluguel de 8000 para dia 15"
              rows={4}
            />
            <div className="finance-whisper-flow__toolbar">
              <button
                type="button"
                onClick={() => {
                  if (listening) {
                    stop();
                  } else {
                    setVoiceAutoSubmitArmed(true);
                    void start();
                  }
                }}
                disabled={!supported || loading || processing}
              >
                {processing ? 'Transcrevendo...' : listening ? 'Finalizar áudio' : 'Ditar'}
              </button>
              {listening ? (
                <button
                  type="button"
                  onClick={paused ? resume : pause}
                  disabled={loading || processing}
                >
                  {paused ? 'Continuar' : 'Pausar'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  reset();
                  setPlan(null);
                  setExecution(null);
                  setPhase('listening');
                  setError('');
                  setVoiceAutoSubmitArmed(false);
                }}
                disabled={loading || processing}
              >
                Limpar
              </button>
              <button
                className="finance-whisper-flow__primary"
                type="submit"
                disabled={loading || processing || !transcript.trim()}
                aria-label="Interpretar comando"
              >
                {loading && phase !== 'done' ? 'Interpretando...' : 'Interpretar agora'}
              </button>
            </div>
          </form>

          {error ? <p className="finance-whisper-flow__message finance-whisper-flow__message--error">{error}</p> : null}

          {priorThreadMessages.length ? (
            <ol className="finance-whisper-flow__thread" aria-label="Histórico da conversa financeira">
              {priorThreadMessages.map((message) => {
                if (message.role === 'user') {
                  return (
                    <li key={message.id} className="finance-whisper-flow__thread-item finance-whisper-flow__thread-item--user">
                      <span>Você</span>
                      <p>{message.content}</p>
                    </li>
                  );
                }

                if (message.role === 'execution') {
                  const createdDetail = createdDetailFromExecution(message.execution);
                  return (
                    <li key={message.id} className="finance-whisper-flow__thread-item finance-whisper-flow__thread-item--execution">
                      <span>Executado</span>
                      <p>{message.content}</p>
                      {createdDetail ? (
                        <small>
                          {[
                            createdDetail.description,
                            formatAssistantCurrency(createdDetail.amount_cents),
                            formatAssistantDate(createdDetail.due_date)
                          ].filter(Boolean).join(' · ')}
                        </small>
                      ) : null}
                    </li>
                  );
                }

                const answer = message.plan.answer;
                return (
                  <li key={message.id} className="finance-whisper-flow__thread-item finance-whisper-flow__thread-item--assistant">
                    <span>Whisper Finance</span>
                    <strong>{answer?.title ?? 'Plano pronto'}</strong>
                    <p>{answer?.summary ?? message.plan.human_summary}</p>
                    {answer?.primary_metric ? (
                      <small>
                        {[
                          answer.primary_metric.label,
                          formatAssistantCurrency(answer.primary_metric.amount_cents) ?? answer.primary_metric.count
                        ].filter(Boolean).join(' · ')}
                      </small>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : null}

          {analysisAnswer ? (
            <div className="finance-whisper-flow__analyst">
              <section className="finance-whisper-flow__analyst-hero" aria-label={analysisAnswer.primary_metric.label}>
                <div>
                  <span>{analysisAnswer.primary_metric.label}</span>
                  <strong>{formatAssistantCurrency(analysisAnswer.primary_metric.amount_cents) ?? analysisAnswer.primary_metric.count ?? '-'}</strong>
                </div>
                {typeof analysisAnswer.primary_metric.count === 'number' ? (
                  <p>{analysisAnswer.primary_metric.count} item{analysisAnswer.primary_metric.count === 1 ? '' : 's'} na composição</p>
                ) : null}
              </section>

              <section className="finance-whisper-flow__analyst-answer">
                <h3>{analysisAnswer.title}</h3>
                <p>{analysisAnswer.summary}</p>
              </section>

              {analysisAnswer.breakdown.length ? (
                <ul className="finance-whisper-flow__analyst-list" aria-label="Composição da resposta financeira">
                  {analysisAnswer.breakdown.map((item) => {
                    const rowStatus = analystRowStatus[item.id] ?? 'idle';
                    const canSettle = item.resource_type === 'payable' && item.available_actions.includes('settle');
                    const metaText = item.meta.filter(Boolean).join(' · ');

                    return (
                      <li key={`${item.resource_type}-${item.id}`} className={`finance-whisper-flow__analyst-row${rowStatus === 'settled' ? ' is-settled' : ''}`}>
                        <div className="finance-whisper-flow__analyst-row-main">
                          <div>
                            <strong>{item.title}</strong>
                            <span>{metaText || 'Sem classificação operacional'}</span>
                          </div>
                          <div className="finance-whisper-flow__analyst-row-value">
                            <strong>{formatAssistantCurrency(item.amount_cents) ?? item.status ?? 'Cadastro'}</strong>
                            <span>{formatAssistantDate(item.due_date) ?? item.status ?? 'Sem data'}</span>
                          </div>
                        </div>
                        <div className="finance-whisper-flow__analyst-row-actions">
                          {rowStatus === 'settled' || rowStatus === 'undoing' ? (
                            <>
                              <span className="finance-whisper-flow__analyst-badge">Baixado agora</span>
                              <button
                                type="button"
                                onClick={() => void handleUndoSettleAnalystItem(item)}
                                disabled={rowStatus === 'undoing'}
                                aria-label={`Desfazer baixa de ${item.title}`}
                              >
                                {rowStatus === 'undoing' ? 'Desfazendo...' : 'Desfazer'}
                              </button>
                            </>
                          ) : (
                            <>
                              {canSettle ? (
                                <button
                                  type="button"
                                  onClick={() => void handleSettleAnalystItem(item)}
                                  disabled={rowStatus === 'settling'}
                                  aria-label={`Baixar ${item.title}`}
                                >
                                  {rowStatus === 'settling' ? 'Baixando...' : 'Baixar'}
                                </button>
                              ) : null}
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="finance-whisper-flow__analyst-empty">
                  Nenhuma conta entrou nessa leitura.
                </div>
              )}

              {analysisAnswer.insights.length ? (
                <section className="finance-whisper-flow__analyst-insights">
                  <h3>Leitura do analista</h3>
                  {analysisAnswer.insights.map((insight) => <p key={insight}>{insight}</p>)}
                </section>
              ) : null}

              {analysisAnswer.suggested_actions.length ? (
                <div className="finance-whisper-flow__analyst-suggestions" aria-label="Sugestões do analista">
                  {analysisAnswer.suggested_actions.map((suggestion) => (
                    <button
                      type="button"
                      key={suggestion}
                      onClick={() => {
                        if (plan) handleSuggestedActionClick(suggestion, plan);
                      }}
                      disabled={loading || processing}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}

              {plan?.actions.length ? (
                <section className="finance-whisper-flow__analyst-actions" aria-label="Ações que o copiloto pode executar">
                  <span>Ações prontas</span>
                  <div>
                    {plan.actions.map((action) => {
                      const status = actionStatus[action.id] ?? 'idle';
                      return (
                        <button
                          type="button"
                          key={action.id}
                          onClick={() => void handleExecuteAction(action.id, plan)}
                          disabled={loading || processing || status === 'executing' || status === 'done'}
                        >
                          {status === 'executing' ? 'Executando...' : status === 'done' ? 'Feito' : action.human_summary}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <form className="finance-whisper-flow__analyst-chatbar" onSubmit={handleContinueConversation}>
                <input
                  value={conversationInput}
                  onChange={(event) => setConversationInput(event.target.value)}
                  placeholder="Pergunte outra coisa ou peça uma ação..."
                  aria-label="Continuar conversa financeira"
                  disabled={loading || processing}
                />
                <button type="submit" disabled={loading || processing || !conversationInput.trim()}>
                  Enviar
                </button>
              </form>
            </div>
          ) : null}

          {phase === 'preview' && plan && !analysisAnswer ? (
            <div className="finance-whisper-flow__preview">
              <div className="finance-whisper-flow__summary">
                <span>{plan.risk_level}</span>
                <p>{plan.human_summary}</p>
              </div>
              <ul className="finance-whisper-flow__actions" aria-label="Ações planejadas">
                {plan.actions.map((action) => (
                  <li key={action.id}>
                    <strong>{action.human_summary}</strong>
                    <span>{action.intent} · {Math.round(action.confidence * 100)}%</span>
                  </li>
                ))}
              </ul>
              <button className="finance-whisper-flow__execute" type="button" onClick={handleExecute} disabled={loading}>
                {loading ? 'Executando...' : 'Confirmar e executar'}
              </button>
            </div>
          ) : null}

          {phase === 'done' && execution ? (
            <div className="finance-whisper-flow__done" role="status">
              <strong>Plano executado.</strong>
              <span>{execution.results.length} ação{execution.results.length === 1 ? '' : 'ões'} concluída{execution.results.length === 1 ? '' : 's'}.</span>
              {createdExecutionDetail ? (
                <p>
                  {[
                    createdExecutionDetail.description,
                    formatAssistantCurrency(createdExecutionDetail.amount_cents),
                    formatAssistantDate(createdExecutionDetail.due_date)
                  ].filter(Boolean).join(' · ')}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {!open ? (
        <button
          type="button"
          className="finance-whisper-flow__orb"
          aria-label="Abrir Whisper Flow"
          onClick={openListening}
        >
          <span className="finance-whisper-flow__orb-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>
      ) : null}
    </div>
  );
}
