import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import holandHorizontalLogo from '../../assets/holand-horizontal.svg';
import type { PortalAuthedApi, PortalCertificateEvaluation } from '../types';

type PortalCertificateEvaluationPageProps = {
  api: Pick<PortalAuthedApi, 'certificateEvaluation' | 'submitCertificateEvaluation'>;
};

type RatingQuestion = {
  id: string;
  number: string;
  text: string;
  type: 'rating';
};

type ChoiceQuestion = {
  id: string;
  number: string;
  text: string;
  type: 'choice';
  options: string[];
};

type TextQuestion = {
  id: string;
  number: string;
  text: string;
  type: 'text';
  placeholder: string;
};

type EvaluationQuestion = RatingQuestion | ChoiceQuestion | TextQuestion;

const sections: Array<{ number: string; title: string; subtitle: string; questions: EvaluationQuestion[] }> = [
  {
    number: '1',
    title: 'Avaliação do Instrutor',
    subtitle: 'Nota de 1 (ruim) a 5 (excelente)',
    questions: [
      { id: 'q1', number: '01', type: 'rating', text: 'O instrutor demonstrou domínio técnico do conteúdo do curso?' },
      { id: 'q2', number: '02', type: 'rating', text: 'O instrutor explicou os conceitos de forma clara e objetiva?' },
      { id: 'q3', number: '03', type: 'rating', text: 'O instrutor foi paciente e disponível para tirar dúvidas?' },
      { id: 'q4', number: '04', type: 'rating', text: 'O ritmo das aulas foi adequado?' },
      { id: 'q5', number: '05', type: 'rating', text: 'O instrutor estimulou a participação e a prática dos alunos?' },
      { id: 'q6', number: '06', type: 'text', text: 'Qual foi o principal ponto forte do instrutor?', placeholder: 'Descreva o que mais se destacou positivamente...' },
      { id: 'q7', number: '07', type: 'text', text: 'O que o instrutor poderia melhorar?', placeholder: 'Sugestões construtivas são muito bem-vindas...' }
    ]
  },
  {
    number: '2',
    title: 'Avaliação do Conteúdo',
    subtitle: 'Nota de 1 (ruim) a 5 (excelente)',
    questions: [
      { id: 'q8', number: '08', type: 'rating', text: 'O conteúdo do curso atendeu às suas expectativas?' },
      { id: 'q9', number: '09', type: 'rating', text: 'Os temas abordados foram relevantes para sua realidade profissional?' },
      { id: 'q10', number: '10', type: 'choice', text: 'O nível de dificuldade do curso foi adequado?', options: ['Muito fácil', 'Adequado', 'Um pouco difícil', 'Muito difícil'] },
      { id: 'q11', number: '11', type: 'rating', text: 'As aulas práticas foram suficientes?' },
      { id: 'q12', number: '12', type: 'rating', text: 'A sequência dos tópicos foi lógica e bem organizada?' },
      { id: 'q13', number: '13', type: 'rating', text: 'Você se sente mais confiante para aplicar o conteúdo após o curso?' }
    ]
  },
  {
    number: '3',
    title: 'Materiais e Recursos',
    subtitle: 'Nota de 1 (ruim) a 5 (excelente)',
    questions: [
      { id: 'q14', number: '14', type: 'rating', text: 'O material didático foi de boa qualidade?' },
      { id: 'q15', number: '15', type: 'rating', text: 'Os exercícios práticos foram úteis e bem elaborados?' },
      { id: 'q16', number: '16', type: 'rating', text: 'O ambiente, laboratório ou licenças do software funcionaram bem?' }
    ]
  },
  {
    number: '4',
    title: 'Avaliação Geral',
    subtitle: 'Visão geral sobre o curso',
    questions: [
      { id: 'q17', number: '17', type: 'choice', text: 'No geral, como você avalia o curso?', options: ['Excelente', 'Bom', 'Regular', 'Ruim', 'Péssimo'] },
      { id: 'q18', number: '18', type: 'choice', text: 'Recomendaria este curso para outros colegas?', options: ['Sim, com certeza', 'Sim, com ressalvas', 'Não'] },
      { id: 'q19', number: '19', type: 'text', text: 'Qual foi o tópico mais útil do curso?', placeholder: 'Descreva o tópico que mais agregou valor...' },
      { id: 'q20', number: '20', type: 'text', text: 'Qual tópico você achou menos útil ou precisa de mais aprofundamento?', placeholder: 'Sua opinião nos ajuda a melhorar o conteúdo...' }
    ]
  },
  {
    number: '5',
    title: 'Sugestões e Comentários',
    subtitle: 'Espaço livre para suas observações',
    questions: [
      { id: 'q21', number: '21', type: 'text', text: 'O que mais você gostou no curso?', placeholder: 'Compartilhe os pontos altos da sua experiência...' },
      { id: 'q22', number: '22', type: 'text', text: 'O que podemos melhorar para as próximas turmas?', placeholder: 'Sua sugestão é muito valiosa para nós...' },
      { id: 'q23', number: '23', type: 'text', text: 'Sugestões de novos temas ou módulos que gostaria de ver?', placeholder: 'Que outros cursos ou conteúdos seriam úteis para você?' }
    ]
  }
];

const requiredAnswerIds = sections
  .flatMap((section) => section.questions)
  .filter((question) => question.type !== 'text')
  .map((question) => question.id);

