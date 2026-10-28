// Deterministic valuation + exit-readiness engine.
//
// The AI coach never invents valuation numbers: it reads them from this module
// (the server passes a snapshot into every chat turn), so the dashboard and the
// conversation always agree. All rules of thumb live in BENCHMARKS below so
// they can be tuned in one place.

import type { BusinessProfile, Location } from './types';

export const BENCHMARKS = {
  // Replacement cost of the owner's management role if she has no GM (Philly suburbs, loaded)
  gmSalaryLoaded: 75_000,
  // What a buyer pays a substitute instructor per class
  instructorCostPerClass: 50,
  // Rough share of incremental membership revenue that falls to profit
  incrementalMargin: 0.8,
  // Average visits per member per week, used to translate attendance into members
  visitsPerMemberPerWeek: 2,
  // Max revenue growth a single operating lever is credited with in the plan
  leverRevenueCapPct: 10,
  planRevenueCapPct: 25,
  // Adjusted EBITDA where institutional (EBITDA-multiple) buyers start blending in
  sdeBlendStart: 250_000,
  goodMonthlyChurnPct: 4,
  goodRecurringPct: 80,
  goodUtilizationPct: 65,
  goodLeaseYears: 10,
  rentPctOfRevenue: { good: 15, warn: 22 },
  payrollPctOfRevenue: { good: 32, warn: 40 },
  ebitdaMarginPct: { good: 20, warn: 10 },
  // Buyer pools and the multiple ranges each pays. Earnings basis differs:
  // owner-operators buy SDE, institutional buyers buy adjusted EBITDA.
  buyerLenses: {
    individual: { label: 'Owner-operator buyer', basis: 'SDE', low: 1.8, high: 3.5, minEarnings: 0 },
    strategic: { label: 'Regional operator / search fund / franchisor', basis: 'EBITDA', low: 3.0, high: 5.5, minEarnings: 600_000 },
    platform: { label: 'Private-equity-backed platform', basis: 'EBITDA', low: 4.5, high: 7.0, minEarnings: 1_200_000 },
  },
} as const;

export type BuyerLens = keyof typeof BENCHMARKS.buyerLenses;

export interface LocationMetrics {
  id: string;
  name: string;
  revenue: number;
  expenses: number;
  fourWallEbitda: number;
  marginPct: number | null;
  rentPct: number | null;
  payrollPct: number | null;
  utilizationPct: number | null;
  growthPct: number | null;
  memberRevenueAnnual: number | null;
  memberLifetimeValue: number | null;
  leaseYearsTotal: number | null;
}

export interface ReadinessFactor {
  id: string;
  label: string;
  weight: number;
  score: number; // 0-1
  known: boolean;
  detail: string;
}

export interface MissingInput {
  key: string;
  label: string;
  why: string;
  priority: number; // lower = ask sooner
}

export interface Lever {
  id: string;
  title: string;
  description: string;
  valueImpact: number;
  effort: 'low' | 'medium' | 'high';
  months: number;
}

export interface Valuation {
  totals: {
    revenue: number;
    expenses: number;
    fourWallEbitda: number;
    reportedProfit: number;
    addBacks: number;
    sde: number;
    ownerReplacementCost: number;
    adjustedEbitda: number;
    ebitdaMarginPct: number | null;
    recurringPct: number | null;
    churnPct: number | null;
    growthPct: number | null;
    activeMembers: number;
  };
  lens: BuyerLens;
  lensLabel: string;
  basis: 'SDE' | 'EBITDA';
  earnings: number;
  multiple: { low: number; mid: number; high: number };
  value: { low: number; mid: number; high: number };
  readiness: { score: number; factors: ReadinessFactor[] };
  locations: LocationMetrics[];
  completeness: number; // 0-1
  missing: MissingInput[];
}

const n = (v: number | undefined | null) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const known = (v: unknown) => v !== undefined && v !== null && v !== '';
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
// Linear interpolation of x from [x0,x1] onto [y0,y1], clamped.
const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) =>
  y0 + (y1 - y0) * clamp((x - x0) / (x1 - x0));

