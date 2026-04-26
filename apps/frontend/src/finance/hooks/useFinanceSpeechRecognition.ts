import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { financeApi } from '../api';

type RecorderWindow = Window & {
  MediaRecorder?: typeof MediaRecorder;
};

function isAudioRecorderSupported() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const recorderWindow = window as RecorderWindow;
  return Boolean(recorderWindow.MediaRecorder && navigator.mediaDevices?.getUserMedia);
}

function preferredMimeType() {
  const recorderWindow = window as RecorderWindow;
  const Recorder = recorderWindow.MediaRecorder;
  if (!Recorder) return 'audio/webm';

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
  ];
  return candidates.find((candidate) => Recorder.isTypeSupported(candidate)) ?? '';
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}

export function useFinanceSpeechRecognition() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [supported, setSupported] = useState(() => isAudioRecorderSupported());
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    setSupported(isAudioRecorderSupported());

    return () => {
      recorderRef.current?.stop();
      cleanupStream();
    };
  }, [cleanupStream]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) {
      setListening(false);
      cleanupStream();
      return;
    }

    if (recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      setListening(false);
      cleanupStream();
    }
  }, [cleanupStream]);

  const start = useCallback(async () => {
    setTranscript('');
    setError('');
    setProcessing(false);

    if (!isAudioRecorderSupported()) {
      setSupported(false);
      setError('Seu navegador não liberou gravação por microfone nesta página.');
      return;
    }

    try {
      recorderRef.current?.stop();
      cleanupStream();
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = preferredMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setListening(false);
        setProcessing(false);
        setError('Não consegui gravar o áudio. Confira a permissão do microfone.');
        cleanupStream();
      };

      recorder.onstop = () => {
        setListening(false);
        cleanupStream();
        const audioBlob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        chunksRef.current = [];

        if (audioBlob.size < 512) {
          setError('Áudio muito curto. Grave um comando um pouco maior.');
          return;
        }

        setProcessing(true);
        blobToBase64(audioBlob)
          .then((audioBase64) => financeApi.transcribeAssistantAudio({
            audio_base64: audioBase64,
            mime_type: audioBlob.type || 'audio/webm'
          }))
          .then((result) => {
            setTranscript(result.transcript);
          })
          .catch((transcriptionError) => {
            setError(transcriptionError instanceof Error
              ? transcriptionError.message
              : 'Falha ao transcrever o áudio.');
          })
          .finally(() => setProcessing(false));
      };

      recorder.start();
      setSupported(true);
      setListening(true);
    } catch {
      setListening(false);
      setProcessing(false);
      setError('Microfone não disponível. Libere a permissão do navegador e tente de novo.');
      cleanupStream();
    }
  }, [cleanupStream]);

  const reset = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    cleanupStream();
    chunksRef.current = [];
    setListening(false);
    setProcessing(false);
    setTranscript('');
    setError('');
  }, [cleanupStream]);

  return useMemo(
    () => ({
      supported,
      listening,
      processing,
      transcript,
      error,
      start,
      stop,
      reset,
      setTranscript
    }),
    [error, listening, processing, reset, start, stop, supported, transcript]
  );
}
