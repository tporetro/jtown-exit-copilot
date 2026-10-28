import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, FileText, LayoutDashboard, ListChecks, Mic, MoreHorizontal, Store, X } from 'lucide-react';
import type { AppState } from './lib/types';
import { exportBackup, readBackup, usePersistentState } from './lib/store';
import { checkPasscode, fetchHealth, getPasscode, setPasscode, type Health, type View } from './lib/api';
import { useCoach } from './lib/useCoach';
import { computeValuation, formatMoney, type Lever } from './lib/valuation';
import { initialState } from './data/roadmap';
import { setAskHandler } from './components/ui';
import { Overview } from './components/Overview';
import { Locations } from './components/Locations';
import { Roadmap } from './components/Roadmap';
import { Documents } from './components/Documents';
import { Learn } from './components/Learn';
import { CoachPanel } from './components/CoachPanel';
import { voiceInputSupported } from './lib/voice';

const TABS: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'locations', label: 'Studios', icon: Store },
  { id: 'roadmap', label: 'Roadmap', icon: ListChecks },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'learn', label: 'Learn', icon: BookOpen },
];

const KICKOFF =
  '(Stephanie just opened the Exit Copilot for the first time. Greet her warmly by name, explain in two or three short sentences what you will do together — learn the business, show what it is worth today, and build a step-by-step plan to raise the price — and that she can talk or type and upload documents any time. Then ask your first question.)';

