// The single registry of profile fields the coach (or a document extraction)
// may write. The server builds the tool schema from it and the browser applies
// the same validated updates, so there is one definition of every field.

import type { BusinessProfile, Location } from './types';

type FieldType = 'number' | 'percent' | 'boolean' | 'text' | { enum: readonly string[] };

interface FieldDef {
  scope: 'business' | 'location';
  type: FieldType;
  label: string;
}

export const PROFILE_FIELDS = {
  // Business-wide
  businessName: { scope: 'business', type: 'text', label: 'Business name' },
  ownerName: { scope: 'business', type: 'text', label: "Owner's first name" },
  entityType: { scope: 'business', type: 'text', label: 'Entity type (LLC, S-Corp...)' },
  yearsInBusiness: { scope: 'business', type: 'number', label: 'Years in business' },
  targetPrice: { scope: 'business', type: 'number', label: 'Target sale price ($)' },
  sellTimelineMonths: { scope: 'business', type: 'number', label: 'Months until she wants to sell' },
  willingToStayMonths: { scope: 'business', type: 'number', label: 'Months she would stay to transition after closing' },
  motivation: { scope: 'business', type: 'text', label: 'Why she is selling / what matters in a buyer' },
  ownerSalaryAnnual: { scope: 'business', type: 'number', label: "Owner's annual salary/draws ($)" },
  ownerHoursPerWeek: { scope: 'business', type: 'number', label: 'Hours per week the owner works' },
  ownerTeachesClassesPerWeek: { scope: 'business', type: 'number', label: 'Classes per week the owner teaches' },
  hasGeneralManager: { scope: 'business', type: 'boolean', label: 'Has a general manager over all studios' },
  financialsQuality: {
    scope: 'business',
    type: { enum: ['unknown', 'shoebox', 'tax_returns_only', 'bookkeeper_pl', 'cpa_reviewed', 'audited'] },
    label: 'How the books are kept',
  },
  booksSeparatedByLocation: { scope: 'business', type: 'boolean', label: 'Separate P&L per studio' },
  personalExpensesInBooks: { scope: 'business', type: 'number', label: 'Annual personal expenses run through the business ($)' },
  oneTimeExpenses: { scope: 'business', type: 'number', label: 'Annual non-recurring expenses ($)' },
  cashRevenueUnreportedPct: { scope: 'business', type: 'percent', label: '% of revenue not reported in the books' },
  instructorClassification: { scope: 'business', type: { enum: ['unknown', 'w2', 'mixed', '1099'] }, label: 'Instructor pay classification' },
  hasWrittenSOPs: { scope: 'business', type: 'boolean', label: 'Has written operating procedures' },
  trademarkRegistered: { scope: 'business', type: 'boolean', label: 'Business name is a registered trademark' },
  bookingSoftware: { scope: 'business', type: 'text', label: 'Booking/CRM software (Mindbody, Momence...)' },
  googleRating: { scope: 'business', type: 'number', label: 'Average Google rating' },
  googleReviewCount: { scope: 'business', type: 'number', label: 'Total Google reviews' },
  outstandingDebt: { scope: 'business', type: 'number', label: 'Business debt outstanding ($)' },
  // Per location
  name: { scope: 'location', type: 'text', label: 'Studio name' },
  city: { scope: 'location', type: 'text', label: 'City/town' },
  openedYear: { scope: 'location', type: 'number', label: 'Year opened' },
  annualRevenue: { scope: 'location', type: 'number', label: 'Last-12-month revenue ($)' },
  priorYearRevenue: { scope: 'location', type: 'number', label: 'Prior-year revenue ($)' },
  recurringRevenuePct: { scope: 'location', type: 'percent', label: '% of revenue from memberships/autopay' },
  payrollAnnual: { scope: 'location', type: 'number', label: 'Annual payroll excluding owner ($)' },
  rentMonthly: { scope: 'location', type: 'number', label: 'Monthly rent incl. CAM/NNN ($)' },
  otherOpexAnnual: { scope: 'location', type: 'number', label: 'Other annual operating expenses ($)' },
  activeMembers: { scope: 'location', type: 'number', label: 'Active autopay members' },
  avgMonthlyDues: { scope: 'location', type: 'number', label: 'Average monthly dues ($)' },
  monthlyChurnPct: { scope: 'location', type: 'percent', label: 'Monthly member cancellation rate (%)' },
  newMembersPerMonth: { scope: 'location', type: 'number', label: 'New members per month' },
  classesPerWeek: { scope: 'location', type: 'number', label: 'Classes per week' },
  avgClassAttendance: { scope: 'location', type: 'number', label: 'Average students per class' },
  roomCapacity: { scope: 'location', type: 'number', label: 'Max students per class' },
  leaseYearsRemaining: { scope: 'location', type: 'number', label: 'Years left on lease' },
  leaseRenewalOptionYears: { scope: 'location', type: 'number', label: 'Total years of renewal options' },
  leaseAssignable: { scope: 'location', type: 'boolean', label: 'Lease can be assigned to a buyer' },
  hasManager: { scope: 'location', type: 'boolean', label: 'Studio has its own manager' },
} as const satisfies Record<string, FieldDef>;

