import { ArrowRight, Sparkles, Target } from 'lucide-react';
import type { AppState } from '../lib/types';
import { computeLevers, computeValuation, formatMoney, type Lever } from '../lib/valuation';
import { Card, Explain, Meter, Stat, StatusTag, askCoach, pct, scoreStatus } from './ui';

export function Overview({ state, onAddLever }: { state: AppState; onAddLever: (l: Lever) => void }) {
  const v = computeValuation(state.profile);
  const { levers, combinedValue } = computeLevers(state.profile);
  const target = state.profile.targetPrice;
  const hasNumbers = v.totals.revenue > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {v.completeness < 1 && <CompletenessCard state={state} />}

      {hasNumbers ? (
        <ValueHero
          low={v.value.low}
          mid={v.value.mid}
          high={v.value.high}
          target={target}
          potential={levers.length ? combinedValue : undefined}
          lensLabel={v.lensLabel}
          basis={v.basis}
          multiple={v.multiple.mid}
        />
      ) : (
        <Card className="lg:col-span-2">
          <p className="font-display text-2xl text-ink">Your sale-value estimate appears here.</p>
          <p className="mt-2 max-w-prose text-ink-2">
            Tell your coach about revenue and costs for at least one studio — or upload a P&L or tax return on the Documents tab — and the
            dashboard fills itself in.
          </p>
        </Card>
      )}

      {hasNumbers && (
        <Card
          title={
            <span className="flex items-center gap-1.5">
              How the price is built <Explain term="sde" />
            </span>
          }
        >
          <dl className="tabular space-y-2.5 text-sm">
            <Row label="Revenue (last 12 months)" value={formatMoney(v.totals.revenue, false)} />
            <Row label="− Studio costs (payroll, rent, operating)" value={formatMoney(-v.totals.expenses, false)} />
            <Row label="= Four-wall profit" value={formatMoney(v.totals.fourWallEbitda, false)} explain={<Explain term="fourWall" />} strong />
            <Row label="+ Add-backs (personal & one-time)" value={formatMoney(v.totals.addBacks, false)} explain={<Explain term="addBacks" />} />
            <Row label="= SDE (owner's total benefit)" value={formatMoney(v.totals.sde, false)} explain={<Explain term="sde" />} strong />
            <Row label="− Cost to replace Stephanie's role" value={formatMoney(-v.totals.ownerReplacementCost, false)} explain={<Explain term="ownerDependence" />} />
            <Row label="= Adjusted EBITDA" value={formatMoney(v.totals.adjustedEbitda, false)} explain={<Explain term="adjustedEbitda" />} strong />
          </dl>
          <p className="mt-4 text-xs text-ink-3">
            Buyers of a business this size price it on <strong className="text-ink-2">{v.basis}</strong>. Adjusted EBITDA margin:{' '}
            {pct(v.totals.ebitdaMarginPct, 1)}.
          </p>
        </Card>
      )}

      <Card
        title={
          <span className="flex items-center gap-1.5">
            Exit-readiness score <Explain term="readiness" context={`my score is ${v.readiness.score}`} />
          </span>
        }
        action={<span className="tabular font-display text-3xl text-ink">{v.readiness.score}<span className="text-base text-ink-3">/100</span></span>}
      >
        <ul className="space-y-3">
          {[...v.readiness.factors]
            .sort((a, b) => (1 - b.score) * b.weight - (1 - a.score) * a.weight)
            .map((f) => (
              <li key={f.id} title={f.detail}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink">{f.label}</span>
                  <StatusTag status={scoreStatus(f.score, f.known)} />
                </div>
                <Meter value={f.score} label={f.label} />
              </li>
            ))}
        </ul>
        <p className="mt-4 text-xs text-ink-3">Sorted by how much each item is holding the price back. Hover an item for details.</p>
      </Card>

      <Card
        className="lg:col-span-2"
        title={
          <span className="flex items-center gap-1.5">
            <Sparkles size={16} className="text-brand" /> What each improvement is worth
          </span>
        }
        action={
          levers.length > 0 && (
            <span className="text-right text-xs text-ink-3">
              Full plan potential
              <span className="tabular block font-display text-xl text-ink">{formatMoney(combinedValue)}</span>
            </span>
          )
        }
      >
        {levers.length === 0 ? (
          <p className="text-sm text-ink-2">Once your coach knows a bit more about members, leases and how the books are kept, this shows the dollar value of each change.</p>
        ) : (
          <LeverList levers={levers} onAdd={onAddLever} existing={state.tasks.map((t) => t.title)} />
        )}
        <p className="mt-4 text-xs text-ink-3">
          Each figure is the change in estimated sale value if that one item hits its target, using the same model as the estimate above. The full plan
          caps combined revenue growth at 25% — treat it as an upper bound, and remember buyers pay for results that show in the trailing twelve months.
        </p>
      </Card>
    </div>
  );
}