export default function App() {
  const { state, setState, chat, setChat, reset } = usePersistentState();
  const stateRef = useRef(state);
  stateRef.current = state;
  const [view, setView] = useState<View>('overview');
  const [coachOpen, setCoachOpen] = useState(false); // mobile sheet
  const [health, setHealth] = useState<Health | null>(null);
  const [askPasscode, setAskPasscode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetchHealth()
      .then(async (h) => {
        setHealth(h);
        // Ask for the passcode up front (and re-ask if a saved one stopped working).
        if (h.passcodeRequired && !(getPasscode() && (await checkPasscode(getPasscode())))) setAskPasscode(true);
      })
      .catch(() => setHealth({ ok: false, aiConfigured: false, passcodeRequired: false }));
  }, []);

  // Local edits go through a mutable draft of the latest state.
  const update = useCallback(
    (fn: (s: AppState) => void) => {
      const next = structuredClone(stateRef.current);
      fn(next);
      stateRef.current = next;
      setState(next);
    },
    [setState],
  );
  const applyServerState = useCallback(
    (s: AppState) => {
      stateRef.current = s;
      setState(s);
    },
    [setState],
  );

  const coach = useCoach({
    chat,
    setChat,
    getState: () => stateRef.current,
    setState: applyServerState,
    onView: setView,
    onNeedPasscode: () => setAskPasscode(true),
  });

  const ask = useCallback(
    (q: string) => {
      setCoachOpen(true);
      coach.send(q);
    },
    [coach],
  );
  useEffect(() => setAskHandler(ask), [ask]);

  const start = (mode: 'voice' | 'type') => {
    if (mode === 'voice') coach.setSpeak(true);
    setCoachOpen(true);
    coach.send(KICKOFF, { hidden: true });
  };

  const addLever = (l: Lever) =>
    update((s) => {
      s.tasks.push({
        id: `lever-${l.id}`,
        title: l.title,
        why: l.description,
        phase: l.id === 'books' || l.id === 'lease' || l.id === 'w2' || l.id === 'cash' ? 'clean_up' : 'grow',
        status: 'todo',
        effort: l.effort,
        targetMonth: l.months,
        estimatedValueImpact: Math.round(l.valueImpact),
        source: 'coach',
      });
    });

  const showWelcome = chat.length === 0 && !state.onboardingComplete;
  const v = computeValuation(state.profile);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-line bg-surface px-4 py-3 lg:px-6">
        <div className="min-w-0">
          <p className="font-display text-xl leading-tight text-ink">JTown Exit Copilot</p>
          <p className="truncate text-xs text-ink-3">
            {state.profile.businessName}
            {v.totals.revenue > 0 && <> · est. value {formatMoney(v.value.mid)} · readiness {v.readiness.score}/100</>}
          </p>
        </div>
        <nav className="ml-auto hidden gap-1 md:flex" aria-label="Dashboard sections">
          {TABS.map((t) => (
            <TabButton key={t.id} active={view === t.id} onClick={() => setView(t.id)} icon={t.icon} label={t.label} />
          ))}
        </nav>
        <div className="relative ml-auto md:ml-2">
          <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="More options" className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
            <MoreHorizontal size={20} />
          </button>
          {menuOpen && (
            <Menu
              onClose={() => setMenuOpen(false)}
              onExport={() => exportBackup(state, chat)}
              onImport={async (f) => {
                try {
                  const b = await readBackup(f);
                  reset(b.state, b.chat);
                } catch (e) {
                  alert(e instanceof Error ? e.message : 'Could not import that file.');
                }
              }}
              onReset={() => {
                if (confirm('Erase all numbers, roadmap progress and the conversation from this browser? Export a backup first if you want to keep them.')) {
                  reset(initialState());
                  setView('overview');
                }
              }}
            />
          )}
        </div>
      </header>

      {health && !health.aiConfigured && (
        <div className="border-b border-line bg-brand-soft px-4 py-2 text-sm text-ink">
          The AI coach is offline: the server has no <code>ANTHROPIC_API_KEY</code>. The dashboard and manual editing still work.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto px-4 pt-5 pb-28 lg:px-8 lg:pb-8">
          {showWelcome ? (
            <Welcome onStart={start} />
          ) : (
            <div className="mx-auto max-w-6xl">
              <h1 className="sr-only">{TABS.find((t) => t.id === view)?.label}</h1>
              {view === 'overview' && <Overview state={state} onAddLever={addLever} />}
              {view === 'locations' && <Locations state={state} update={update} />}
              {view === 'roadmap' && <Roadmap state={state} update={update} />}
              {view === 'documents' && (
                <Documents state={state} update={update} onApplied={(msg) => ask(msg)} onNeedPasscode={() => setAskPasscode(true)} />
              )}
              {view === 'learn' && <Learn />}
              <p className="mt-8 text-center text-[11px] text-ink-3">
                Educational planning tool, not financial, tax or legal advice. Confirm decisions with your CPA, attorney and M&A advisor.
              </p>
            </div>
          )}
        </main>

        {/* Desktop: coach is always beside the dashboard. Mobile: full-screen sheet. */}
        <aside
          className={`${coachOpen ? 'fixed inset-0 z-40 flex' : 'hidden'} flex-col bg-surface lg:static lg:z-auto lg:flex lg:w-[420px] lg:shrink-0 lg:border-l lg:border-line`}
          aria-label="Exit coach"
        >
          <button
            type="button"
            onClick={() => setCoachOpen(false)}
            className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-surface-2 text-ink-2 lg:hidden"
            aria-label="Close coach"
          >
            <X size={18} />
          </button>
          <CoachPanel messages={chat} coach={coach} onboarding={!state.onboardingComplete} />
        </aside>
      </div>

      {/* Mobile bottom bar: tabs + coach button */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-line bg-surface px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden" aria-label="Sections">
        {TABS.slice(0, 2).map((t) => (
          <MobileTab key={t.id} active={view === t.id} onClick={() => setView(t.id)} icon={t.icon} label={t.label} />
        ))}
        <button
          type="button"
          onClick={() => setCoachOpen(true)}
          className="-mt-6 grid size-14 place-items-center rounded-full bg-brand text-brand-ink shadow-lg"
          aria-label="Open your coach"
        >
          <Mic size={24} />
        </button>
        {TABS.slice(2, 4).map((t) => (
          <MobileTab key={t.id} active={view === t.id} onClick={() => setView(t.id)} icon={t.icon} label={t.label} />
        ))}
      </nav>
      {/* Desktop-but-narrow (md): floating coach button */}
      <button
        type="button"
        onClick={() => setCoachOpen(true)}
        className="fixed right-5 bottom-5 z-30 hidden items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-brand-ink shadow-lg md:flex lg:hidden"
      >
        <Mic size={18} /> Talk to your coach
      </button>

      {askPasscode && (
        <PasscodeDialog
          onSubmit={async (code) => {
            if (!(await checkPasscode(code))) return false;
            setPasscode(code);
            setAskPasscode(false);
            return true;
          }}
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof LayoutDashboard; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium ${active ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-surface-2'}`}
    >
      <Icon size={16} /> {label}
    </button>
  );
}

function MobileTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof LayoutDashboard; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} className={`flex flex-col items-center gap-0.5 px-2 text-[11px] ${active ? 'text-brand' : 'text-ink-3'}`}>
      <Icon size={20} />
      {label}
    </button>
  );
}

function Menu(props: { onClose: () => void; onExport: () => void; onImport: (f: File) => void; onReset: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const item = 'block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-surface-2';
  const run = (fn: () => void) => () => {
    fn();
    props.onClose();
  };
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={props.onClose} />
      <div className="absolute right-0 top-11 z-50 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
        <button className={item} onClick={run(props.onExport)}>
          Download a backup
        </button>
        <button className={item} onClick={() => fileRef.current?.click()}>
          Restore from backup…
        </button>
        <button className={`${item} text-critical-ink`} onClick={run(props.onReset)}>
          Start over
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onImport(f);
            props.onClose();
          }}
        />
      </div>
    </>
  );
}

