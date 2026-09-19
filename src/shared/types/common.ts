export type JourneyType = 'loan' | 'insurance';

export type EmploymentType = 'salaried' | 'self-employed' | 'business';

export interface ApplicantBase {
  /** Name exactly as printed on the documents the applicant will upload. */
  fullName: string;
  age: number;
  annualIncome: number;
  employmentType: EmploymentType;
}

export interface LoanApplicant extends ApplicantBase {
  existingEMIs: number;
  creditScore: number;
  loanAmount: number;
  tenureMonths: number;
  /** Why the money is needed — chosen from LOAN_PURPOSES. */
  loanPurpose?: string;
}

export interface InsuranceApplicant extends ApplicantBase {
  coverageAmount: number;
  policyTermYears: number;
  preExistingConditions: string;
}

export type Applicant = LoanApplicant | InsuranceApplicant;

/** Bank account that receives the disbursal (or debits the EMI autopay). */
export interface BankDetails {
  accountHolder: string;
  accountNumber: string;
  /** Confirmed re-entry of the account number. */
  confirmAccountNumber: string;
  ifsc: string;
  bankName: string;
}

export interface Criteria {
  id: string;
  label: string;
  passed: boolean;
  reason: string;
  weight: number;
  suggestion?: string;
  /** Where the applicant stands vs. the cut-off, e.g. "₹18.0 L vs ₹6.0 L needed". */
  comparison?: string;
  /** false => this criterion can never be fixed by the applicant (e.g. age). */
  actionable?: boolean;
}

export interface EligibilityResult {
  verdict: 'eligible' | 'conditional' | 'not-eligible';
  score: number;
  criteria: Criteria[];
  suggestions: string[];
  /** One-paragraph plain-language summary of the decision. */
  summary: string;
  /** Rewards/penalties that nudged the score, shown as "how we got here". */
  notes?: string[];
}

export interface Document {
  id: string;
  name: string;
  required: boolean;
  acceptedTypes: string[];
  maxSizeMB: number;
  description: string;
  /** Human hint used by the simulated reviewer, e.g. "must show 3 recent months". */
  hint?: string;
}

/** A single inspection the simulated reviewer ran on an uploaded file. */
export interface DocumentCheck {
  id: string;
  label: string;
  status: 'pass' | 'warning' | 'fail';
  detail: string;
}

export interface ValidationResult {
  status: 'pass' | 'warning' | 'fail';
  /** Simulated model confidence for the readability pass, 0-100. */
  confidence: number;
  /** One-line plain-language verdict. */
  summary: string;
  /** Why, in human terms. */
  feedback: string;
  /** The concrete next step (empty when nothing needs fixing). */
  fixAction: string;
  checks: DocumentCheck[];
  /** Signals the reviewer spotted in the file name. */
  signals: string[];
}

export interface UploadedDocument {
  id: string;
  documentId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedAt: Date;
  status: 'pending' | 'pass' | 'fail' | 'warning';
  feedback?: string;
  fixAction?: string;
  summary?: string;
  confidence?: number;
  checks?: DocumentCheck[];
  signals?: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  intent?: ChatIntent;
  /** Terms the classifier matched, shown as a small transparency chip. */
  signals?: string[];
  confidence?: number;
}

export type ChatIntent =
  | 'status'
  | 'documents'
  | 'timeline'
  | 'amount'
  | 'eligibility'
  | 'improve'
  | 'repayment'
  | 'missed_payment'
  | 'policy'
  | 'contact'
  | 'cancel'
  | 'greeting'
  | 'general';

export interface Persona {
  id: string;
  name: string;
  description: string;
  /** Short label describing what this persona is meant to demo. */
  tag: string;
  applicant: Applicant;
}
