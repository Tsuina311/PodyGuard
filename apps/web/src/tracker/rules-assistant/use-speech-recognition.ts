import { useEffect, useRef, useState } from 'react';

export type SpeechErrorCode =
  | 'unsupported'
  | 'denied'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'failed';

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export type SpeechRecognitionFactory = () => SpeechRecognitionLike;

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_TRANSCRIPT = 500;

interface SpeechWindow {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}

export function speechRecognitionConstructor(
  target: SpeechWindow | undefined = typeof window === 'undefined'
    ? undefined
    : (window as SpeechWindow),
): (new () => SpeechRecognitionLike) | null {
  if (!target) {
    return null;
  }
  return target.SpeechRecognition ?? target.webkitSpeechRecognition ?? null;
}

function errorCode(reason: string): SpeechErrorCode {
  switch (reason) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'denied';
    case 'no-speech':
      return 'no-speech';
    case 'audio-capture':
      return 'audio-capture';
    case 'network':
      return 'network';
    case 'aborted':
      return 'aborted';
    default:
      return 'failed';
  }
}

function transcriptFrom(event: {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}): string {
  const last = event.results[event.results.length - 1];
  const alternative = last?.[0];
  return (alternative?.transcript ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TRANSCRIPT);
}

/**
 * One-shot Web Speech recognition. Nothing listens until `start` runs from a
 * user gesture. Audio is not stored. Browser speech services may still send
 * audio to the browser vendor.
 */
export function useSpeechRecognition({
  lang,
  onFinal,
  createRecognition,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  lang: string;
  onFinal: (transcript: string) => void;
  createRecognition?: SpeechRecognitionFactory;
  timeoutMs?: number;
}): {
  supported: boolean;
  listening: boolean;
  error: SpeechErrorCode | null;
  start: () => void;
  stop: () => void;
} {
  const supported =
    createRecognition !== undefined || speechRecognitionConstructor() !== null;
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<SpeechErrorCode | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const timeoutRef = useRef<number | null>(null);
  const userStop = useRef(false);

  function clearTimer() {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function release(recognition: SpeechRecognitionLike | null) {
    if (!recognition) {
      return;
    }
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      // The session may already have ended.
    }
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      activeRef.current = false;
      clearTimer();
      release(recognitionRef.current);
      recognitionRef.current = null;
    };
  }, []);

  function stop() {
    if (!activeRef.current && !recognitionRef.current) {
      return;
    }
    userStop.current = true;
    generation.current += 1;
    activeRef.current = false;
    clearTimer();
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    setListening(false);
    release(recognition);
  }

  function start() {
    if (activeRef.current) {
      return;
    }
    const factory =
      createRecognition ??
      (() => {
        const Ctor = speechRecognitionConstructor();
        if (!Ctor) {
          throw new Error('unsupported');
        }
        return new Ctor();
      });
    let recognition: SpeechRecognitionLike;
    try {
      recognition = factory();
    } catch {
      if (mounted.current) {
        setError('unsupported');
        setListening(false);
      }
      return;
    }

    userStop.current = false;
    generation.current += 1;
    const token = generation.current;
    activeRef.current = true;
    release(recognitionRef.current);
    recognitionRef.current = recognition;
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    setError(null);
    setListening(true);

    recognition.onresult = (event) => {
      if (!mounted.current || token !== generation.current) {
        return;
      }
      const transcript = transcriptFrom(event);
      if (!transcript) {
        return;
      }
      onFinalRef.current(transcript);
    };
    recognition.onerror = (event) => {
      if (!mounted.current || token !== generation.current) {
        return;
      }
      const code = errorCode(event.error);
      if (code === 'aborted' && userStop.current) {
        return;
      }
      activeRef.current = false;
      clearTimer();
      setListening(false);
      setError(code);
    };
    recognition.onend = () => {
      if (!mounted.current || token !== generation.current) {
        return;
      }
      activeRef.current = false;
      clearTimer();
      setListening(false);
    };

    try {
      recognition.start();
    } catch {
      activeRef.current = false;
      recognitionRef.current = null;
      if (mounted.current && token === generation.current) {
        setListening(false);
        setError('failed');
      }
      return;
    }

    clearTimer();
    timeoutRef.current = window.setTimeout(() => {
      if (!mounted.current || token !== generation.current) {
        return;
      }
      generation.current += 1;
      activeRef.current = false;
      setListening(false);
      setError('timeout');
      release(recognition);
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
    }, timeoutMs);
  }

  return { supported, listening, error, start, stop };
}
