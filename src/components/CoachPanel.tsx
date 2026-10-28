import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Headphones, Mic, MicOff, SendHorizontal, Square, Volume2, VolumeX } from 'lucide-react';
import type { ChatMessage } from '../lib/store';
import type { useCoach } from '../lib/useCoach';
import { speakOnce, voiceInputSupported, voiceOutputSupported } from '../lib/voice';

const SUGGESTIONS_ONBOARDING = ["Let's get started", 'What will you ask me?', 'Can I upload my tax return instead?'];
const SUGGESTIONS = ['What should I work on this week?', 'What is my business worth and why?', 'Who would buy my studios?', 'Explain my readiness score'];

export function CoachPanel({ messages, coach, onboarding }: { messages: ChatMessage[]; coach: ReturnType<typeof useCoach>; onboarding: boolean }) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { speech, busy, prefs } = coach;
  const visible = messages.filter((m) => !m.hidden);
  const canListen = voiceInputSupported();
  const canSpeak = voiceOutputSupported();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const submit = () => {
    if (!draft.trim()) return;
    coach.send(draft);
    setDraft('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 max-lg:pr-14">
        <div>
          <p className="font-display text-lg leading-tight text-ink">Your Exit Coach</p>
          <p className="text-xs text-ink-3">{busy ? 'Thinking…' : speech.listening ? 'Listening…' : 'Ask anything, any time'}</p>
        </div>
        <div className="flex items-center gap-1">
          {canSpeak && (
            <IconToggle on={prefs.speak} onClick={() => coach.setSpeak(!prefs.speak)} label={prefs.speak ? 'Stop reading replies aloud' : 'Read replies aloud'}>
              {prefs.speak ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </IconToggle>
          )}
          {canListen && canSpeak && (
            <IconToggle on={prefs.handsFree} onClick={() => coach.setHandsFree(!prefs.handsFree)} label={prefs.handsFree ? 'Turn off hands-free conversation' : 'Hands-free conversation (talk back and forth)'}>
              <Headphones size={18} />
            </IconToggle>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {visible.length === 0 && (
          <p className="text-sm text-ink-3">Your conversation will appear here. Tap the microphone and just talk, or type below.</p>
        )}
        {visible.map((m) => (
          <Bubble key={m.id} message={m} canSpeak={canSpeak} />
        ))}
        {busy && visible.at(-1)?.role === 'assistant' && !visible.at(-1)?.text && <TypingDots />}
      </div>

      <div className="border-t border-line p-3">
        {!busy && !speech.listening && (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {(onboarding ? SUGGESTIONS_ONBOARDING : SUGGESTIONS).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => coach.send(s)}
                className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-ink-2 hover:border-brand hover:text-brand"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {speech.error && <p className="mb-2 text-xs text-critical-ink">{speech.error}</p>}
        <div className="flex items-end gap-2">
          {canListen && (
            <button
              type="button"
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              aria-label={speech.listening ? 'Stop listening' : 'Talk to your coach'}
              title={speech.listening ? 'Stop listening' : 'Talk to your coach'}
              className={`grid size-12 shrink-0 place-items-center rounded-full ${speech.listening ? 'listening bg-brand text-brand-ink' : 'bg-brand-soft text-brand hover:bg-brand hover:text-brand-ink'}`}
            >
              {speech.listening ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
          )}
          <textarea
            rows={1}
            value={speech.listening ? speech.interim : draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            readOnly={speech.listening}
            placeholder={speech.listening ? 'Listening…' : canListen ? 'Type, or tap the mic and talk' : 'Type your message'}
            className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-3"
          />
          {busy ? (
            <button type="button" onClick={coach.stop} aria-label="Stop" className="grid size-12 shrink-0 place-items-center rounded-full border border-line text-ink-2">
              <Square size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim()}
              aria-label="Send"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-brand-ink disabled:opacity-40"
            >
              <SendHorizontal size={20} />
            </button>
          )}
        </div>
        {!canListen && <p className="mt-2 text-[11px] text-ink-3">Voice input works in Chrome, Edge and Safari.</p>}
      </div>
    </div>
  );
}

function IconToggle({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`grid size-9 place-items-center rounded-full ${on ? 'bg-brand text-brand-ink' : 'text-ink-3 hover:bg-surface-2 hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

function Bubble({ message: m, canSpeak }: { message: ChatMessage; canSpeak: boolean }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-me px-4 py-2.5 text-sm text-me-ink">{m.text}</div>
      </div>
    );
  }
  if (!m.text) return null;
  return (
    <div className="group flex flex-col items-start">
      <div className={`max-w-[92%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed ${m.error ? 'border border-line text-critical-ink' : 'bg-coach text-ink'}`}>
        <RichText text={m.text} />
      </div>
      {canSpeak && !m.error && (
        <button type="button" onClick={() => speakOnce(m.text)} className="mt-1 px-1 text-[11px] text-ink-3 opacity-0 group-hover:opacity-100 focus:opacity-100">
          ▶ Read aloud
        </button>
      )}
    </div>
  );
}

// Minimal, safe formatter for the coach's replies: paragraphs, "- " lists, **bold**.
function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((l) => /^\s*([-•*]|\d+\.)\s+/.test(l))) {
          return (
            <ul key={i} className="my-1 list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*([-•*]|\d+\.)\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className={i ? 'mt-2' : ''}>
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
  );
}

function TypingDots() {
  return (
    <div className="flex gap-1 px-2" aria-label="Coach is thinking">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-2 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  );
}
