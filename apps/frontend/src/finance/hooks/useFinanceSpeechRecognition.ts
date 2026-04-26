import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SpeechRecognitionResultItem = {
  transcript: string;
};

type SpeechRecognitionResult = {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionResultItem;
  [index: number]: SpeechRecognitionResultItem;
};

type SpeechRecognitionResultList = {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function getSpeechRecognitionConstructor() {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function useFinanceSpeechRecognition() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [supported, setSupported] = useState(() => getSpeechRecognitionConstructor() !== null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  useEffect(() => {
    setSupported(getSpeechRecognitionConstructor() !== null);

    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    setTranscript('');
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setSupported(false);
      return;
    }

    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => {
      let nextTranscript = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results.item(index);
        nextTranscript += result.item(0).transcript;
      }
      setTranscript(nextTranscript.trim());
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, []);

  const reset = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
    setTranscript('');
  }, []);

  return useMemo(
    () => ({
      supported,
      listening,
      transcript,
      start,
      stop,
      reset,
      setTranscript
    }),
    [listening, reset, start, stop, supported, transcript]
  );
}