function Welcome({ onStart }: { onStart: (mode: 'voice' | 'type') => void }) {
  return (
    <div className="mx-auto max-w-2xl py-6 lg:py-14">
      <p className="text-sm font-semibold tracking-wide text-brand uppercase">Welcome, Stephanie</p>
      <h1 className="mt-2 font-display text-4xl leading-tight text-ink sm:text-5xl">Let's get JTown ready to sell for the best possible price.</h1>
      <p className="mt-4 text-lg text-ink-2">
        Your Exit Coach will ask you about the studios — the way a good advisor would — then show you what the business is worth today, what buyers
        will look for, and exactly what to change to raise the price.
      </p>
      <ol className="mt-8 space-y-4">
        {[
          ['Talk it through', 'Answer questions out loud or by typing. Rough numbers are fine to start.'],
          ['Upload what you have', 'Tax returns, P&Ls, bank statements or Mindbody reports — your coach reads them for you.'],
          ['Follow the plan', 'A step-by-step roadmap with the dollar value of each step. Ask "what does this mean?" any time.'],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand">{i + 1}</span>
            <div>
              <p className="font-semibold text-ink">{t}</p>
              <p className="text-sm text-ink-2">{d}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-10 flex flex-wrap gap-3">
        {voiceInputSupported() && (
          <button type="button" onClick={() => onStart('voice')} className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-3.5 text-base font-semibold text-brand-ink">
            <Mic size={20} /> Start by talking
          </button>
        )}
        <button type="button" onClick={() => onStart('type')} className="rounded-2xl border border-line bg-surface px-6 py-3.5 text-base font-semibold text-ink">
          Start by typing
        </button>
      </div>
      <p className="mt-8 text-xs text-ink-3">
        Your information stays in this browser. Download a backup from the ••• menu. This is an educational planning tool — not financial, tax or
        legal advice.
      </p>
    </div>
  );
}

function PasscodeDialog({ onSubmit }: { onSubmit: (code: string) => Promise<boolean> }) {
  const [code, setCode] = useState('');
  const [wrong, setWrong] = useState(false);
  const [checking, setChecking] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <form
        className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl"
        onSubmit={async (e) => {
          e.preventDefault();
          setChecking(true);
          const ok = await onSubmit(code.trim()).catch(() => false);
          setChecking(false);
          setWrong(!ok);
        }}
      >
        <p className="font-semibold text-ink">Enter the app passcode</p>
        <p className="mt-1 text-sm text-ink-2">You only need to enter it once on this device.</p>
        <input
          autoFocus
          type="password"
          autoComplete="current-password"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setWrong(false);
          }}
          className="mt-4 w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink"
        />
        {wrong && <p className="mt-2 text-sm text-critical-ink">That passcode didn't work. Please try again.</p>}
        <button disabled={checking || !code.trim()} className="mt-4 w-full rounded-xl bg-brand py-2.5 font-semibold text-brand-ink disabled:opacity-50">
          {checking ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