function revenueWeighted(locs: Location[], pick: (l: Location) => number | undefined): number | null {
  let weight = 0;
  let sum = 0;
  for (const l of locs) {
    const v = pick(l);
    if (!known(v)) continue;
    const w = n(l.annualRevenue) || 1;
    weight += w;
    sum += (v as number) * w;
  }
  return weight ? sum / weight : null;
}

export function locationMetrics(l: Location): LocationMetrics {
  const revenue = n(l.annualRevenue);
  const rentAnnual = n(l.rentMonthly) * 12;
  const expenses = n(l.payrollAnnual) + rentAnnual + n(l.otherOpexAnnual);
  const fourWallEbitda = revenue - expenses;
  const pct = (x: number) => (revenue > 0 ? (x / revenue) * 100 : null);
  const utilizationPct =
    l.avgClassAttendance && l.roomCapacity ? (l.avgClassAttendance / l.roomCapacity) * 100 : null;
  const growthPct =
    l.priorYearRevenue && l.annualRevenue ? ((l.annualRevenue - l.priorYearRevenue) / l.priorYearRevenue) * 100 : null;
  const memberRevenueAnnual = l.activeMembers && l.avgMonthlyDues ? l.activeMembers * l.avgMonthlyDues * 12 : null;
  const memberLifetimeValue =
    l.avgMonthlyDues && l.monthlyChurnPct ? l.avgMonthlyDues / (l.monthlyChurnPct / 100) : null;
  const leaseYearsTotal = known(l.leaseYearsRemaining) ? n(l.leaseYearsRemaining) + n(l.leaseRenewalOptionYears) : null;
  return {
    id: l.id,
    name: l.name,
    revenue,
    expenses,
    fourWallEbitda,
    marginPct: pct(fourWallEbitda),
    rentPct: known(l.rentMonthly) ? pct(rentAnnual) : null,
    payrollPct: known(l.payrollAnnual) ? pct(n(l.payrollAnnual)) : null,
    utilizationPct,
    growthPct,
    memberRevenueAnnual,
    memberLifetimeValue,
    leaseYearsTotal,
  };
}

