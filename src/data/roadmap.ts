import type { ActionItem, AppState } from '../lib/types';
import { emptyProfile } from '../lib/types';

const t = (
  id: string,
  phase: ActionItem['phase'],
  targetMonth: number,
  effort: ActionItem['effort'],
  title: string,
  why: string,
): ActionItem => ({ id, phase, targetMonth, effort, title, why, status: 'todo', source: 'template' });

// The standard sell-side playbook for a multi-location studio, in order.
export function templateTasks(): ActionItem[] {
  return [
    t('t-bookkeeper', 'clean_up', 1, 'medium', 'Move to monthly bookkeeping with a separate P&L for each studio', 'Buyers value each studio on its own four-wall profit. Mixed books force them to guess — and they guess low.'),
    t('t-addbacks', 'clean_up', 1, 'low', 'List every personal or one-time expense run through the business (with receipts)', 'Each documented add-back raises earnings, and every $1 of earnings is worth $2–$5 at sale.'),
    t('t-cpa', 'clean_up', 3, 'medium', 'Have a CPA review the last 2 years and the current year to date', 'Reviewed financials survive diligence; unreviewed ones get re-traded after the LOI.'),
    t('t-leases', 'clean_up', 3, 'medium', 'Pull all three leases; note term, options, assignment and personal-guarantee clauses', 'Lease term and assignability are deal-breakers for buyers and their lenders.'),
    t('t-classification', 'clean_up', 3, 'medium', 'Review instructor classification (W-2 vs 1099) with an employment attorney or CPA', 'Misclassification is a common diligence finding and buyers will escrow money against it.'),
    t('t-entity', 'clean_up', 2, 'low', 'Confirm entity structure, ownership docs, and trademark status for the JTown name', 'You can only sell what you clearly own. A registered mark protects the brand value.'),
    t('t-retention', 'grow', 4, 'medium', 'Launch a retention program: new-member onboarding, 30/60/90-day check-ins, freeze instead of cancel', 'Lower cancellations compound into a bigger recurring base — the #1 multiple driver.'),
    t('t-pricing', 'grow', 4, 'low', 'Review pricing vs. local competitors and plan a dues increase', 'Price increases flow almost 100% to profit.'),
    t('t-intro', 'grow', 5, 'low', 'Make the intro offer roll into autopay membership by default', 'Converts trial students into recurring revenue.'),
    t('t-gm', 'grow', 6, 'high', 'Hire or promote a general manager; document SOPs for every role', 'A business that runs without its owner sells for a meaningfully higher multiple.'),
    t('t-schedule', 'grow', 6, 'medium', 'Audit the class schedule: cut the emptiest slots, add peak-time classes', 'Raises utilization and lowers instructor cost per student.'),
    t('t-weak', 'grow', 8, 'high', 'Decide on any underperforming studio: fix, relocate, or close before marketing', 'One money-losing location can drag down the price of the other two.'),
    t('t-dataroom', 'package', 10, 'medium', 'Build the data room: 3 years tax returns, monthly P&Ls, bank statements, leases, membership reports', 'A ready data room shortens diligence and signals a well-run business.'),
    t('t-qoe', 'package', 12, 'medium', 'Consider a sell-side Quality of Earnings (QoE) report', 'Larger buyers will do one anyway; doing it first means you control the story.'),
    t('t-advisor', 'package', 12, 'low', 'Interview 2–3 M&A advisors or brokers who have sold fitness businesses', 'A competitive process with multiple buyers is how you get top-of-range pricing.'),
    t('t-cim', 'sell', 14, 'medium', 'Prepare the teaser and confidential information memorandum (CIM)', 'Tells the growth story and presents the adjusted numbers professionally.'),
    t('t-buyers', 'sell', 15, 'medium', 'Go to market: regional operators, franchisors, PE-backed platforms, individual buyers', 'More bidders = better price and terms.'),
    t('t-loi', 'sell', 16, 'medium', 'Compare LOIs on total value, not just headline price (earn-outs, seller notes, transition)', 'Structure can swing real proceeds by 20%+.'),
    t('t-close', 'sell', 18, 'high', 'Diligence, landlord consents, purchase agreement, close', 'Keep running the business at full speed — results during diligence matter.'),
  ];
}

export function initialState(): AppState {
  return { version: 1, profile: emptyProfile(), tasks: templateTasks(), documents: [], onboardingComplete: false };
}
