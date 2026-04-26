type FinanceAssistantTranscriptionInput = {
  audio_base64: string;
  mime_type: string;
};

type OpenAiTranscriptionResponse = {
  text?: string;
};

type OpenRouterChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

function readOpenAiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() || process.env.OPENAI_KEY?.trim() || '';
}

function readOpenRouterApiKey() {
  return process.env.OPENROUTER_API_KEY?.trim() || '';
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

function formatFromMimeType(mimeType: string) {
  const cleanMimeType = mimeType.toLowerCase();
  if (cleanMimeType.includes('mp4')) return 'm4a';
  if (cleanMimeType.includes('mpeg')) return 'mp3';
  if (cleanMimeType.includes('wav')) return 'wav';
  if (cleanMimeType.includes('ogg')) return 'ogg';
  if (cleanMimeType.includes('flac')) return 'flac';
  if (cleanMimeType.includes('aac')) return 'aac';
  return 'webm';
}

function validateAudioInput(input: FinanceAssistantTranscriptionInput) {
  const audioBuffer = Buffer.from(input.audio_base64, 'base64');
  if (audioBuffer.length < 512) {
    throw new Error('Áudio muito curto para transcrição.');
  }
  return {
    audioBuffer,
    mimeType: input.mime_type.trim() || 'audio/webm'
  };
}

function extractOpenRouterText(parsed: OpenRouterChatCompletionResponse) {
  const content = parsed.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => (item.type === 'text' || !item.type ? item.text?.trim() ?? '' : ''))
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  return '';
}

async function transcribeWithOpenAi(input: FinanceAssistantTranscriptionInput) {
  const apiKey = readOpenAiApiKey();
  const { audioBuffer, mimeType } = validateAudioInput(input);
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

async function transcribeWithOpenRouter(input: FinanceAssistantTranscriptionInput) {
  const apiKey = readOpenRouterApiKey();
  const { mimeType } = validateAudioInput(input);
  const model = process.env.OPENROUTER_AUDIO_MODEL?.trim() || 'google/gemini-2.5-flash';

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL?.trim() || 'http://localhost:5173',
      'X-Title': process.env.OPENROUTER_APP_NAME?.trim() || 'Orquestrador Financeiro'
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Transcreva este áudio em português do Brasil. Responda somente com o texto transcrito, sem comentários.'
            },
            {
              type: 'input_audio',
              input_audio: {
                data: input.audio_base64,
                format: formatFromMimeType(mimeType)
              },
              inputAudio: {
                data: input.audio_base64,
                format: formatFromMimeType(mimeType)
              }
            }
          ]
        }
      ],
      temperature: 0,
      stream: false
    })
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Falha na transcrição por voz via OpenRouter: ${raw || response.statusText}`);
  }

  let parsed: OpenRouterChatCompletionResponse;
  try {
    parsed = JSON.parse(raw) as OpenRouterChatCompletionResponse;
  } catch {
    throw new Error('A transcrição do OpenRouter voltou em um formato inesperado.');
  }

  const transcript = extractOpenRouterText(parsed);
  if (!transcript) {
    throw new Error('Não consegui entender o áudio.');
  }

  return { transcript };
}

export async function transcribeFinanceAssistantAudio(input: FinanceAssistantTranscriptionInput) {
  const openRouterKey = readOpenRouterApiKey();
  const openAiKey = readOpenAiApiKey();
  if (openRouterKey) {
    return transcribeWithOpenRouter(input);
  }
  if (openAiKey) {
    return transcribeWithOpenAi(input);
  }

  throw new Error('Transcrição por voz ainda não está configurada no servidor.');
}