function readinessFactors(p: BusinessProfile, t: Valuation['totals'], locs: LocationMetrics[]): ReadinessFactor[] {
  const f: ReadinessFactor[] = [];

  const booksBase: Record<BusinessProfile['financialsQuality'], number> = {
    unknown: 0.4,
    shoebox: 0.1,
    tax_returns_only: 0.3,
    bookkeeper_pl: 0.6,
    cpa_reviewed: 0.9,
    audited: 1,
  };
  let books = booksBase[p.financialsQuality];
  if (p.booksSeparatedByLocation) books += 0.1;
  if (n(p.cashRevenueUnreportedPct) > 0) books -= Math.min(0.4, n(p.cashRevenueUnreportedPct) / 25);
  f.push({
    id: 'books',
    label: 'Clean, trustworthy financials',
    weight: 15,
    score: clamp(books),
    known: p.financialsQuality !== 'unknown',
    detail:
      'Buyers and lenders discount (or walk away from) numbers they cannot verify. CPA-reviewed monthly P&Ls by location are the standard.',
  });

  f.push({
    id: 'recurring',
    label: 'Recurring (membership) revenue',
    weight: 10,
    score: t.recurringPct === null ? 0.5 : lerp(t.recurringPct, 40, 85, 0.2, 1),
    known: t.recurringPct !== null,
    detail: 'Autopay memberships are predictable; class packs and drop-ins have to be re-sold every month.',
  });

  f.push({
    id: 'churn',
    label: 'Member retention',
    weight: 10,
    score: t.churnPct === null ? 0.5 : lerp(t.churnPct, 10, 3, 0.1, 1),
    known: t.churnPct !== null,
    detail: 'Monthly cancellations as a share of members. Under ~4%/month is strong for hot yoga.',
  });

  f.push({
    id: 'growth',
    label: 'Revenue trend',
    weight: 10,
    score: t.growthPct === null ? 0.5 : t.growthPct < 0 ? lerp(t.growthPct, -10, 0, 0.1, 0.45) : lerp(t.growthPct, 0, 15, 0.45, 1),
    known: t.growthPct !== null,
    detail: 'Buyers pay for momentum. Flat or declining revenue pushes the multiple to the bottom of the range.',
  });

  f.push({
    id: 'margin',
    label: 'Profit margin',
    weight: 10,
    score: t.ebitdaMarginPct === null ? 0.5 : lerp(t.ebitdaMarginPct, 5, 25, 0.1, 1),
    known: t.ebitdaMarginPct !== null && t.revenue > 0,
    detail: 'Adjusted EBITDA as a share of revenue. Well-run boutique studios land around 15–25%.',
  });

  let dependence = 0;
  if (!p.hasGeneralManager) dependence += 0.4 * clamp(n(p.ownerHoursPerWeek) / 40);
  dependence += 0.3 * clamp(n(p.ownerTeachesClassesPerWeek) / 8);
  if (!p.hasWrittenSOPs) dependence += 0.2;
  const managedShare = p.locations.length ? p.locations.filter((l) => l.hasManager).length / p.locations.length : 0;
  dependence += 0.1 * (1 - managedShare);
  f.push({
    id: 'owner',
    label: 'Runs without the owner',
    weight: 15,
    score: clamp(1 - dependence),
    known: known(p.ownerHoursPerWeek) && known(p.hasGeneralManager),
    detail:
      'If the studios depend on Stephanie teaching, scheduling and fixing things, a buyer is buying a job, not a business — and pays much less for it.',
  });

  const leaseYears = revenueWeighted(p.locations, (l) =>
    known(l.leaseYearsRemaining) ? n(l.leaseYearsRemaining) + n(l.leaseRenewalOptionYears) : undefined,
  );
  let lease = leaseYears === null ? 0.5 : lerp(leaseYears, 2, BENCHMARKS.goodLeaseYears, 0.1, 1);
  if (p.locations.some((l) => l.leaseAssignable === false)) lease -= 0.2;
  f.push({
    id: 'lease',
    label: 'Lease security',
    weight: 10,
    score: clamp(lease),
    known: leaseYears !== null,
    detail: 'A heated studio buildout is expensive to move. Buyers want 7–10+ years of term (including options) that can be assigned to them.',
  });

  const util = revenueWeighted(p.locations, (l) =>
    l.avgClassAttendance && l.roomCapacity ? (l.avgClassAttendance / l.roomCapacity) * 100 : undefined,
  );
  f.push({
    id: 'utilization',
    label: 'Class utilization',
    weight: 5,
    score: util === null ? 0.5 : util > 90 ? 0.85 : lerp(util, 25, BENCHMARKS.goodUtilizationPct, 0.2, 1),
    known: util !== null,
    detail: 'Average attendance divided by room capacity. 60–80% proves demand while leaving room to grow.',
  });

  const classification: Record<BusinessProfile['instructorClassification'], number> = {
    unknown: 0.4,
    w2: 1,
    mixed: 0.5,
    '1099': 0.25,
  };
  f.push({
    id: 'compliance',
    label: 'Staff & legal compliance',
    weight: 5,
    score: classification[p.instructorClassification],
    known: p.instructorClassification !== 'unknown',
    detail: 'Instructors paid as 1099 contractors are a common diligence finding (back payroll-tax exposure). Buyers price that risk in.',
  });

  let brand = 0.3;
  if (n(p.googleRating) >= 4.7) brand += 0.3;
  if (n(p.googleReviewCount) >= 200) brand += 0.2;
  if (p.trademarkRegistered) brand += 0.1;
  if (p.bookingSoftware) brand += 0.1;
  f.push({
    id: 'brand',
    label: 'Brand & systems',
    weight: 5,
    score: clamp(brand),
    known: known(p.googleRating) || known(p.bookingSoftware),
    detail: 'Reviews, a protected name, and a real booking/CRM system make the brand transferable.',
  });

  const positive = locs.filter((l) => l.revenue > 0);
  f.push({
    id: 'consistency',
    label: 'Every location pulls its weight',
    weight: 5,
    score: positive.length ? positive.filter((l) => l.fourWallEbitda > 0).length / positive.length : 0.5,
    known: positive.length > 0,
    detail: 'A money-losing studio drags down the whole package. Buyers will either discount it or ask you to fix/close it first.',
  });

  return f;
}

