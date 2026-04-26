type FinanceAssistantTranscriptionInput = {
  audio_base64: string;
  mime_type: string;
};

type OpenAiTranscriptionResponse = {
  text?: string;
};

function readOpenAiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() || process.env.OPENAI_KEY?.trim() || '';
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

export async function transcribeFinanceAssistantAudio(input: FinanceAssistantTranscriptionInput) {
  const apiKey = readOpenAiApiKey();
  if (!apiKey) {
    throw new Error('Transcrição por voz ainda não está configurada no servidor.');
  }

  const audioBuffer = Buffer.from(input.audio_base64, 'base64');
  if (audioBuffer.length < 512) {
    throw new Error('Áudio muito curto para transcrição.');
  }

  const mimeType = input.mime_type.trim() || 'audio/webm';
  const fileName = `finance-whisper.${extensionFromMimeType(mimeType)}`;
  const form = new FormData();
  form.set('model', process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || 'gpt-4o-mini-transcribe');
  form.set('language', 'pt');
  form.set('response_format', 'json');
  form.set('file', new Blob([audioBuffer], { type: mimeType }), fileName);

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Falha na transcrição por voz: ${raw || response.statusText}`);
  }

  let parsed: OpenAiTranscriptionResponse;
  try {
    parsed = JSON.parse(raw) as OpenAiTranscriptionResponse;
  } catch {
    throw new Error('A transcrição voltou em um formato inesperado.');
  }

  const transcript = parsed.text?.trim() || '';
  if (!transcript) {
    throw new Error('Não consegui entender o áudio.');
  }

  return { transcript };
}
