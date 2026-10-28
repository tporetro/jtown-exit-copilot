// Conversation controller: sends turns to the coach, streams the reply into the
// transcript, applies state changes the coach makes, and drives voice
// (read replies aloud sentence by sentence; in hands-free mode, listen again
// when the coach finishes speaking).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState } from './types';
import { PasscodeError, streamChat, type View } from './api';
import { newId, type ChatMessage } from './store';
import { SentenceSpeaker, useSpeechInput, voiceOutputSupported } from './voice';

const PREFS_KEY = 'jtown-exit:voice';

function loadPrefs(): { speak: boolean; handsFree: boolean } {
  try {
    return { speak: false, handsFree: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return { speak: false, handsFree: false };
  }
}

export function useCoach(opts: {
  chat: ChatMessage[];
  setChat: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  getState: () => AppState;
  setState: (s: AppState) => void;
  onView: (v: View) => void;
  onNeedPasscode: () => void;
}) {
  const { chat, setChat, getState, setState, onView, onNeedPasscode } = opts;
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);
  const abortRef = useRef<AbortController | null>(null);
  const speakerRef = useRef<SentenceSpeaker | null>(null);
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  const sendRef = useRef<(text: string, o?: { hidden?: boolean }) => void>(() => {});
  const speech = useSpeechInput((text) => sendRef.current(text));
  const listenAgain = useRef(speech.start);
  listenAgain.current = speech.start;

  const send = useCallback(
    async (text: string, o: { hidden?: boolean } = {}) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      abortRef.current?.abort();
      speakerRef.current?.cancel();

      const userMsg: ChatMessage = { id: newId(), role: 'user', text: trimmed, hidden: o.hidden };
      const reply: ChatMessage = { id: newId(), role: 'assistant', text: '' };
      const history = [...chatRef.current.filter((m) => !m.error), userMsg];
      setChat([...chatRef.current, userMsg, reply]);
      setBusy(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const handsFreeAfter = () => {
        if (prefsRef.current.handsFree && !ctrl.signal.aborted) setTimeout(() => listenAgain.current(), 250);
      };
      const speaker =
        prefsRef.current.speak && voiceOutputSupported() ? new SentenceSpeaker(handsFreeAfter) : null;
      speakerRef.current = speaker;

      let acc = '';
      const patch = (fields: Partial<ChatMessage>) =>
        setChat((all) => all.map((m) => (m.id === reply.id ? { ...m, ...fields } : m)));
      try {
        await streamChat(
          history.map((m) => ({ role: m.role, text: m.text })),
          getState(),
          (e) => {
            if (e.type === 'text') {
              acc += e.text;
              patch({ text: acc });
              speaker?.push(e.text);
            } else if (e.type === 'state') setState(e.state);
            else if (e.type === 'view') onView(e.view);
            else if (e.type === 'error') {
              acc += (acc ? '\n\n' : '') + `⚠️ ${e.message}`;
              patch({ text: acc, error: !acc.replace(/⚠️.*/s, '').trim() });
            }
          },
          ctrl.signal,
        );
        if (!acc.trim()) patch({ text: '…', error: true });
        if (speaker) speaker.end();
        else handsFreeAfter();
      } catch (err) {
        if (ctrl.signal.aborted) return;
        if (err instanceof PasscodeError) onNeedPasscode();
        patch({ text: `⚠️ ${err instanceof Error ? err.message : 'Could not reach the coach.'}`, error: true });
        speaker?.cancel();
      } finally {
        if (abortRef.current === ctrl) {
          abortRef.current = null;
          setBusy(false);
        }
      }
    },
    [getState, setChat, setState, onView, onNeedPasscode],
  );
  sendRef.current = send;

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    speakerRef.current?.cancel();
    speech.stop();
    setBusy(false);
  }, [speech]);

  const setSpeak = (speak: boolean) => {
    if (!speak) speakerRef.current?.cancel();
    setPrefs((p) => ({ ...p, speak, handsFree: speak ? p.handsFree : false }));
  };
  const setHandsFree = (handsFree: boolean) => {
    setPrefs((p) => ({ ...p, handsFree, speak: handsFree ? true : p.speak }));
    if (handsFree && !busy) speech.start();
    if (!handsFree) speech.stop();
  };

  return { send, stop, busy, speech, prefs, setSpeak, setHandsFree };
}