const MISSING_CHECKS: Array<{
  key: string;
  label: string;
  why: string;
  priority: number;
  test: (p: BusinessProfile) => boolean;
  perLocation?: (l: Location) => boolean;
}> = [
  { key: 'locations', label: 'Names and towns of the three studios', why: 'Every metric is tracked per location.', priority: 0, test: (p) => p.locations.length > 0 },
  { key: 'annualRevenue', label: 'Last-12-month revenue', why: 'The starting point for every valuation.', priority: 1, test: () => true, perLocation: (l) => known(l.annualRevenue) },
  { key: 'payrollAnnual', label: 'Annual payroll (instructors + staff, not Stephanie)', why: 'Largest controllable expense.', priority: 2, test: () => true, perLocation: (l) => known(l.payrollAnnual) },
  { key: 'rentMonthly', label: 'Monthly rent incl. CAM/NNN', why: 'Rent burden drives four-wall profit.', priority: 2, test: () => true, perLocation: (l) => known(l.rentMonthly) },
  { key: 'otherOpexAnnual', label: 'Other operating expenses (utilities, heat, marketing, software)', why: 'Needed to compute profit.', priority: 2, test: () => true, perLocation: (l) => known(l.otherOpexAnnual) },
  { key: 'ownerSalaryAnnual', label: "Stephanie's own pay/draws", why: 'Added back to compute SDE — buyers do not count it as a cost.', priority: 3, test: (p) => known(p.ownerSalaryAnnual) },
  { key: 'personalExpensesInBooks', label: 'Personal or one-time expenses run through the business', why: 'Every documented add-back dollar is worth 2–5 dollars of sale price.', priority: 3, test: (p) => known(p.personalExpensesInBooks) || known(p.oneTimeExpenses) },
  { key: 'financialsQuality', label: 'How the books are kept today', why: 'Determines how much of the earnings a buyer will believe.', priority: 3, test: (p) => p.financialsQuality !== 'unknown' },
  { key: 'activeMembers', label: 'Active autopay members and average monthly dues', why: 'Recurring revenue is the single biggest multiple driver.', priority: 4, test: () => true, perLocation: (l) => known(l.activeMembers) && known(l.avgMonthlyDues) },
  { key: 'monthlyChurnPct', label: 'Monthly membership cancellation rate', why: 'Retention tells a buyer whether revenue will still be there next year.', priority: 4, test: () => true, perLocation: (l) => known(l.monthlyChurnPct) },
  { key: 'recurringRevenuePct', label: 'Share of revenue from memberships vs. packs/drop-ins', why: 'Higher recurring share = higher multiple.', priority: 5, test: () => true, perLocation: (l) => known(l.recurringRevenuePct) },
  { key: 'ownerHoursPerWeek', label: 'Hours Stephanie works and classes she teaches per week', why: 'Owner dependence is the #1 reason small studios sell at a discount.', priority: 5, test: (p) => known(p.ownerHoursPerWeek) },
  { key: 'hasGeneralManager', label: 'Whether there is a general manager / studio managers', why: 'Management depth lets a buyer step in.', priority: 5, test: (p) => known(p.hasGeneralManager) },
  { key: 'leaseYearsRemaining', label: 'Years left on each lease and renewal options', why: 'Short leases scare buyers and lenders.', priority: 6, test: () => true, perLocation: (l) => known(l.leaseYearsRemaining) },
  { key: 'priorYearRevenue', label: 'Prior-year revenue', why: 'Shows the growth trend.', priority: 6, test: () => true, perLocation: (l) => known(l.priorYearRevenue) },
  { key: 'classCapacity', label: 'Classes per week, average attendance and room capacity', why: 'Shows how much room there is to grow without new space.', priority: 7, test: () => true, perLocation: (l) => known(l.avgClassAttendance) && known(l.roomCapacity) },
  { key: 'instructorClassification', label: 'Whether instructors are W-2 or 1099', why: 'A common diligence red flag.', priority: 7, test: (p) => p.instructorClassification !== 'unknown' },
  { key: 'sellTimelineMonths', label: 'When she would like to sell and her target price', why: 'Sets the pace of the roadmap.', priority: 1, test: (p) => known(p.sellTimelineMonths) || known(p.targetPrice) },
];

