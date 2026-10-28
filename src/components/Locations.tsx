import { useState } from 'react';
import { Pencil, Plus, Check } from 'lucide-react';
import type { AppState, BusinessProfile, Location } from '../lib/types';
import { BENCHMARKS, computeValuation, formatMoney, type LocationMetrics } from '../lib/valuation';
import { PROFILE_FIELDS, applyProfileUpdates, type ProfileField } from '../lib/profileUpdates';
import { Card, Explain, StatusTag, pct, type Status } from './ui';
import type { GLOSSARY } from '../data/glossary';

type Update = (fn: (s: AppState) => void) => void;

const lowerIsBetter = (v: number | null, good: number, warn: number): Status =>
  v === null ? 'unknown' : v <= good ? 'good' : v <= warn ? 'warning' : 'critical';
const higherIsBetter = (v: number | null, good: number, warn: number): Status =>
  v === null ? 'unknown' : v >= good ? 'good' : v >= warn ? 'warning' : 'critical';

interface Kpi {
  label: string;
  value: string;
  status: Status;
  benchmark: string;
  term?: keyof typeof GLOSSARY;
}

function kpis(l: Location, m: LocationMetrics): Kpi[] {
  const churn = l.monthlyChurnPct ?? null;
  return [
    { label: 'Revenue', value: m.revenue ? formatMoney(m.revenue) : '—', status: m.growthPct === null ? 'unknown' : higherIsBetter(m.growthPct, 5, 0), benchmark: m.growthPct === null ? 'Add prior year for trend' : `${m.growthPct >= 0 ? '+' : ''}${m.growthPct.toFixed(1)}% vs last year` },
    { label: 'Four-wall profit', value: m.revenue ? formatMoney(m.fourWallEbitda) : '—', status: higherIsBetter(m.marginPct, BENCHMARKS.ebitdaMarginPct.good, BENCHMARKS.ebitdaMarginPct.warn), benchmark: `${pct(m.marginPct)} margin · aim ${BENCHMARKS.ebitdaMarginPct.good}%+`, term: 'fourWall' },
    { label: 'Rent / revenue', value: pct(m.rentPct), status: lowerIsBetter(m.rentPct, BENCHMARKS.rentPctOfRevenue.good, BENCHMARKS.rentPctOfRevenue.warn), benchmark: `aim under ${BENCHMARKS.rentPctOfRevenue.good}%`, term: 'rentPct' },
    { label: 'Payroll / revenue', value: pct(m.payrollPct), status: lowerIsBetter(m.payrollPct, BENCHMARKS.payrollPctOfRevenue.good, BENCHMARKS.payrollPctOfRevenue.warn), benchmark: `aim under ${BENCHMARKS.payrollPctOfRevenue.good}%`, term: 'payrollPct' },
    { label: 'Members', value: l.activeMembers ? Math.round(l.activeMembers).toLocaleString() : '—', status: l.recurringRevenuePct === undefined ? 'unknown' : higherIsBetter(l.recurringRevenuePct, 75, 60), benchmark: l.recurringRevenuePct === undefined ? 'Add recurring %' : `${l.recurringRevenuePct}% of revenue recurring`, term: 'recurring' },
    { label: 'Monthly churn', value: pct(churn, 1), status: lowerIsBetter(churn, BENCHMARKS.goodMonthlyChurnPct, 6), benchmark: `aim under ${BENCHMARKS.goodMonthlyChurnPct}%`, term: 'churn' },
    { label: 'Member lifetime value', value: m.memberLifetimeValue ? formatMoney(m.memberLifetimeValue) : '—', status: m.memberLifetimeValue === null ? 'unknown' : higherIsBetter(m.memberLifetimeValue, 3000, 2000), benchmark: 'dues ÷ churn', term: 'ltv' },
    { label: 'Class utilization', value: pct(m.utilizationPct), status: m.utilizationPct === null ? 'unknown' : higherIsBetter(m.utilizationPct, 60, 40), benchmark: 'aim 60–80%', term: 'utilization' },
    { label: 'Lease (incl. options)', value: m.leaseYearsTotal === null ? '—' : `${m.leaseYearsTotal} yrs`, status: l.leaseAssignable === false ? 'critical' : higherIsBetter(m.leaseYearsTotal, BENCHMARKS.goodLeaseYears, 5), benchmark: l.leaseAssignable === false ? 'Not assignable — fix before sale' : `aim ${BENCHMARKS.goodLeaseYears}+ yrs, assignable`, term: 'lease' },
  ];
}

