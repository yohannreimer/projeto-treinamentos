import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { financeApi } from '../api';

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: {
      transcript: string;
    };
  }>;
};

type RecorderWindow = Window & {
  MediaRecorder?: typeof MediaRecorder;
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
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
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const finalLiveTranscriptRef = useRef('');
  const latestTranscriptRef = useRef('');
  const manualTranscriptEditedRef = useRef(false);
  const pausedRef = useRef(false);
  const manuallyStoppedRef = useRef(false);
  const [supported, setSupported] = useState(() => isAudioRecorderSupported());
  const [listening, setListening] = useState(false);
  const [paused, setPaused] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');

  const updateTranscript = useCallback((value: string) => {
    manualTranscriptEditedRef.current = true;
    finalLiveTranscriptRef.current = value;
    latestTranscriptRef.current = value;
    setTranscript(value);
  }, []);

  const setCapturedTranscript = useCallback((value: string) => {
    latestTranscriptRef.current = value;
    setTranscript(value);
  }, []);

  const stopRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      // Chrome throws when stop is called after the recognition engine has ended.
    }
  }, []);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startLiveRecognition = useCallback(() => {
    const recorderWindow = window as RecorderWindow;
    const Recognition = recorderWindow.SpeechRecognition ?? recorderWindow.webkitSpeechRecognition;
    if (!Recognition) return;

    stopRecognition();

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'pt-BR';
    recognition.onresult = (event) => {
      let interimTranscript = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const part = event.results[index]?.[0]?.transcript ?? '';
        if (!part) continue;
        if (event.results[index]?.isFinal) {
          finalLiveTranscriptRef.current = `${finalLiveTranscriptRef.current} ${part}`.trim();
        } else {
          interimTranscript = `${interimTranscript} ${part}`.trim();
        }
      }
      setCapturedTranscript(`${finalLiveTranscriptRef.current} ${interimTranscript}`.trim());
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (!pausedRef.current && !manuallyStoppedRef.current && recorderRef.current?.state === 'recording') {
        try {
          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          // Audio recording remains active even when live captions cannot restart.
        }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      recognitionRef.current = null;
    }
  }, [stopRecognition]);

  useEffect(() => {
    setSupported(isAudioRecorderSupported());

    return () => {
      manuallyStoppedRef.current = true;
      recorderRef.current?.stop();
      stopRecognition();
      cleanupStream();
    };
  }, [cleanupStream, stopRecognition]);

  const stop = useCallback(() => {
    manuallyStoppedRef.current = true;
    stopRecognition();
    const recorder = recorderRef.current;
    if (!recorder) {
      setListening(false);
      setPaused(false);
      pausedRef.current = false;
      cleanupStream();
      return;
    }

    if (recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      setListening(false);
      setPaused(false);
      pausedRef.current = false;
      cleanupStream();
    }
  }, [cleanupStream, stopRecognition]);

  const start = useCallback(async () => {
    setTranscript('');
    latestTranscriptRef.current = '';
    setError('');
    setProcessing(false);
    setPaused(false);
    pausedRef.current = false;
    manuallyStoppedRef.current = false;
    finalLiveTranscriptRef.current = '';
    manualTranscriptEditedRef.current = false;

    if (!isAudioRecorderSupported()) {
      setSupported(false);
      setError('Seu navegador não liberou gravação por microfone nesta página.');
      return;
    }

    try {
      recorderRef.current?.stop();
      stopRecognition();
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
        setPaused(false);
        pausedRef.current = false;
        setProcessing(false);
        setError('Não consegui gravar o áudio. Confira a permissão do microfone.');
        stopRecognition();
        cleanupStream();
      };

      recorder.onstop = () => {
        setListening(false);
        setPaused(false);
        pausedRef.current = false;
        stopRecognition();
        cleanupStream();
        const audioBlob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        chunksRef.current = [];

        if (audioBlob.size < 512) {
          if (!finalLiveTranscriptRef.current.trim()) {
            setError('Áudio muito curto. Grave um comando um pouco maior.');
          }
          return;
        }

        setProcessing(true);
        blobToBase64(audioBlob)
          .then((audioBase64) => financeApi.transcribeAssistantAudio({
            audio_base64: audioBase64,
            mime_type: audioBlob.type || 'audio/webm'
          }))
          .then((result) => {
            const nextTranscript = result.transcript.trim();
            if (nextTranscript && !manualTranscriptEditedRef.current) {
              finalLiveTranscriptRef.current = nextTranscript;
              setCapturedTranscript(nextTranscript);
            }
          })
          .catch((transcriptionError) => {
            if (!latestTranscriptRef.current.trim()) {
              const rawMessage = transcriptionError instanceof Error ? transcriptionError.message : '';
              const friendlyMessage = rawMessage === 'terminated' || rawMessage.includes('"terminated"')
                ? 'A transcrição por IA foi interrompida. Tente novamente ou escreva o comando capturado.'
                : rawMessage || 'Falha ao transcrever o áudio.';
              setError(friendlyMessage);
            }
          })
          .finally(() => setProcessing(false));
      };

      recorder.start();
      setSupported(true);
      setListening(true);
      startLiveRecognition();
    } catch {
      setListening(false);
      setPaused(false);
      pausedRef.current = false;
      setProcessing(false);
      setError('Microfone não disponível. Libere a permissão do navegador e tente de novo.');
      stopRecognition();
      cleanupStream();
    }
  }, [cleanupStream, startLiveRecognition, stopRecognition]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.pause();
    pausedRef.current = true;
    setPaused(true);
    stopRecognition();
  }, [stopRecognition]);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    recorder.resume();
    pausedRef.current = false;
    manuallyStoppedRef.current = false;
    setPaused(false);
    startLiveRecognition();
  }, [startLiveRecognition]);

  const reset = useCallback(() => {
    manuallyStoppedRef.current = true;
    if (recorderRef.current?.state === 'recording' || recorderRef.current?.state === 'paused') {
      recorderRef.current.stop();
    }
    stopRecognition();
    cleanupStream();
    chunksRef.current = [];
    finalLiveTranscriptRef.current = '';
    manualTranscriptEditedRef.current = false;
    pausedRef.current = false;
    setListening(false);
    setPaused(false);
    setProcessing(false);
    setTranscript('');
    latestTranscriptRef.current = '';
    setError('');
  }, [cleanupStream, stopRecognition]);

  return useMemo(
    () => ({
      supported,
      listening,
      paused,
      processing,
      transcript,
      error,
      start,
      stop,
      pause,
      resume,
      reset,
      setTranscript: updateTranscript
    }),
    [error, listening, pause, paused, processing, reset, resume, start, stop, supported, transcript, updateTranscript]
  );
}
