import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLevers, computeValuation, missingInputs } from './valuation';
import { emptyProfile, type BusinessProfile } from './types';
import { applyProfileUpdates } from './profileUpdates';

// Test fixture: a fully populated three-studio profile for exercising the engine.
function fixture(): BusinessProfile {
  return {
    ...emptyProfile(),
    entityType: 'S-Corp',
    yearsInBusiness: 14,
    targetPrice: 2_500_000,
    sellTimelineMonths: 18,
    willingToStayMonths: 6,
    motivation: 'Ready for the next chapter; wants a buyer who keeps the community and instructors.',
    ownerSalaryAnnual: 95_000,
    ownerHoursPerWeek: 45,
    ownerTeachesClassesPerWeek: 6,
    hasGeneralManager: false,
    financialsQuality: 'tax_returns_only',
    booksSeparatedByLocation: false,
    personalExpensesInBooks: 18_000,
    oneTimeExpenses: 22_000,
    cashRevenueUnreportedPct: 0,
    instructorClassification: '1099',
    hasWrittenSOPs: false,
    trademarkRegistered: false,
    bookingSoftware: 'Mindbody',
    googleRating: 4.8,
    googleReviewCount: 310,
    locations: [
      {
        id: 'jenkintown',
        name: 'Jenkintown',
        city: 'Jenkintown, PA',
        openedYear: 2011,
        annualRevenue: 720_000,
        priorYearRevenue: 690_000,
        recurringRevenuePct: 68,
        payrollAnnual: 230_000,
        rentMonthly: 11_500,
        otherOpexAnnual: 150_000,
        activeMembers: 420,
        avgMonthlyDues: 139,
        monthlyChurnPct: 6,
        newMembersPerMonth: 28,
        classesPerWeek: 42,
        avgClassAttendance: 18,
        roomCapacity: 35,
        leaseYearsRemaining: 3,
        leaseRenewalOptionYears: 5,
        hasManager: true,
      },
      {
        id: 'maple-shade',
        name: 'Maple Shade',
        city: 'Maple Shade, NJ',
        openedYear: 2016,
        annualRevenue: 510_000,
        priorYearRevenue: 495_000,
        recurringRevenuePct: 61,
        payrollAnnual: 170_000,
        rentMonthly: 9_800,
        otherOpexAnnual: 118_000,
        activeMembers: 300,
        avgMonthlyDues: 129,
        monthlyChurnPct: 7,
        newMembersPerMonth: 22,
        classesPerWeek: 36,
        avgClassAttendance: 15,
        roomCapacity: 32,
        leaseYearsRemaining: 5,
        leaseRenewalOptionYears: 0,
        hasManager: false,
      },
      {
        id: 'manayunk',
        name: 'Manayunk',
        city: 'Philadelphia, PA',
        openedYear: 2017,
        annualRevenue: 380_000,
        priorYearRevenue: 400_000,
        recurringRevenuePct: 55,
        payrollAnnual: 150_000,
        rentMonthly: 10_400,
        otherOpexAnnual: 96_000,
        activeMembers: 210,
        avgMonthlyDues: 135,
        monthlyChurnPct: 8,
        newMembersPerMonth: 18,
        classesPerWeek: 30,
        avgClassAttendance: 12,
        roomCapacity: 30,
        leaseYearsRemaining: 2,
        leaseRenewalOptionYears: 5,
        leaseAssignable: false,
        hasManager: false,
      },
    ],
  };
}


test('empty profile values at zero and asks for locations first', () => {
  const v = computeValuation(emptyProfile());
  assert.equal(v.value.mid, 0);
  assert.equal(v.missing[0].key, 'locations');
});

test('full profile: SDE = four-wall profit + add-backs', () => {
  const p = fixture();
  const v = computeValuation(p);
  const expenses = p.locations.reduce(
    (s, l) => s + (l.payrollAnnual ?? 0) + (l.rentMonthly ?? 0) * 12 + (l.otherOpexAnnual ?? 0),
    0,
  );
  assert.equal(v.totals.revenue, 1_610_000);
  assert.equal(v.totals.sde, 1_610_000 - expenses + 40_000);
  assert.ok(v.totals.adjustedEbitda < v.totals.sde, 'owner replacement cost is deducted');
  assert.ok(v.value.low <= v.value.mid && v.value.mid <= v.value.high);
  assert.ok(v.readiness.score > 0 && v.readiness.score < 100);
  assert.equal(v.missing.length, 0);
});

test('levers are positive and the combined plan beats today', () => {
  const p = fixture();
  const { levers, combinedValue, currentValue } = computeLevers(p);
  assert.ok(levers.length >= 4);
  for (const l of levers) assert.ok(l.valueImpact > 0, l.id);
  assert.ok(combinedValue > currentValue);
});

test('missing inputs are tracked per location', () => {
  const p = emptyProfile();
  p.locations.push({ id: 'a', name: 'Jenkintown' });
  const { missing, completeness } = missingInputs(p);
  assert.ok(missing.some((m) => m.key === 'a.annualRevenue'));
  assert.ok(completeness > 0 && completeness < 0.2);
});

test('profile updates: validates fields, creates locations, rejects junk', () => {
  const p = emptyProfile();
  const res = applyProfileUpdates(p, [
    { field: 'location.add', value: 'Jenkintown' },
    { field: 'annualRevenue', location: 'Jenkintown', value: 720000 },
    { field: 'monthlyChurnPct', location: 'jenkintown', value: '6%' },
    { field: 'hasGeneralManager', value: 'no' },
    { field: 'financialsQuality', value: 'cpa_reviewed' },
    { field: 'bogus', value: 1 },
    { field: 'rentMonthly', location: 'Nowhere', value: 5 },
  ]);
  assert.equal(p.locations.length, 1);
  assert.equal(p.locations[0].annualRevenue, 720000);
  assert.equal(p.locations[0].monthlyChurnPct, 6);
  assert.equal(p.hasGeneralManager, false);
  assert.equal(p.financialsQuality, 'cpa_reviewed');
  assert.equal(res.errors.length, 2);
});

test('value rises smoothly with earnings (no cliffs at buyer thresholds)', () => {
  let prev = 0;
  for (let ebitda = 100_000; ebitda <= 1_500_000; ebitda += 25_000) {
    const p = fixture();
    p.hasGeneralManager = true;
    p.personalExpensesInBooks = 0;
    p.oneTimeExpenses = 0;
    p.locations = p.locations.map((l, i) =>
      i === 0 ? { ...l, annualRevenue: ebitda * 5, payrollAnnual: ebitda * 4, rentMonthly: 0, otherOpexAnnual: 0 } : { id: l.id, name: l.name },
    );
    const v = computeValuation(p).value.mid;
    assert.ok(v > prev, `value should increase at ${ebitda}`);
    // Value may grow faster than earnings (the multiple rises with size), but only gently.
    const earningsGrowth = ebitda / (ebitda - 25_000);
    if (prev) assert.ok(v / prev < earningsGrowth * 1.1, `jump too large at ${ebitda}: ${prev} -> ${v}`);
    prev = v;
  }
});
