import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import holandHorizontalLogo from '../assets/holand-horizontal.svg';
import { api } from '../services/api';

type FollowupEvaluation = {
  token: string;
  company_name: string;
  title: string;
  notes: string | null;
  status: string;
  submitted_at: string | null;
};

export function FollowupEvaluationPage() {
  const { token = '' } = useParams();
  const [evaluation, setEvaluation] = useState<FollowupEvaluation | null>(null);
  const [respondentName, setRespondentName] = useState('');
  const [rating, setRating] = useState(5);
  const [whatWorked, setWhatWorked] = useState('');
  const [whatToImprove, setWhatToImprove] = useState('');
  const [nextPriority, setNextPriority] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.followupEvaluation(token)
      .then((response) => {
        if (!mounted) return;
        setEvaluation(response as FollowupEvaluation);
        setError('');
      })
      .catch((loadError) => {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar avaliação.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!respondentName.trim()) {
      setError('Informe seu nome antes de enviar.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await api.submitFollowupEvaluation(token, {
        respondent_name: respondentName.trim(),
        rating,
        answers: {
          what_worked: whatWorked.trim(),
          what_to_improve: whatToImprove.trim(),
          next_priority: nextPriority.trim()
        }
      });
      setSuccess(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Falha ao enviar avaliação.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="followup-evaluation-loading">Carregando avaliação...</p>;
  if (error && !evaluation) return <p className="followup-evaluation-loading error">{error}</p>;

  return (
    <main className="followup-evaluation-page">
      <section className="followup-evaluation-card">
        <header className="followup-evaluation-header">
          <img src={holandHorizontalLogo} alt="Holand" />
          <span>Acompanhamento do cliente</span>
          <h1>{evaluation?.title ?? 'Avaliação de acompanhamento'}</h1>
          <p>{evaluation?.company_name ?? ''}</p>
          {evaluation?.notes ? <small>{evaluation.notes}</small> : null}
        </header>

        {success || evaluation?.submitted_at ? (
          <div className="followup-evaluation-success" role="status">
            <strong>Avaliação enviada.</strong>
            <p>Obrigado pelo retorno. Suas respostas ficaram registradas para a equipe Holand.</p>
          </div>
        ) : (
          <form className="followup-evaluation-form" onSubmit={submit}>
            {error ? <p className="error">{error}</p> : null}
            <label>
              Respondido por
              <input value={respondentName} onChange={(event) => setRespondentName(event.target.value)} placeholder="Seu nome" />
            </label>
            <fieldset>
              <legend>Como você avalia o acompanhamento?</legend>
              <div className="followup-rating-row">
                {[1, 2, 3, 4, 5].map((value) => (
                  <label key={value} className={rating === value ? 'is-selected' : ''}>
                    <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} />
                    <span>{value}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              O que funcionou bem neste acompanhamento?
              <textarea rows={4} value={whatWorked} onChange={(event) => setWhatWorked(event.target.value)} />
            </label>
            <label>
              O que podemos melhorar?
              <textarea rows={4} value={whatToImprove} onChange={(event) => setWhatToImprove(event.target.value)} />
            </label>
            <label>
              Qual deve ser a próxima prioridade?
              <textarea rows={3} value={nextPriority} onChange={(event) => setNextPriority(event.target.value)} />
            </label>
            <button type="submit" disabled={saving}>{saving ? 'Enviando...' : 'Enviar avaliação'}</button>
          </form>
        )}
      </section>
    </main>
  );
}