export function missingInputs(p: BusinessProfile): { missing: MissingInput[]; completeness: number } {
  const missing: MissingInput[] = [];
  let total = 0;
  let have = 0;
  for (const c of MISSING_CHECKS) {
    if (c.perLocation && p.locations.length) {
      for (const l of p.locations) {
        total++;
        if (c.perLocation(l)) have++;
        else missing.push({ key: `${l.id}.${c.key}`, label: `${l.name}: ${c.label}`, why: c.why, priority: c.priority });
      }
    } else if (c.perLocation) {
      // No locations yet; the 'locations' check covers this.
      total++;
    } else {
      total++;
      if (c.test(p)) have++;
      else missing.push({ key: c.key, label: c.label, why: c.why, priority: c.priority });
    }
  }
  missing.sort((a, b) => a.priority - b.priority);
  return { missing, completeness: total ? have / total : 0 };
}

// Small studios sell to owner-operators on SDE; bigger ones attract
// institutional buyers paying a multiple of adjusted EBITDA, and that multiple
// rises with size. Blending across the thresholds (instead of switching) keeps
// the value continuous, so lever impacts don't jump just because a line was crossed.
function priceIt(sde: number, adjustedEbitda: number, locationCount: number, score: number) {
  const { individual, strategic, platform } = BENCHMARKS.buyerLenses;
  const sdeWeight = 1 - clamp((adjustedEbitda - BENCHMARKS.sdeBlendStart) / (strategic.minEarnings - BENCHMARKS.sdeBlendStart));
  const sizeT = locationCount >= 3 ? clamp((adjustedEbitda - strategic.minEarnings) / (platform.minEarnings - strategic.minEarnings)) : 0;
  const eLow = strategic.low + (platform.low - strategic.low) * sizeT;
  const eHigh = strategic.high + (platform.high - strategic.high) * sizeT;
  // Readiness decides where in the buyer's range the business lands.
  const at = (lo: number, hi: number, shift: number) => Math.min(hi, Math.max(lo, lo + (hi - lo) * (score / 100) + shift));
  const valueAt = (shift: number) =>
    sdeWeight * Math.max(0, sde) * at(individual.low, individual.high, shift) +
    (1 - sdeWeight) * Math.max(0, adjustedEbitda) * at(eLow, eHigh, shift);
  const value = { low: valueAt(-0.4), mid: valueAt(0), high: valueAt(0.4) };
  const basis: 'SDE' | 'EBITDA' = sdeWeight >= 0.5 ? 'SDE' : 'EBITDA';
  const earnings = Math.max(0, basis === 'SDE' ? sde : adjustedEbitda);
  const lens: BuyerLens = sdeWeight >= 0.5 ? 'individual' : sizeT >= 1 ? 'platform' : 'strategic';
  const eff = (v: number) => (earnings > 0 ? v / earnings : 0);
  return { lens, basis, earnings, value, multiple: { low: eff(value.low), mid: eff(value.mid), high: eff(value.high) } };
}