export function Locations({ state, update }: { state: AppState; update: Update }) {
  const v = computeValuation(state.profile);
  const [newName, setNewName] = useState('');
  return (
    <div className="space-y-5">
      {state.profile.locations.length === 0 && (
        <Card>
          <p className="text-ink-2">No studios yet. Your coach will add them as you talk, or add one here.</p>
        </Card>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        {state.profile.locations.map((l) => (
          <LocationCard key={l.id} location={l} metrics={v.locations.find((m) => m.id === l.id)!} update={update} />
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          update((s) => applyProfileUpdates(s.profile, [{ field: 'location.add', value: newName.trim() }]));
          setNewName('');
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a studio (e.g. Jenkintown)"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3"
        />
        <button className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink">
          <Plus size={16} /> Add studio
        </button>
      </form>
      <BusinessEditor profile={state.profile} update={update} />
    </div>
  );
}

function LocationCard({ location: l, metrics, update }: { location: Location; metrics: LocationMetrics; update: Update }) {
  const [editing, setEditing] = useState(false);
  const fields = (Object.keys(PROFILE_FIELDS) as ProfileField[]).filter((k) => PROFILE_FIELDS[k].scope === 'location');
  return (
    <Card
      title={
        <span>
          {l.name}
          {l.city && <span className="ml-2 text-sm font-normal text-ink-3">{l.city}</span>}
        </span>
      }
      action={
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-soft"
        >
          {editing ? <Check size={14} /> : <Pencil size={14} />} {editing ? 'Done' : 'Edit numbers'}
        </button>
      }
    >
      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <FieldInput
              key={f}
              field={f}
              value={(l as unknown as Record<string, unknown>)[f]}
              onChange={(value) => update((s) => applyProfileUpdates(s.profile, [{ field: f, location: l.id, value }]))}
            />
          ))}
          <button
            type="button"
            onClick={() => {
              if (confirm(`Remove ${l.name} and all its numbers?`)) update((s) => applyProfileUpdates(s.profile, [{ field: 'location.remove', value: l.id }]));
            }}
            className="justify-self-start text-xs font-medium text-critical-ink"
          >
            Remove this studio
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {kpis(l, metrics).map((k) => (
            <li key={k.label} className="min-w-0">
              <div className="flex items-center gap-1 text-xs text-ink-3">
                {k.label}
                {k.term && <Explain term={k.term} context={`${l.name} studio`} />}
              </div>
              <div className="tabular mt-0.5 text-lg font-semibold text-ink">{k.value}</div>
              <StatusTag status={k.status} label={k.status === 'unknown' ? 'No data' : undefined} />
              <div className="mt-0.5 text-[11px] leading-snug text-ink-3">{k.benchmark}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function BusinessEditor({ profile, update }: { profile: BusinessProfile; update: Update }) {
  const [open, setOpen] = useState(false);
  const fields = (Object.keys(PROFILE_FIELDS) as ProfileField[]).filter((k) => PROFILE_FIELDS[k].scope === 'business');
  return (
    <Card
      title="Business-wide details"
      action={
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-brand">
          {open ? 'Hide' : 'Show & edit'}
        </button>
      }
    >
      {open ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((f) => (
            <FieldInput
              key={f}
              field={f}
              value={(profile as unknown as Record<string, unknown>)[f]}
              onChange={(value) => update((s) => applyProfileUpdates(s.profile, [{ field: f, value }]))}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-2">Owner pay, add-backs, how the books are kept, staffing and legal details. Your coach fills these in as you talk.</p>
      )}
    </Card>
  );
}

const ENUM_LABELS: Record<string, string> = {
  unknown: 'Not sure yet',
  shoebox: 'Receipts & bank statements only',
  tax_returns_only: 'Tax returns only',
  bookkeeper_pl: 'Monthly P&L from a bookkeeper',
  cpa_reviewed: 'CPA-reviewed financials',
  audited: 'Audited financials',
  w2: 'All W-2 employees',
  mixed: 'Mix of W-2 and 1099',
  '1099': 'All 1099 contractors',
};

function FieldInput({ field, value, onChange }: { field: ProfileField; value: unknown; onChange: (v: unknown) => void }) {
  const def = PROFILE_FIELDS[field];
  const id = `f-${field}`;
  const cls = 'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink';
  let input: React.ReactNode;
  if (typeof def.type === 'object') {
    input = (
      <select id={id} className={cls} value={String(value ?? 'unknown')} onChange={(e) => onChange(e.target.value)}>
        {def.type.enum.map((o) => (
          <option key={o} value={o}>
            {ENUM_LABELS[o] ?? o}
          </option>
        ))}
      </select>
    );
  } else if (def.type === 'boolean') {
    input = (
      <select id={id} className={cls} value={value === undefined ? '' : value ? 'yes' : 'no'} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}>
        <option value="">Not sure yet</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    );
  } else if (def.type === 'text') {
    input = <input id={id} className={cls} defaultValue={String(value ?? '')} onBlur={(e) => onChange(e.target.value || null)} />;
  } else {
    input = (
      <input
        id={id}
        className={`${cls} tabular`}
        inputMode="decimal"
        defaultValue={value === undefined || value === null ? '' : String(value)}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          onChange(raw === '' ? null : raw);
        }}
      />
    );
  }
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-xs text-ink-3">{def.label}</span>
      {input}
    </label>
  );
}
