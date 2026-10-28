import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, MessageCircle, XCircle, MinusCircle } from 'lucide-react';
import { GLOSSARY } from '../data/glossary';

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export type Status = 'good' | 'warning' | 'critical' | 'unknown';

const STATUS_STYLE: Record<Status, { icon: typeof CheckCircle2; label: string; cls: string }> = {
  good: { icon: CheckCircle2, label: 'Strong', cls: 'text-good-ink' },
  warning: { icon: AlertTriangle, label: 'Needs work', cls: 'text-warning-ink' },
  critical: { icon: XCircle, label: 'Priority', cls: 'text-critical-ink' },
  unknown: { icon: MinusCircle, label: 'No data', cls: 'text-ink-3' },
};

// Status always ships with an icon + label, never color alone.
export function StatusTag({ status, label }: { status: Status; label?: string }) {
  const s = STATUS_STYLE[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${s.cls}`}>
      <Icon size={14} aria-hidden />
      {label ?? s.label}
    </span>
  );
}

export function scoreStatus(score: number, known = true): Status {
  if (!known) return 'unknown';
  return score >= 0.7 ? 'good' : score >= 0.45 ? 'warning' : 'critical';
}

// Ask-the-coach hook shared by every "what does this mean?" button.
let askHandler: ((q: string) => void) | null = null;
export function setAskHandler(fn: (q: string) => void) {
  askHandler = fn;
}
export function askCoach(q: string) {
  askHandler?.(q);
}

export function Explain({ term, context }: { term: keyof typeof GLOSSARY; context?: string }) {
  const entry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  if (!entry) return null;
  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`What does ${entry.term} mean?`}
        aria-expanded={open}
        className="rounded-full p-0.5 text-ink-3 hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
      >
        <CircleHelp size={15} />
      </button>
      {open && (
        <span
          role="dialog"
          className="absolute left-1/2 top-7 z-30 block w-72 -translate-x-1/2 rounded-xl border border-line bg-surface p-4 text-left text-sm font-normal text-ink-2 shadow-xl max-sm:fixed max-sm:inset-x-4 max-sm:top-24 max-sm:w-auto max-sm:translate-x-0"
        >
          <span className="block font-semibold text-ink">{entry.term}</span>
          <span className="mt-1 block text-ink">{entry.short}</span>
          <span className="mt-2 block leading-relaxed">{entry.long}</span>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              askCoach(`Explain "${entry.term}" using my own numbers${context ? ` (${context})` : ''}. What does it mean for my sale price, and what should I do about it?`);
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand"
          >
            <MessageCircle size={14} /> Ask my coach about my number
          </button>
        </span>
      )}
    </span>
  );
}

// Horizontal meter. A single series, so one hue; the track is recessive.
export function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-2 w-full rounded-full bg-bar-track">
      <div className="h-2 rounded-full bg-bar transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub, explain }: { label: string; value: string; sub?: string; explain?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-xs font-medium text-ink-3">
        {label}
        {explain}
      </div>
      <div className="tabular mt-1 truncate text-xl font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

export const pct = (v: number | null | undefined, digits = 0) => (v === null || v === undefined ? '—' : `${v.toFixed(digits)}%`);
