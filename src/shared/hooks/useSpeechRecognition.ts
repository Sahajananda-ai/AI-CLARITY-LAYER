import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Voice input via the browser's SpeechRecognition (webkit-prefixed in
 * Chromium). Fully on-device/browser — no keys, no network model. Falls back
 * gracefully when the API is missing (Firefox, some Safari builds).
 */

// Minimal structural types for the vendor-prefixed Speech API.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechError = 'unsupported' | 'denied' | 'no-speech' | 'error';

export function useSpeechRecognition(lang: 'en' | 'hi' | 'kn', onFinal: (transcript: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<SpeechError | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;

  const supported = Boolean(getCtor());

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setError('unsupported');
      return;
    }
    setError(null);
    setInterim('');

    // Fresh instance per session — reused instances silently die in Chromium.
    const recognition = new Ctor();
    recognitionRef.current = recognition;
    recognition.lang = lang === 'hi' ? 'hi-IN' : lang === 'kn' ? 'kn-IN' : 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onresult = event => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          const transcript = result[0].transcript.trim();
          if (transcript) finalRef.current(transcript);
        } else {
          interimText += result[0].transcript;
        }
      }
      setInterim(interimText);
    };
    recognition.onerror = event => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setError('denied');
      else if (event.error === 'no-speech') setError('no-speech');
      else setError('error');
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      setInterim('');
    };

    try {
      recognition.start();
    } catch {
      setError('error');
      setListening(false);
    }
  }, [lang]);

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
    },
    []
  );

  return { supported, listening, interim, error, start, stop, clearError: () => setError(null) };
}

/** Speak text aloud through the browser's SpeechSynthesis engine. */
export function speak(text: string, lang: 'en' | 'hi' | 'kn'): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'hi' ? 'hi-IN' : lang === 'kn' ? 'kn-IN' : 'en-IN';
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
}