export function computeValuation(p: BusinessProfile): Valuation {
  const locs = p.locations.map(locationMetrics);
  const revenue = locs.reduce((s, l) => s + l.revenue, 0);
  const expenses = locs.reduce((s, l) => s + l.expenses, 0);
  const fourWallEbitda = revenue - expenses;
  const reportedProfit = fourWallEbitda - n(p.ownerSalaryAnnual);
  const addBacks = n(p.personalExpensesInBooks) + n(p.oneTimeExpenses);
  // SDE: profit before the owner's pay, plus documented personal/one-time expenses.
  const sde = fourWallEbitda + addBacks;
  const ownerReplacementCost = p.hasGeneralManager
    ? 0
    : BENCHMARKS.gmSalaryLoaded * clamp(n(p.ownerHoursPerWeek) / 40) +
      n(p.ownerTeachesClassesPerWeek) * BENCHMARKS.instructorCostPerClass * 52;
  const adjustedEbitda = sde - ownerReplacementCost;

  const priorTotal = p.locations.reduce((s, l) => s + n(l.priorYearRevenue), 0);
  const allPrior = p.locations.length > 0 && p.locations.every((l) => known(l.priorYearRevenue));
  const memberLocs = p.locations.filter((l) => known(l.monthlyChurnPct));
  const churnPct = memberLocs.length
    ? memberLocs.reduce((s, l) => s + n(l.monthlyChurnPct) * (n(l.activeMembers) || 1), 0) /
      memberLocs.reduce((s, l) => s + (n(l.activeMembers) || 1), 0)
    : null;

  const totals: Valuation['totals'] = {
    revenue,
    expenses,
    fourWallEbitda,
    reportedProfit,
    addBacks,
    sde,
    ownerReplacementCost,
    adjustedEbitda,
    ebitdaMarginPct: revenue > 0 ? (adjustedEbitda / revenue) * 100 : null,
    recurringPct: revenueWeighted(p.locations, (l) => l.recurringRevenuePct),
    churnPct,
    growthPct: allPrior && priorTotal > 0 ? ((revenue - priorTotal) / priorTotal) * 100 : null,
    activeMembers: p.locations.reduce((s, l) => s + n(l.activeMembers), 0),
  };

  const factors = readinessFactors(p, totals, locs);
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const score = Math.round((factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight) * 100);

  const { lens, basis, earnings, multiple, value } = priceIt(sde, adjustedEbitda, p.locations.length, score);
  const { missing, completeness } = missingInputs(p);

  return {
    totals,
    lens,
    lensLabel: BENCHMARKS.buyerLenses[lens].label,
    basis,
    earnings,
    multiple,
    value,
    readiness: { score, factors },
    locations: locs,
    completeness,
    missing,
  };
}

// ---------------------------------------------------------------------------
// Value levers: "what is each improvement worth?" Each lever edits a copy of
// the profile and re-runs the engine, so the dollar impact includes both the
// earnings change and the multiple change.

type LeverDef = Omit<Lever, 'valueImpact'> & {
  applies: (p: BusinessProfile) => boolean;
  apply: (p: BusinessProfile) => void;
};

const clone = (p: BusinessProfile): BusinessProfile => JSON.parse(JSON.stringify(p));

function addRevenue(l: Location, amount: number) {
  l.annualRevenue = n(l.annualRevenue) + amount;
  // Small variable cost on incremental revenue (towels, card fees, laundry).
  l.otherOpexAnnual = n(l.otherOpexAnnual) + amount * (1 - BENCHMARKS.incrementalMargin);
}

