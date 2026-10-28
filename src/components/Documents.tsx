import { useRef, useState } from 'react';
import { AlertTriangle, FileCheck2, FileText, Loader2, Upload, ShieldCheck } from 'lucide-react';
import type { AppState, DocumentKind, UploadedDocument } from '../lib/types';
import { extractDocument, PasscodeError, type Extraction } from '../lib/api';
import { PROFILE_FIELDS, applyProfileUpdates } from '../lib/profileUpdates';
import { formatMoney } from '../lib/valuation';
import { newId } from '../lib/store';
import { Card, Explain, StatusTag } from './ui';

const CHECKLIST: { kind: DocumentKind; label: string; detail: string }[] = [
  { kind: 'tax_return', label: 'Business tax returns — last 3 years', detail: 'Form 1120-S / 1065 / Schedule C. Buyers and lenders start here.' },
  { kind: 'profit_and_loss', label: 'Monthly P&L by studio — last 24 months + YTD', detail: 'From QuickBooks/Xero. Ideally one per location.' },
  { kind: 'bank_statement', label: 'Bank statements — last 12–24 months', detail: 'Used to verify that deposits match reported revenue.' },
  { kind: 'membership_report', label: 'Membership & attendance reports', detail: 'From Mindbody/Momence: active autopays, cancellations, attendance by class.' },
  { kind: 'payroll_report', label: 'Payroll summary', detail: 'Who is paid what, W-2 vs 1099.' },
  { kind: 'lease', label: 'All three leases (with amendments)', detail: 'Term, renewal options, assignment clause, personal guarantee.' },
  { kind: 'balance_sheet', label: 'Balance sheet', detail: 'Debts, equipment, deferred revenue from prepaid packs.' },
];

const KIND_LABEL: Record<DocumentKind, string> = {
  tax_return: 'Tax return',
  profit_and_loss: 'P&L',
  bank_statement: 'Bank statement',
  lease: 'Lease',
  membership_report: 'Membership report',
  payroll_report: 'Payroll report',
  balance_sheet: 'Balance sheet',
  other: 'Other',
};

// Show money fields as dollars, percents with %, everything else as given.
function displayValue(field: string, value: string): string {
  const def = (PROFILE_FIELDS as Record<string, { type: unknown; label: string }>)[field];
  const num = Number(value.replace(/[$,%\s]/g, ''));
  if (!def || !Number.isFinite(num)) return value;
  if (def.type === 'percent') return `${num}%`;
  if (def.label.includes('($)')) return formatMoney(num, false);
  return num.toLocaleString('en-US');
}

interface Pending {
  fileName: string;
  extraction: Extraction;
  selected: boolean[];
}

