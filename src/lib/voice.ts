// Voice in (Web Speech recognition) and voice out (speech synthesis). Both run
// in the browser, so they cost nothing and audio never leaves the device except
// through the browser's own recognizer.

import { useCallback, useEffect, useRef, useState } from 'react';

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function recognitionCtor(): (new () => RecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const voiceInputSupported = () => typeof window !== 'undefined' && recognitionCtor() !== null;
export const voiceOutputSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

// Listens for one utterance; calls onFinal with the transcript when she pauses.
export function useSpeechInput(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<RecognitionLike | null>(null);
  const finalRef = useRef('');
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const stop = useCallback(() => recRef.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recRef.current) return;
    window.speechSynthesis?.cancel();
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    finalRef.current = '';
    rec.onresult = (e) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interimText += r[0].transcript;
      }
      setInterim(finalRef.current + interimText);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('Microphone access is blocked. Allow it in your browser settings.');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') setError(`Voice input error: ${e.error}`);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      setInterim('');
      const text = finalRef.current.trim();
      if (text) onFinalRef.current(text);
    };
    recRef.current = rec;
    setError(null);
    setListening(true);
    rec.start();
  }, []);

  useEffect(() => () => recRef.current?.abort(), []);

  return { listening, interim, error, start, stop };
}

// Turns markdown-ish chat text into something pleasant to hear.
export function speakable(text: string): string {
  return text
    .replace(/\*\*|__|`|#+\s/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\$(\d[\d,.]*)\s?K\b/gi, '$1 thousand dollars')
    .replace(/\$(\d[\d,.]*)\s?M\b/gi, '$1 million dollars')
    .replace(/(\d)x\b/g, '$1 times')
    .replace(/\bSDE\b/g, 'S D E')
    .replace(/\bEBITDA\b/g, 'ee-bit-dah')
    .replace(/\s+/g, ' ')
    .trim();
}

let cachedVoice: SpeechSynthesisVoice | null | undefined;
function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  if (!voices.length) return null; // voices load async; try again next time
  const preferred = [/natural/i, /neural/i, /premium|enhanced/i, /samantha|ava|allison|aria|jenny/i, /google us english/i];
  for (const re of preferred) {
    const v = voices.find((x) => re.test(x.name) && x.lang === 'en-US') ?? voices.find((x) => re.test(x.name));
    if (v) return (cachedVoice = v);
  }
  return (cachedVoice = voices.find((v) => v.lang === 'en-US') ?? voices[0]);
}

// Speaks streamed text sentence by sentence, so she hears the reply while it
// is still being written.
export class SentenceSpeaker {
  private buffer = '';
  private pending = 0;
  private finished = false;
  constructor(private onIdle: () => void) {}

  push(delta: string) {
    this.buffer += delta;
    // Shortest prefix ending in sentence punctuation + whitespace (so "$1.56M"
    // stays whole), or a line break. Anchored so nothing is ever skipped.
    const re = /^[\s\S]*?[.!?]+["')\]]*\s+|^[^\n]*\n+/;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.buffer))) {
      this.say(m[0]);
      this.buffer = this.buffer.slice(m[0].length);
    }
  }

  end() {
    if (this.buffer.trim()) this.say(this.buffer);
    this.buffer = '';
    this.finished = true;
    if (this.pending === 0) this.onIdle();
  }

  cancel() {
    this.finished = false;
    this.pending = 0;
    this.buffer = '';
    window.speechSynthesis.cancel();
  }

  private say(raw: string) {
    const text = speakable(raw);
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.03;
    this.pending++;
    const done = () => {
      this.pending = Math.max(0, this.pending - 1);
      if (this.pending === 0 && this.finished) this.onIdle();
    };
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
  }
}

export function speakOnce(text: string) {
  window.speechSynthesis.cancel();
  const s = new SentenceSpeaker(() => {});
  s.push(text + '\n');
  s.end();
}
