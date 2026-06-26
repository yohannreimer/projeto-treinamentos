import { useState } from 'react';
import { api } from '../../services/api';
import type { TaskComment } from '../../services/api';

type Props = {
  taskId: string;
  comments: TaskComment[];
  onAdded: () => void;
};

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

export function TaskComments({ taskId, comments, onAdded }: Props) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      await api.addTaskComment(taskId, body.trim());
      setBody('');
      onAdded();
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Comentários {comments.length > 0 && `(${comments.length})`}
      </div>

      {comments.length === 0 && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 8 }}>Sem comentários.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: comments.length > 0 ? 10 : 0 }}>
        {comments.map((comment) => (
          <div key={comment.id} style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 10px', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>{comment.author_name}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75em' }}>{relativeTime(comment.created_at)}</span>
            </div>
            <div style={{ lineHeight: 1.5, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{comment.body}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void handleSend(); }}
          placeholder="Escreva um comentário... (Ctrl+Enter para enviar)"
          rows={2}
          style={{ padding: '7px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem', resize: 'vertical', fontFamily: 'inherit' }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !body.trim()}
          style={{ padding: '6px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', alignSelf: 'flex-end' }}
        >
          {sending ? 'Enviando...' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}
