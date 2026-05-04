import { afterEach, expect, test, vi } from 'vitest';
import { financeApi } from '../api';

afterEach(() => {
  vi.restoreAllMocks();
});

test('financeApi shows backend transcription errors without raw JSON leakage', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    message: 'A transcrição por IA foi interrompida pelo provedor. Use o texto capturado ou tente gravar novamente.'
  }), { status: 400 }));

  await expect(financeApi.transcribeAssistantAudio({
    audio_base64: 'abc',
    mime_type: 'audio/webm'
  })).rejects.toThrow('A transcrição por IA foi interrompida pelo provedor');
});