const LEVERS: LeverDef[] = [
  {
    id: 'books',
    title: 'Get CPA-reviewed financials, separated by location',
    description: 'Monthly P&Ls per studio, reconciled to bank statements and reviewed by a CPA, for the 24 months before sale.',
    effort: 'medium',
    months: 3,
    applies: (p) => !['cpa_reviewed', 'audited'].includes(p.financialsQuality) || !p.booksSeparatedByLocation,
    apply: (p) => {
      p.financialsQuality = 'cpa_reviewed';
      p.booksSeparatedByLocation = true;
    },
  },
  {
    id: 'cash',
    title: 'Run 100% of revenue through the books',
    description: 'Buyers only pay for reported income. Unreported cash is worth $0 at closing (and is a legal risk).',
    effort: 'low',
    months: 12,
    applies: (p) => n(p.cashRevenueUnreportedPct) > 0,
    apply: (p) => {
      const pct = n(p.cashRevenueUnreportedPct) / 100;
      for (const l of p.locations) addRevenue(l, (n(l.annualRevenue) * pct) / (1 - pct));
      p.cashRevenueUnreportedPct = 0;
    },
  },
  {
    id: 'gm',
    title: 'Hire or promote a general manager and step back from teaching',
    description: 'Make the business run without Stephanie: a GM owns scheduling, staffing and studio managers; she teaches 0–2 classes a week.',
    effort: 'high',
    months: 6,
    applies: (p) => !p.hasGeneralManager && (n(p.ownerHoursPerWeek) > 15 || n(p.ownerTeachesClassesPerWeek) > 2),
    apply: (p) => {
      p.hasGeneralManager = true;
      // The GM's salary is now a real cost in payroll (spread across studios).
      const share = BENCHMARKS.gmSalaryLoaded / Math.max(1, p.locations.length);
      for (const l of p.locations) l.payrollAnnual = n(l.payrollAnnual) + share;
      const teachingCost = n(p.ownerTeachesClassesPerWeek) * BENCHMARKS.instructorCostPerClass * 52;
      if (p.locations[0]) p.locations[0].payrollAnnual = n(p.locations[0].payrollAnnual) + teachingCost;
      p.ownerHoursPerWeek = 10;
      p.ownerTeachesClassesPerWeek = 0;
      p.hasWrittenSOPs = true;
    },
  },
  {
    id: 'churn',
    title: `Cut membership cancellations to ${BENCHMARKS.goodMonthlyChurnPct}%/month`,
    description: 'Onboarding calls for new members, 30-day check-ins, freeze options instead of cancels, and win-back offers.',
    effort: 'medium',
    months: 6,
    applies: (p) => p.locations.some((l) => n(l.monthlyChurnPct) > BENCHMARKS.goodMonthlyChurnPct && n(l.activeMembers) > 0),
    apply: (p) => {
      for (const l of p.locations) {
        const churn = n(l.monthlyChurnPct);
        if (churn <= BENCHMARKS.goodMonthlyChurnPct || !l.activeMembers || !l.avgMonthlyDues) continue;
        // Same inflow, lower outflow → larger steady-state base, capped for a 12-month horizon.
        const growth = Math.min(BENCHMARKS.leverRevenueCapPct / 100, churn / BENCHMARKS.goodMonthlyChurnPct - 1);
        const extraMembers = l.activeMembers * growth;
        addRevenue(l, extraMembers * l.avgMonthlyDues * 12);
        l.activeMembers += extraMembers;
        l.monthlyChurnPct = BENCHMARKS.goodMonthlyChurnPct;
      }
    },
  },
  {
    id: 'price',
    title: 'Raise membership dues by $10/month',
    description: 'Grandfather loyal members for 90 days, add value (mat/towel service, guest passes), then move everyone to new pricing.',
    effort: 'low',
    months: 2,
    applies: (p) => p.locations.some((l) => n(l.activeMembers) > 0 && n(l.avgMonthlyDues) > 0),
    apply: (p) => {
      for (const l of p.locations) {
        if (!l.activeMembers || !l.avgMonthlyDues) continue;
        // Assume ~5% of members leave over a price increase.
        const kept = l.activeMembers * 0.95;
        const before = l.activeMembers * l.avgMonthlyDues * 12;
        const after = kept * (l.avgMonthlyDues + 10) * 12;
        addRevenue(l, after - before);
        l.activeMembers = kept;
        l.avgMonthlyDues += 10;
      }
    },
  },
  {
    id: 'recurring',
    title: `Convert class-pack buyers into memberships (${BENCHMARKS.goodRecurringPct}%+ recurring)`,
    description: 'Make the intro offer roll into autopay, price packs so membership is the obvious deal, and add annual prepay options.',
    effort: 'medium',
    months: 6,
    applies: (p) => p.locations.some((l) => known(l.recurringRevenuePct) && n(l.recurringRevenuePct) < BENCHMARKS.goodRecurringPct),
    apply: (p) => {
      for (const l of p.locations) {
        if (known(l.recurringRevenuePct) && n(l.recurringRevenuePct) < BENCHMARKS.goodRecurringPct) {
          l.recurringRevenuePct = BENCHMARKS.goodRecurringPct;
        }
      }
    },
  },
  {
    id: 'utilization',
    title: `Fill classes to ${BENCHMARKS.goodUtilizationPct}% of capacity`,
    description: 'Trim the weakest time slots, add classes at peak times, run referral and corporate-wellness programs.',
    effort: 'medium',
    months: 9,
    applies: (p) =>
      p.locations.some(
        (l) => l.avgClassAttendance && l.roomCapacity && (l.avgClassAttendance / l.roomCapacity) * 100 < BENCHMARKS.goodUtilizationPct,
      ),
    apply: (p) => {
      for (const l of p.locations) {
        if (!l.avgClassAttendance || !l.roomCapacity || !l.classesPerWeek || !l.avgMonthlyDues) continue;
        const target = (l.roomCapacity * BENCHMARKS.goodUtilizationPct) / 100;
        if (l.avgClassAttendance >= target) continue;
        const extraVisitsPerWeek = (target - l.avgClassAttendance) * l.classesPerWeek;
        const extraMembers = Math.min(
          extraVisitsPerWeek / BENCHMARKS.visitsPerMemberPerWeek,
          (n(l.annualRevenue) * BENCHMARKS.leverRevenueCapPct) / 100 / (l.avgMonthlyDues * 12),
        );
        addRevenue(l, extraMembers * l.avgMonthlyDues * 12);
        l.activeMembers = n(l.activeMembers) + extraMembers;
        l.avgClassAttendance = target;
      }
    },
  },
  {
    id: 'lease',
    title: 'Extend leases to 10+ years (with options) and make them assignable',
    description: 'Negotiate renewal options and an assignment clause now, while you are not under deal pressure.',
    effort: 'medium',
    months: 4,
    applies: (p) =>
      p.locations.some(
        (l) =>
          (known(l.leaseYearsRemaining) && n(l.leaseYearsRemaining) + n(l.leaseRenewalOptionYears) < BENCHMARKS.goodLeaseYears) ||
          l.leaseAssignable === false,
      ),
    apply: (p) => {
      for (const l of p.locations) {
        if (!known(l.leaseYearsRemaining)) continue;
        const total = n(l.leaseYearsRemaining) + n(l.leaseRenewalOptionYears);
        if (total < BENCHMARKS.goodLeaseYears) l.leaseRenewalOptionYears = BENCHMARKS.goodLeaseYears - n(l.leaseYearsRemaining);
        l.leaseAssignable = true;
      }
    },
  },
  {
    id: 'w2',
    title: 'Move instructors to W-2 (or get a written classification opinion)',
    description: 'Removes a diligence red flag. Costs roughly 8% more in payroll taxes, so it is a trade-off worth modeling with your CPA.',
    effort: 'medium',
    months: 3,
    applies: (p) => p.instructorClassification === '1099' || p.instructorClassification === 'mixed',
    apply: (p) => {
      const uplift = p.instructorClassification === '1099' ? 0.08 : 0.04;
      for (const l of p.locations) l.payrollAnnual = n(l.payrollAnnual) * (1 + uplift);
      p.instructorClassification = 'w2';
    },
  },
];

