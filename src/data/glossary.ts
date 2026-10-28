// Plain-English definitions shown in "What does this mean?" popovers. The coach
// can go deeper, but these work offline and give consistent wording.

export interface GlossaryEntry {
  term: string;
  short: string;
  long: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  valuation: {
    term: 'Estimated sale value',
    short: 'What a buyer would likely pay for the business today, as a range.',
    long: 'Small businesses are priced as a multiple of their earnings. The range reflects the type of buyer your size attracts and how "ready" the business looks. It is an estimate for planning — a broker or valuation firm will refine it with comparable sales.',
  },
  sde: {
    term: "SDE (Seller's Discretionary Earnings)",
    short: 'The total cash benefit one owner-operator gets from the business in a year.',
    long: 'Start with profit, add back the owner\'s own salary, plus personal or one-time expenses run through the business. It answers: "If I bought this and ran it myself, how much would I make?" Owner-operator buyers price studios as a multiple of SDE (typically ~2–3.5x).',
  },
  adjustedEbitda: {
    term: 'Adjusted EBITDA',
    short: 'Profit after paying someone a market salary to do the owner\'s job.',
    long: 'EBITDA = earnings before interest, taxes, depreciation and amortization. "Adjusted" adds back one-time and personal costs, then subtracts what it would cost to replace the owner (a general manager, substitute instructors). Larger buyers — regional operators, franchisors, private equity — price on this number, typically ~3–7x depending on size.',
  },
  multiple: {
    term: 'Multiple',
    short: 'How many years of earnings a buyer will pay up front.',
    long: 'A 3x multiple on $400K of earnings is $1.2M. The multiple goes up when earnings are predictable (memberships, low churn), growing, verifiable (clean books), and not dependent on the owner. It also goes up with size, because bigger businesses attract more — and more sophisticated — buyers.',
  },
  addBacks: {
    term: 'Add-backs',
    short: 'Expenses in the books that a new owner would not have.',
    long: 'Examples: the owner\'s car or phone, family health insurance, a one-time roof repair or lawsuit, a relative on payroll who does not work there. Each documented add-back raises SDE/EBITDA — and every $1 of earnings is worth several dollars at sale. Undocumented add-backs get rejected in diligence.',
  },
  fourWall: {
    term: 'Four-wall profit',
    short: 'What one studio earns before company-level costs and the owner\'s pay.',
    long: 'Revenue for that location minus its own payroll, rent and operating costs. Buyers look at each studio separately; a strong studio can carry a weak one in your bank account, but not in a buyer\'s model.',
  },
  readiness: {
    term: 'Exit-readiness score',
    short: 'How attractive and low-risk the business looks to a buyer (0–100).',
    long: 'Combines the things buyers diligence: clean books, recurring revenue, retention, growth, margin, owner dependence, lease security, utilization, compliance, brand and consistency across locations. The score decides where you land inside the buyer\'s multiple range.',
  },
  recurring: {
    term: 'Recurring revenue %',
    short: 'Share of revenue from autopay memberships.',
    long: 'Memberships renew automatically; class packs and drop-ins must be re-sold every time. Buyers pay the most for predictable revenue — aim for 75–85%+.',
  },
  churn: {
    term: 'Monthly churn',
    short: 'Share of members who cancel each month.',
    long: 'If you have 400 members and 24 cancel in a month, churn is 6%. Lower churn means members stay longer (5% churn ≈ 20-month average membership; 3% ≈ 33 months), so each new member is worth more and revenue is more durable.',
  },
  utilization: {
    term: 'Class utilization',
    short: 'Average students per class divided by room capacity.',
    long: '18 students in a 35-mat room is 51%. Room to grow without new rent is attractive, but very low utilization can signal weak demand. 60–80% is a healthy target.',
  },
  ltv: {
    term: 'Member lifetime value',
    short: 'Total dues an average member pays before cancelling.',
    long: 'Monthly dues ÷ monthly churn. At $139 dues and 6% churn, LTV is about $2,300. It tells you how much you can afford to spend to win a new member.',
  },
  rentPct: {
    term: 'Rent as % of revenue',
    short: 'Occupancy cost burden for a studio.',
    long: 'Heated studios need specialized buildouts, so rent is a big fixed cost. Under ~15% is strong; over ~22% squeezes profit.',
  },
  payrollPct: {
    term: 'Payroll as % of revenue',
    short: 'Instructor and staff cost burden (excluding the owner).',
    long: 'Around 25–35% is typical for boutique studios. Higher usually means classes are under-filled or pay is per-class without regard to attendance.',
  },
  ownerDependence: {
    term: 'Owner dependence',
    short: 'How much the business relies on Stephanie personally.',
    long: 'If she teaches the most popular classes, does the schedule, handles payroll and is the face of the brand, a buyer worries the members and staff leave when she does. A GM, studio managers and written procedures fix this — and are among the highest-return moves before a sale.',
  },
  lease: {
    term: 'Lease security',
    short: 'Years of guaranteed occupancy a buyer would inherit.',
    long: 'Count remaining term plus renewal options. Buyers and SBA lenders typically want the lease term to cover the loan (often 10 years). The lease also needs to be assignable to a new owner without the landlord being able to block or re-price it.',
  },
  classification: {
    term: 'Instructor classification (W-2 vs 1099)',
    short: 'Whether instructors are employees or independent contractors.',
    long: 'Instructors who teach on your schedule, in your studio, using your methods often look like employees under IRS and state tests. If they are paid as 1099 contractors, a buyer will flag potential back taxes and penalties. Get professional advice — this is not legal advice.',
  },
  qoe: {
    term: 'Quality of Earnings (QoE)',
    short: 'An accounting firm\'s deep-dive that verifies your adjusted earnings.',
    long: 'Institutional buyers commission one during diligence. Commissioning a sell-side QoE first lets you find and fix issues before a buyer uses them to cut the price.',
  },
  loi: {
    term: 'LOI (Letter of Intent)',
    short: 'A buyer\'s written offer with price and key terms.',
    long: 'Usually non-binding except for exclusivity. Compare LOIs on cash at close, seller financing, earn-outs, working-capital targets, and how long you must stay — not just the headline number.',
  },
  earnout: {
    term: 'Earn-out',
    short: 'Part of the price paid later, only if the business hits targets.',
    long: 'Bridges a gap between what you think the business is worth and what the buyer will guarantee. Riskier for the seller because the buyer controls the business after closing.',
  },
  dataRoom: {
    term: 'Data room',
    short: 'An organized folder of every document a buyer will ask for.',
    long: 'Tax returns, monthly P&Ls by studio, bank statements, leases, membership and attendance reports, payroll, contracts, insurance, equipment lists. Having it ready shortens diligence and signals a well-run business.',
  },
  rollup: {
    term: 'Roll-up',
    short: 'A buyer (often private-equity backed) acquiring many similar businesses.',
    long: 'Platforms pay higher multiples for larger, well-run multi-location businesses because combined they are worth more. Most institutional buyers look for ~$1M+ of EBITDA, so smaller studios usually sell to regional operators, franchisors converting studios, or individual buyers.',
  },
};