function Row({ label, value, explain, strong }: { label: string; value: string; explain?: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? 'border-t border-line pt-2.5 font-semibold text-ink' : 'text-ink-2'}`}>
      <dt className="flex items-center gap-1">
        {label}
        {explain}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function ValueHero(props: {
  low: number;
  mid: number;
  high: number;
  target?: number;
  potential?: number;
  lensLabel: string;
  basis: string;
  multiple: number;
}) {
  const { low, mid, high, target, potential } = props;
  const max = Math.max(high, target ?? 0, potential ?? 0) * 1.08 || 1;
  const x = (v: number) => `${(v / max) * 100}%`;
  return (
    <Card className="lg:col-span-2">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-1 text-sm font-medium text-ink-3">
            Estimated sale value today <Explain term="valuation" />
          </div>
          <div className="tabular mt-1 font-display text-5xl text-ink max-sm:text-4xl">{formatMoney(mid)}</div>
          <div className="tabular mt-1 text-sm text-ink-2">
            Likely range {formatMoney(low)} – {formatMoney(high)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <Stat label="Likely buyer" value={props.lensLabel.split(' / ')[0]} explain={<Explain term="rollup" />} />
          <Stat label={`Multiple of ${props.basis}`} value={`${props.multiple.toFixed(2)}x`} explain={<Explain term="multiple" />} />
          {target ? (
            <Stat label="Gap to your goal" value={mid >= target ? 'Reached' : formatMoney(target - mid)} sub={`Goal ${formatMoney(target)}`} />
          ) : (
            <Stat label="Your goal" value="Not set" sub="Tell your coach" />
          )}
        </div>
      </div>

      {/* Range strip: today's likely range as a band, goal and plan potential as labeled ticks. */}
      <div className="relative mt-8 mb-8 h-3 rounded-full bg-bar-track" aria-hidden>
        <div className="absolute inset-y-0 rounded-full bg-bar/40" style={{ left: x(low), width: `calc(${x(high)} - ${x(low)})` }} />
        <div className="absolute -top-1.5 h-6 w-1 rounded-full bg-bar" style={{ left: x(mid) }} />
        <span className="tabular absolute top-6 -translate-x-1/2 text-xs text-ink-2" style={{ left: x(mid) }}>
          Today
        </span>
        {target && (
          <>
            <div className="absolute -top-1.5 h-6 w-0.5 bg-ink" style={{ left: x(target) }} />
            <span className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-xs text-ink" style={{ left: x(target) }}>
              <Target size={12} className="mr-0.5 inline" />
              Goal
            </span>
          </>
        )}
        {potential && potential > mid && (
          <>
            <div className="absolute -top-1.5 h-6 w-0.5 bg-brand" style={{ left: x(potential) }} />
            <span className="absolute top-6 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-brand" style={{ left: x(potential) }}>
              With plan
            </span>
          </>
        )}
      </div>
      <p className="text-xs text-ink-3">
        A planning estimate from rule-of-thumb multiples for boutique fitness — not an appraisal. A broker or valuation firm will refine it with
        comparable sales.
      </p>
    </Card>
  );
}

function LeverList({ levers, onAdd, existing }: { levers: Lever[]; onAdd: (l: Lever) => void; existing: string[] }) {
  const max = Math.max(...levers.map((l) => l.valueImpact));
  return (
    <ul className="space-y-4">
      {levers.map((l) => {
        const added = existing.includes(l.title);
        return (
          <li key={l.id} className="group">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-sm font-medium text-ink">{l.title}</span>
              <span className="tabular text-sm font-semibold text-ink">+{formatMoney(l.valueImpact)}</span>
            </div>
            <div className="mt-1.5 h-2.5 rounded-full bg-bar-track" title={`+${formatMoney(l.valueImpact, false)} of sale value`}>
              <div className="h-2.5 rounded-full bg-bar" style={{ width: `${Math.max(2, (l.valueImpact / max) * 100)}%` }} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-ink-3">
                {l.description} · {l.effort} effort · ~{l.months} months
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => askCoach(`Walk me through "${l.title}" for my studios — what exactly would I do, in what order, and what is the first step this week?`)}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-soft"
                >
                  How do I do this?
                </button>
                <button
                  type="button"
                  disabled={added}
                  onClick={() => onAdd(l)}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-2 hover:bg-surface-2 disabled:text-ink-3"
                >
                  {added ? 'On roadmap ✓' : 'Add to roadmap'}
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CompletenessCard({ state }: { state: AppState }) {
  const v = computeValuation(state.profile);
  const next = v.missing.slice(0, 3);
  return (
    <Card className="lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink">Your business profile is {Math.round(v.completeness * 100)}% complete</span>
          </div>
          <div className="mt-2">
            <Meter value={v.completeness} label="Profile completeness" />
          </div>
          {next.length > 0 && (
            <p className="mt-2 text-xs text-ink-3">Next up: {next.map((m) => m.label).join(' · ')}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => askCoach("Let's keep going — what do you need to know next?")}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink"
        >
          Continue with my coach <ArrowRight size={16} />
        </button>
      </div>
    </Card>
  );
}