export function computeLevers(p: BusinessProfile): { levers: Lever[]; combinedValue: number; currentValue: number } {
  const base = computeValuation(p);
  const levers: Lever[] = [];
  const combined = clone(p);
  for (const def of LEVERS) {
    if (!def.applies(p)) continue;
    const scenario = clone(p);
    def.apply(scenario);
    def.apply(combined);
    const valueImpact = computeValuation(scenario).value.mid - base.value.mid;
    if (valueImpact <= 1_000) continue;
    const { applies: _a, apply: _b, ...lever } = def;
    levers.push({ ...lever, valueImpact });
  }
  levers.sort((a, b) => b.valueImpact - a.valueImpact);
  // Growth levers overlap (fuller classes and lower churn both mean more
  // members), so the combined plan caps total revenue growth.
  const maxGrowth = BENCHMARKS.planRevenueCapPct / 100;
  combined.locations.forEach((l, i) => {
    const orig = p.locations[i];
    const added = n(l.annualRevenue) - n(orig.annualRevenue);
    const allowed = n(orig.annualRevenue) * maxGrowth;
    if (added > allowed && added > 0) {
      const keep = allowed / added;
      l.annualRevenue = n(orig.annualRevenue) + added * keep;
      l.otherOpexAnnual = n(orig.otherOpexAnnual) + (n(l.otherOpexAnnual) - n(orig.otherOpexAnnual)) * keep;
    }
  });
  return { levers, combinedValue: computeValuation(combined).value.mid, currentValue: base.value.mid };
}

export function formatMoney(v: number, compact = true): string {
  if (!Number.isFinite(v)) return '—';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (compact && a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  if (compact && a >= 10_000) return `${sign}$${Math.round(a / 1_000)}K`;
  return `${sign}$${Math.round(a).toLocaleString('en-US')}`;
}