function formatDateBr(dateIso: string | null | undefined) {
  if (!dateIso) return 'Data não informada';
  const [year, month, day] = dateIso.split('-').map(Number);
  if (!year || !month || !day) return dateIso;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

export function PortalCertificateEvaluationPage({ api }: PortalCertificateEvaluationPageProps) {
  const { certificateId = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<PortalCertificateEvaluation | null>(null);
  const [respondentName, setRespondentName] = useState('');
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.certificateEvaluation(certificateId)
      .then((response) => {
        if (!mounted) return;
        setData(response);
        setRespondentName(response.respondent_name ?? '');
        setAnswers(response.answers ?? {});
        setError('');
      })
      .catch((loadError) => {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar avaliação.');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [api, certificateId]);

  const missingRequired = useMemo(() => (
    requiredAnswerIds.filter((id) => !answers[id])
  ), [answers]);

  function setAnswer(id: string, value: string | number) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!respondentName.trim()) {
      setError('Informe o nome de quem está respondendo.');
      return;
    }
    if (missingRequired.length > 0) {
      setError('Responda todas as perguntas de nota e escolha antes de enviar.');
      return;
    }
    setSaving(true);
    try {
      await api.submitCertificateEvaluation(certificateId, {
        respondent_name: respondentName.trim(),
        answers
      });
      setSuccess(true);
      setError('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Falha ao enviar avaliação.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Carregando avaliação...</p>;
  if (error && !data) return <p className="error">{error}</p>;
  if (!data) return <p className="error">Avaliação não encontrada.</p>;

  const certificate = data.certificate;
  const cohortLabel = certificate.cohort_code
    ? `${certificate.cohort_code} · ${certificate.cohort_name ?? ''}`.trim()
    : certificate.cohort_name ?? 'Turma vinculada';

  return (
    <section className="portal-evaluation-screen">
      {success ? (
        <div className="portal-evaluation-success" role="status">
          <div className="portal-evaluation-success-icon">✓</div>
          <h2>AVALIAÇÃO<br /><span>ENVIADA</span></h2>
          <p>Obrigado pelo seu feedback. O certificado já está liberado para download na aba Certificados.</p>
          <button type="button" className="portal-evaluation-submit" onClick={() => navigate('../..')}>
            Voltar aos certificados
          </button>
        </div>
      ) : null}

      <div className="portal-evaluation-topbar" />
      <header className="portal-evaluation-header">
        <div className="portal-evaluation-brand">
          <img src={holandHorizontalLogo} alt="Holand" />
          <span />
          <div>
            <small>Depto. de Treinamento</small>
            <strong>Ficha de Avaliação de Curso</strong>
          </div>
        </div>
        <button type="button" className="portal-evaluation-ghost" onClick={() => navigate('../..')}>
          Voltar
        </button>
      </header>

      <section className="portal-evaluation-hero">
        <div className="portal-evaluation-kicker">Ficha de Avaliação</div>
        <h1>AVALIE<br /><span>SEU CURSO</span></h1>
        <p>Sua opinião é fundamental para melhorarmos continuamente a qualidade dos nossos treinamentos. Responda com sinceridade. Leva menos de 5 minutos.</p>
        <div className="portal-evaluation-info-grid">
          <div>
            <label>Curso / Módulo</label>
            <strong>{certificate.module_name}</strong>
          </div>
          <div>
            <label>Data</label>
            <strong>{formatDateBr(certificate.completed_at)}</strong>
          </div>
          <div>
            <label>Instrutor(a)</label>
            <strong>{certificate.technician_name ?? 'Instrutor Holand'}</strong>
          </div>
          <div>
            <label>Turma</label>
            <strong>{cohortLabel}</strong>
          </div>
        </div>
      </section>

      <form onSubmit={submit}>
        <main className="portal-evaluation-main">
          <label className="portal-evaluation-respondent">
            Respondido por
            <input
              value={respondentName}
              onChange={(event) => setRespondentName(event.target.value)}
              placeholder="Nome completo"
            />
          </label>

          {sections.map((section) => (
            <section key={section.number} className="portal-evaluation-section">
              <header className="portal-evaluation-section-header">
                <div>{section.number}</div>
                <span>
                  <strong>{section.title}</strong>
                  <small>{section.subtitle}</small>
                </span>
              </header>
              {section.questions.map((question) => (
                <div key={question.id} className="portal-evaluation-question">
                  <p><span>{question.number}</span>{question.text}</p>
                  {question.type === 'rating' ? (
                    <div className="portal-evaluation-stars" role="radiogroup" aria-label={question.text}>
                      {[5, 4, 3, 2, 1].map((value) => (
                        <label key={value}>
                          <input
                            type="radio"
                            name={question.id}
                            value={value}
                            checked={answers[question.id] === value}
                            onChange={() => setAnswer(question.id, value)}
                          />
                          <span>{value}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                  {question.type === 'choice' ? (
                    <div className="portal-evaluation-choices">
                      {question.options.map((option) => (
                        <label key={option}>
                          <input
                            type="radio"
                            name={question.id}
                            value={option}
                            checked={answers[question.id] === option}
                            onChange={() => setAnswer(question.id, option)}
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                  {question.type === 'text' ? (
                    <textarea
                      value={typeof answers[question.id] === 'string' ? String(answers[question.id]) : ''}
                      onChange={(event) => setAnswer(question.id, event.target.value)}
                      placeholder={question.placeholder}
                    />
                  ) : null}
                </div>
              ))}
            </section>
          ))}
        </main>

        <footer className="portal-evaluation-submit-area">
          <p><strong>Obrigado pela sua participação.</strong><br />Suas respostas serão usadas exclusivamente para melhoria contínua dos treinamentos Holand.</p>
          <button type="submit" className="portal-evaluation-submit" disabled={saving}>
            {saving ? 'Enviando...' : 'Enviar avaliação ›'}
          </button>
        </footer>
      </form>
    </section>
  );
}