export type ProfileField = keyof typeof PROFILE_FIELDS;

export interface ProfileUpdate {
  field: string; // a ProfileField, or the special 'location.add' / 'location.remove' / 'note'
  location?: string; // location id or name
  value: unknown;
}

export const SPECIAL_FIELDS = ['location.add', 'location.remove', 'note'] as const;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'studio';

export function findLocation(p: BusinessProfile, ref: string | undefined): Location | undefined {
  if (!ref) return p.locations.length === 1 ? p.locations[0] : undefined;
  const r = ref.toLowerCase().trim();
  return (
    p.locations.find((l) => l.id === r) ??
    p.locations.find((l) => l.name.toLowerCase() === r) ??
    p.locations.find((l) => l.name.toLowerCase().includes(r) || r.includes(l.name.toLowerCase()) || l.id === slug(r))
  );
}

function coerce(type: FieldType, raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (raw === null) return { ok: true, value: undefined };
  if (type === 'number' || type === 'percent') {
    const num = typeof raw === 'number' ? raw : Number(String(raw).replace(/[$,%\s]/g, ''));
    if (!Number.isFinite(num)) return { ok: false, error: `expected a number, got ${JSON.stringify(raw)}` };
    if (type === 'percent' && (num < 0 || num > 100)) return { ok: false, error: 'percent must be 0-100' };
    return { ok: true, value: num };
  }
  if (type === 'boolean') {
    if (typeof raw === 'boolean') return { ok: true, value: raw };
    const s = String(raw).toLowerCase().trim();
    if (['yes', 'true', 'y', '1'].includes(s)) return { ok: true, value: true };
    if (['no', 'false', 'n', '0'].includes(s)) return { ok: true, value: false };
    return { ok: false, error: `expected yes/no, got ${JSON.stringify(raw)}` };
  }
  if (type === 'text') return { ok: true, value: String(raw).slice(0, 2000) };
  const s = String(raw);
  return type.enum.includes(s) ? { ok: true, value: s } : { ok: false, error: `must be one of ${type.enum.join(', ')}` };
}

// Mutates `p` in place. Returns what was applied and what was rejected, so the
// coach gets precise feedback in its tool result.
export function applyProfileUpdates(p: BusinessProfile, updates: ProfileUpdate[]): { applied: string[]; errors: string[] } {
  const applied: string[] = [];
  const errors: string[] = [];
  for (const u of updates) {
    if (u.field === 'location.add') {
      const name = String(u.value ?? '').trim();
      if (!name) {
        errors.push('location.add needs a studio name as value');
        continue;
      }
      if (findLocation(p, name)?.name.toLowerCase() === name.toLowerCase()) {
        applied.push(`location "${name}" already exists`);
        continue;
      }
      let id = slug(name);
      while (p.locations.some((l) => l.id === id)) id += '-2';
      p.locations.push({ id, name });
      applied.push(`added location "${name}" (id: ${id})`);
      continue;
    }
    if (u.field === 'location.remove') {
      const loc = findLocation(p, String(u.value ?? u.location ?? ''));
      if (!loc) {
        errors.push(`no location matches ${JSON.stringify(u.value ?? u.location)}`);
        continue;
      }
      p.locations = p.locations.filter((l) => l !== loc);
      applied.push(`removed location "${loc.name}"`);
      continue;
    }
    if (u.field === 'note') {
      const note = String(u.value ?? '').trim();
      if (note) {
        p.notes = [...p.notes, note.slice(0, 500)].slice(-40);
        applied.push('saved note');
      }
      continue;
    }
    const def = (PROFILE_FIELDS as Record<string, FieldDef>)[u.field];
    if (!def) {
      errors.push(`unknown field "${u.field}"`);
      continue;
    }
    const c = coerce(def.type, u.value);
    if (!c.ok) {
      errors.push(`${u.field}: ${c.error}`);
      continue;
    }
    if (def.scope === 'business') {
      (p as unknown as Record<string, unknown>)[u.field] = c.value;
      applied.push(`${u.field} = ${JSON.stringify(c.value)}`);
    } else {
      const loc = findLocation(p, u.location);
      if (!loc) {
        errors.push(
          `${u.field}: no location matches ${JSON.stringify(u.location)} (known: ${p.locations.map((l) => l.name).join(', ') || 'none — add one first'})`,
        );
        continue;
      }
      (loc as unknown as Record<string, unknown>)[u.field] = c.value;
      applied.push(`${loc.name}.${u.field} = ${JSON.stringify(c.value)}`);
    }
  }
  return { applied, errors };
}
