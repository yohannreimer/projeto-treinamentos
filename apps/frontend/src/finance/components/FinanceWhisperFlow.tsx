import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { financeApi, type FinanceAssistantExecutionResult, type FinanceAssistantPlan } from '../api';
import { useFinanceSpeechRecognition } from '../hooks/useFinanceSpeechRecognition';
import {
  FINANCE_QUICK_LAUNCH_CREATED_EVENT,
  FINANCE_QUICK_LAUNCH_OPEN_EVENT,
  FINANCE_WHISPER_FLOW_OPEN_EVENT
} from './financeFloatingEvents';

type WhisperPhase = 'listening' | 'preview' | 'done';

function friendlyError(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Não consegui processar esse comando agora. Revise o texto e tente novamente.';
}

function createdDetailFromExecution(execution: FinanceAssistantExecutionResult) {
  const created = execution.results.find((result) => result.resource_type === 'payable' || result.resource_type === 'receivable');
  if (!created || !created.resource_id) {
    return null;
  }
  return {
    type: created.resource_type,
    id: created.resource_id
  };
}

export function FinanceWhisperFlow() {
  const location = useLocation();
  const commandId = useId();
  const autoInterpretTimerRef = useRef<number | null>(null);
  const {
    supported,
    listening,
    transcript,
    start,
    stop,
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

  const interpretTranscript = useCallback(async (nextTranscript: string) => {
    const trimmedTranscript = nextTranscript.trim();
    if (!trimmedTranscript) {
      setError('Digite ou dite um comando financeiro antes de interpretar.');
      return;
    }

    setLoading(true);
    setError('');
    setPlan(null);
    setExecution(null);

    try {
      stop();
      const nextPlan = await financeApi.interpretAssistantCommand({
        transcript: trimmedTranscript,
        surface_path: location.pathname
      });
      setPlan(nextPlan);
      setPhase('preview');
    } catch (interpretError) {
      setError(friendlyError(interpretError));
    } finally {
      setLoading(false);
    }
  }, [location.pathname, stop]);

  const openListening = useCallback(() => {
    window.dispatchEvent(new CustomEvent(FINANCE_WHISPER_FLOW_OPEN_EVENT));
    setOpen(true);
    setPhase('listening');
    setPlan(null);
    setExecution(null);
    setError('');
    reset();
    setVoiceAutoSubmitArmed(supported);
    start();
  }, [reset, start, supported]);

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
    if (!open || phase !== 'listening' || loading || listening || !voiceAutoSubmitArmed || !transcript.trim()) {
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
  }, [interpretTranscript, listening, loading, open, phase, transcript, voiceAutoSubmitArmed]);

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

  return (
    <div className={`finance-whisper-flow${open ? ' finance-whisper-flow--open' : ''}${listening ? ' finance-whisper-flow--listening' : ''}`}>
      {open ? (
        <section className="finance-whisper-flow__panel" aria-label="Whisper Flow financeiro">
          <header className="finance-whisper-flow__header">
            <div>
              <small>Whisper Flow</small>
              <h2>{phase === 'done' ? 'Execução concluída' : phase === 'preview' ? 'Prévia do plano' : 'Pronto para ditar'}</h2>
            </div>
            <button type="button" className="finance-whisper-flow__close" aria-label="Fechar Whisper Flow" onClick={close}>
              ×
            </button>
          </header>

          <div className={`finance-whisper-flow__signal${listening ? ' is-listening' : ''}`} aria-live="polite">
            <span aria-hidden="true" />
            <div>
              <strong>{listening ? 'Ouvindo...' : supported ? 'Diga o comando financeiro' : 'Áudio não disponível neste navegador'}</strong>
              <p>{supported ? 'Ao parar de falar, eu preparo a ação automaticamente.' : 'Use Chrome/Edge para ditado ou escreva o comando abaixo.'}</p>
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
                    start();
                  }
                }}
                disabled={!supported || loading}
              >
                {listening ? 'Parar voz' : 'Ditar'}
              </button>
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
                disabled={loading}
              >
                Limpar
              </button>
              <button
                className="finance-whisper-flow__primary"
                type="submit"
                disabled={loading || !transcript.trim()}
                aria-label="Interpretar comando"
              >
                {loading && phase !== 'done' ? 'Interpretando...' : 'Interpretar agora'}
              </button>
            </div>
          </form>

          {error ? <p className="finance-whisper-flow__message finance-whisper-flow__message--error">{error}</p> : null}

          {phase === 'preview' && plan ? (
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
            </div>
          ) : null}
        </section>
      ) : null}

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
    </div>
  );
}