export function Documents({
  state,
  update,
  onApplied,
  onNeedPasscode,
}: {
  state: AppState;
  update: (fn: (s: AppState) => void) => void;
  onApplied: (message: string) => void;
  onNeedPasscode: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > 24 * 1024 * 1024) {
      setError('That file is over 24 MB. Try exporting just the pages you need.');
      return;
    }
    setError(null);
    setBusy(file.name);
    try {
      const extraction = await extractDocument(
        file,
        state.profile.locations.map((l) => l.name),
      );
      setPending({ fileName: file.name, extraction, selected: extraction.proposed_updates.map(() => true) });
    } catch (e) {
      if (e instanceof PasscodeError) onNeedPasscode();
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function apply() {
    if (!pending) return;
    const { extraction: x, fileName } = pending;
    const chosen = x.proposed_updates.filter((_, i) => pending.selected[i]);
    let applied: string[] = [];
    update((s) => {
      // Create any studio the document names that we don't have yet.
      for (const u of chosen) {
        if (u.location && !s.profile.locations.some((l) => l.name.toLowerCase() === u.location!.toLowerCase())) {
          const known = s.profile.locations.some((l) => l.name.toLowerCase().includes(u.location!.toLowerCase()));
          if (!known) applyProfileUpdates(s.profile, [{ field: 'location.add', value: u.location }]);
        }
      }
      applied = applyProfileUpdates(
        s.profile,
        chosen.map((u) => ({ field: u.field, location: u.location ?? undefined, value: u.value })),
      ).applied;
      const loc = x.location_name ? s.profile.locations.find((l) => l.name.toLowerCase().includes(x.location_name!.toLowerCase())) : undefined;
      const doc: UploadedDocument = {
        id: newId(),
        fileName,
        kind: x.kind,
        uploadedAt: new Date().toISOString(),
        summary: x.summary,
        period: x.period,
        locationId: loc?.id,
        extracted: Object.fromEntries(chosen.map((u) => [`${u.location ? u.location + '.' : ''}${u.field}`, u.value])),
        redFlags: x.red_flags,
      };
      s.documents.push(doc);
    });
    setPending(null);
    const addBacks = x.add_back_candidates.map((a) => `${a.description} (${formatMoney(a.amount, false)})`).join('; ');
    onApplied(
      `I just uploaded "${fileName}" (${KIND_LABEL[x.kind]}, ${x.period}). Summary: ${x.summary}` +
        (applied.length ? ` I saved these numbers: ${applied.join('; ')}.` : '') +
        (addBacks ? ` Possible add-backs it found: ${addBacks}.` : '') +
        (x.red_flags.length ? ` Possible red flags: ${x.red_flags.join('; ')}.` : '') +
        ' What does this tell you, and what should I do next?',
    );
  }

  const haveKinds = new Set(state.documents.map((d) => d.kind));

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        <Card title="Upload a document">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${dragging ? 'border-brand bg-brand-soft' : 'border-line bg-surface-2'}`}
          >
            {busy ? (
              <>
                <Loader2 className="animate-spin text-brand" size={28} />
                <p className="mt-3 text-sm font-medium text-ink">Reading {busy}…</p>
                <p className="mt-1 text-xs text-ink-3">This usually takes 20–60 seconds.</p>
              </>
            ) : (
              <>
                <Upload className="text-brand" size={28} />
                <p className="mt-3 text-sm font-medium text-ink">Drop a tax return, P&L, bank statement, lease or Mindbody report</p>
                <p className="mt-1 text-xs text-ink-3">PDF, photo (PNG/JPG) or CSV. Excel? Save as PDF or CSV first.</p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink"
                >
                  Choose a file
                </button>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,application/pdf,image/*,text/csv"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
          {error && <p className="mt-3 text-sm text-critical-ink">{error}</p>}
          <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-3">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            Files are sent to Claude to be read and are not stored by this app. Only the numbers you approve are saved, in this browser.
          </p>
        </Card>

        {pending && (
          <Card title={`Review what I found in ${pending.fileName}`}>
            <p className="text-sm text-ink-2">
              <span className="font-medium text-ink">{KIND_LABEL[pending.extraction.kind]}</span> · {pending.extraction.period}
              {pending.extraction.location_name ? ` · ${pending.extraction.location_name}` : ''}
            </p>
            <p className="mt-2 text-sm text-ink">{pending.extraction.summary}</p>
            {pending.extraction.proposed_updates.length > 0 ? (
              <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
                {pending.extraction.proposed_updates.map((u, i) => (
                  <li key={i} className="flex items-start gap-3 p-3">
                    <input
                      type="checkbox"
                      className="mt-1 accent-[var(--brand)]"
                      checked={pending.selected[i]}
                      onChange={(e) => setPending({ ...pending, selected: pending.selected.map((s, j) => (j === i ? e.target.checked : s)) })}
                      aria-label={`Save ${u.field}`}
                    />
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-ink">
                          {(PROFILE_FIELDS as Record<string, { label: string }>)[u.field]?.label ?? u.field}
                          {u.location && <span className="text-ink-3"> · {u.location}</span>}
                        </span>
                        <span className="tabular font-semibold text-ink">{displayValue(u.field, u.value)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-3">{u.evidence}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-3">No numbers to save from this one, but your coach can still discuss it.</p>
            )}
            {pending.extraction.add_back_candidates.length > 0 && (
              <div className="mt-4">
                <p className="flex items-center gap-1 text-sm font-medium text-ink">
                  Possible add-backs <Explain term="addBacks" />
                </p>
                <ul className="mt-1 list-disc pl-5 text-sm text-ink-2">
                  {pending.extraction.add_back_candidates.map((a, i) => (
                    <li key={i}>
                      {a.description} — {formatMoney(a.amount, false)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {pending.extraction.red_flags.length > 0 && (
              <div className="mt-4">
                <StatusTag status="warning" label="What a buyer would ask about" />
                <ul className="mt-1 list-disc pl-5 text-sm text-ink-2">
                  {pending.extraction.red_flags.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={apply} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink">
                Save checked numbers & discuss with coach
              </button>
              <button type="button" onClick={() => setPending(null)} className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink-2">
                Discard
              </button>
            </div>
          </Card>
        )}

        {state.documents.length > 0 && (
          <Card title="Uploaded so far">
            <ul className="divide-y divide-line">
              {[...state.documents].reverse().map((d) => (
                <li key={d.id} className="flex gap-3 py-3">
                  <FileText size={18} className="mt-0.5 shrink-0 text-ink-3" />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-ink">{d.fileName}</p>
                    <p className="text-xs text-ink-3">
                      {KIND_LABEL[d.kind]} · {d.period} · {new Date(d.uploadedAt).toLocaleDateString()}
                    </p>
                    <p className="mt-1 text-ink-2">{d.summary}</p>
                    {d.redFlags.length > 0 && <p className="mt-1 text-xs text-warning-ink">⚠ {d.redFlags.join(' · ')}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <Card
        className="lg:col-span-2"
        title={
          <span className="flex items-center gap-1.5">
            Data-room checklist <Explain term="dataRoom" />
          </span>
        }
      >
        <ul className="space-y-3">
          {CHECKLIST.map((c) => {
            const have = haveKinds.has(c.kind);
            return (
              <li key={c.kind} className="flex gap-3">
                {have ? <FileCheck2 size={18} className="mt-0.5 shrink-0 text-good-ink" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0 text-ink-3" />}
                <div className="text-sm">
                  <p className={have ? 'text-ink' : 'text-ink'}>{c.label}</p>
                  <p className="text-xs text-ink-3">{have ? 'Uploaded ✓' : c.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
