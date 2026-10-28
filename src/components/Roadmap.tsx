import { Circle, CircleCheck, CircleDot, MessageCircle, Trash2 } from 'lucide-react';
import type { ActionItem, AppState, TaskPhase, TaskStatus } from '../lib/types';
import { formatMoney } from '../lib/valuation';
import { Card, Meter, askCoach } from './ui';

const PHASES: { id: TaskPhase; title: string; when: string; blurb: string }[] = [
  { id: 'clean_up', title: '1 · Get the house in order', when: 'Months 0–3', blurb: 'Books, add-backs, leases, legal. Makes your numbers believable.' },
  { id: 'grow', title: '2 · Grow the number', when: 'Months 3–12', blurb: 'Retention, pricing, full classes, a GM. Raises earnings and the multiple.' },
  { id: 'package', title: '3 · Package the business', when: 'Months 9–14', blurb: 'Data room, quality of earnings, choosing an advisor.' },
  { id: 'sell', title: '4 · Go to market', when: 'Months 12–18+', blurb: 'Buyers, offers, diligence, closing.' },
];

const NEXT: Record<TaskStatus, TaskStatus> = { todo: 'doing', doing: 'done', done: 'todo' };
const ICON = { todo: Circle, doing: CircleDot, done: CircleCheck };
const STATUS_LABEL = { todo: 'To do', doing: 'In progress', done: 'Done' };

export function Roadmap({ state, update }: { state: AppState; update: (fn: (s: AppState) => void) => void }) {
  const done = state.tasks.filter((t) => t.status === 'done').length;
  const timeline = state.profile.sellTimelineMonths;
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">
              {done} of {state.tasks.length} steps done
            </p>
            <div className="mt-2">
              <Meter value={state.tasks.length ? done / state.tasks.length : 0} label="Roadmap progress" />
            </div>
          </div>
          <p className="text-sm text-ink-2">{timeline ? `Target: ready to sell in ~${timeline} months` : 'Tell your coach your ideal timeline to pace the plan.'}</p>
        </div>
      </Card>
      {PHASES.map((phase) => {
        const tasks = state.tasks
          .filter((t) => t.phase === phase.id)
          .sort((a, b) => (a.targetMonth ?? 99) - (b.targetMonth ?? 99));
        const phaseDone = tasks.filter((t) => t.status === 'done').length;
        return (
          <Card
            key={phase.id}
            title={
              <span>
                {phase.title}
                <span className="ml-2 text-xs font-normal text-ink-3">{phase.when}</span>
              </span>
            }
            action={<span className="tabular text-xs text-ink-3">{phaseDone}/{tasks.length}</span>}
          >
            <p className="-mt-2 mb-3 text-sm text-ink-2">{phase.blurb}</p>
            <ul className="divide-y divide-line">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} update={update} />
              ))}
              {tasks.length === 0 && <li className="py-2 text-sm text-ink-3">Nothing here yet.</li>}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function TaskRow({ task: t, update }: { task: ActionItem; update: (fn: (s: AppState) => void) => void }) {
  const Icon = ICON[t.status];
  const setStatus = (status: TaskStatus) =>
    update((s) => {
      const task = s.tasks.find((x) => x.id === t.id);
      if (task) task.status = status;
    });
  return (
    <li className="flex gap-3 py-3">
      <button
        type="button"
        onClick={() => setStatus(NEXT[t.status])}
        aria-label={`${STATUS_LABEL[t.status]} — click to change`}
        title={`${STATUS_LABEL[t.status]} — click to change`}
        className={`mt-0.5 shrink-0 ${t.status === 'done' ? 'text-good-ink' : t.status === 'doing' ? 'text-brand' : 'text-ink-3'}`}
      >
        <Icon size={20} />
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${t.status === 'done' ? 'text-ink-3 line-through' : 'text-ink'}`}>{t.title}</p>
        <p className="mt-0.5 text-xs text-ink-3">{t.why}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          {t.targetMonth !== undefined && <span>Month {t.targetMonth}</span>}
          {t.effort && <span>{t.effort} effort</span>}
          {t.estimatedValueImpact ? <span className="font-semibold text-ink-2">+{formatMoney(t.estimatedValueImpact)} value</span> : null}
          {t.source === 'coach' && <span className="rounded bg-brand-soft px-1.5 py-0.5 font-medium text-brand">from your coach</span>}
          <button
            type="button"
            onClick={() => askCoach(`Help me with this roadmap step: "${t.title}". What exactly should I do first?`)}
            className="inline-flex items-center gap-1 font-semibold text-brand"
          >
            <MessageCircle size={13} /> Help me with this
          </button>
          {t.source === 'coach' && (
            <button
              type="button"
              aria-label="Delete task"
              onClick={() => update((s) => void (s.tasks = s.tasks.filter((x) => x.id !== t.id)))}
              className="text-ink-3 hover:text-critical-ink"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
