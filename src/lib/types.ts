// Shared data model for the Exit Copilot. Used by both the browser app and the
// server, so it must stay free of DOM and Node imports.

export type FinancialsQuality =
  | 'unknown'
  | 'shoebox' // receipts and bank statements only
  | 'tax_returns_only'
  | 'bookkeeper_pl' // monthly P&L from QuickBooks/Xero, not reviewed
  | 'cpa_reviewed'
  | 'audited';

export type InstructorClassification = 'unknown' | 'w2' | 'mixed' | '1099';

export interface Location {
  id: string;
  name: string;
  city?: string;
  openedYear?: number;
  // Annual (trailing twelve months) figures
  annualRevenue?: number;
  priorYearRevenue?: number;
  recurringRevenuePct?: number; // 0-100, memberships/autopay share of revenue
  payrollAnnual?: number; // instructors + front desk + managers, excluding the owner
  rentMonthly?: number; // base rent + CAM/NNN
  otherOpexAnnual?: number; // utilities, heat, marketing, software, insurance, supplies...
  // Membership health
  activeMembers?: number;
  avgMonthlyDues?: number;
  monthlyChurnPct?: number; // 0-100
  newMembersPerMonth?: number;
  // Capacity
  classesPerWeek?: number;
  avgClassAttendance?: number;
  roomCapacity?: number;
  // Lease
  leaseYearsRemaining?: number;
  leaseRenewalOptionYears?: number;
  leaseAssignable?: boolean;
  // People
  hasManager?: boolean;
}

export interface BusinessProfile {
  businessName: string;
  ownerName: string;
  entityType?: string;
  yearsInBusiness?: number;
  // Goals
  targetPrice?: number;
  sellTimelineMonths?: number;
  willingToStayMonths?: number; // transition period she'd accept after closing
  motivation?: string;
  // Owner involvement
  ownerSalaryAnnual?: number; // W-2 / draws the owner takes
  ownerHoursPerWeek?: number;
  ownerTeachesClassesPerWeek?: number;
  hasGeneralManager?: boolean;
  // Books & add-backs (company-wide, annual)
  financialsQuality: FinancialsQuality;
  booksSeparatedByLocation?: boolean;
  personalExpensesInBooks?: number; // owner's car, phone, family insurance, etc.
  oneTimeExpenses?: number; // non-recurring: buildout repairs, lawsuit, one-off consulting
  cashRevenueUnreportedPct?: number; // 0-100; flagged because buyers can't pay for it
  // Risk & systems
  instructorClassification: InstructorClassification;
  hasWrittenSOPs?: boolean;
  trademarkRegistered?: boolean;
  bookingSoftware?: string;
  googleRating?: number;
  googleReviewCount?: number;
  outstandingDebt?: number;
  notes: string[];
  locations: Location[];
}

export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskPhase = 'clean_up' | 'grow' | 'package' | 'sell';

export interface ActionItem {
  id: string;
  title: string;
  why: string;
  phase: TaskPhase;
  status: TaskStatus;
  estimatedValueImpact?: number; // dollars of enterprise value
  effort?: 'low' | 'medium' | 'high';
  targetMonth?: number; // months from today
  source: 'template' | 'coach';
}

export type DocumentKind =
  | 'tax_return'
  | 'profit_and_loss'
  | 'bank_statement'
  | 'lease'
  | 'membership_report'
  | 'payroll_report'
  | 'balance_sheet'
  | 'other';

export interface UploadedDocument {
  id: string;
  fileName: string;
  kind: DocumentKind;
  uploadedAt: string;
  summary: string;
  period?: string;
  locationId?: string;
  extracted: Record<string, number | string | boolean>;
  redFlags: string[];
}

export interface AppState {
  version: 1;
  profile: BusinessProfile;
  tasks: ActionItem[];
  documents: UploadedDocument[];
  onboardingComplete: boolean;
}

export function emptyProfile(): BusinessProfile {
  return {
    businessName: 'JTown Hot Yoga',
    ownerName: 'Stephanie',
    financialsQuality: 'unknown',
    instructorClassification: 'unknown',
    notes: [],
    locations: [],
  };
}
