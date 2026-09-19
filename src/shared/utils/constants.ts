import type { JourneyType, Document, Persona, EmploymentType } from '../types/common';

/**
 * Why is the applicant taking this personal loan? Underwriting uses the stated
 * purpose to price the product; the assistant and the PDF statement quote it
 * back so the applicant can see the whole file at a glance.
 */
export const LOAN_PURPOSES = [
  'medical',
  'wedding',
  'home renovation',
  'education',
  'debt consolidation',
  'travel',
  'business',
  'vehicle',
] as const;

export type LoanPurpose = (typeof LOAN_PURPOSES)[number];

/** Banks offered in the disbursal-account picker (proper nouns stay English). */
export const BANK_OPTIONS = [
  'HDFC Bank',
  'ICICI Bank',
  'State Bank of India',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Paytm Payments Bank',
  'Punjab National Bank',
  'Bank of Baroda',
] as const;

export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export const JOURNEY_CONFIG = {
  loan: {
    title: 'Personal Loan',
    subtitle: 'Quick approval, flexible tenure',
    icon: 'credit-card',
    fields: [
      { key: 'fullName', label: 'Full Name (as on documents)', type: 'text', placeholder: 'e.g., Rahul Sharma', required: true },
      { key: 'age', label: 'Age', type: 'number', min: 21, max: 65, required: true },
      { key: 'annualIncome', label: 'Annual Income (₹)', type: 'number', min: 150000, step: 50000, required: true },
      { key: 'employmentType', label: 'Employment Type', type: 'select', options: ['salaried', 'self-employed', 'business'], required: true },
      { key: 'existingEMIs', label: 'Existing Monthly EMIs (₹)', type: 'number', min: 0, step: 1000, required: true },
      { key: 'creditScore', label: 'Credit Score', type: 'number', min: 300, max: 900, required: true },
      { key: 'loanAmount', label: 'Loan Amount (₹)', type: 'number', min: 50000, max: 5000000, step: 50000, required: true },
      { key: 'tenureMonths', label: 'Tenure (Months)', type: 'select', options: [12, 24, 36, 48, 60, 72, 84, 96, 120], required: true },
    ],
    minIncome: 150000,
    minCreditScore: 650,
    maxFOIR: 0.5,
    minAge: 21,
    maxAge: 65,
    /** Indicative annual rate used for EMI maths in the assistant. */
    annualInterestRate: 0.115,
    processorFeePct: 0.02,
  },
  insurance: {
    title: 'Term Insurance',
    subtitle: 'High coverage, affordable premiums',
    icon: 'shield',
    fields: [
      { key: 'fullName', label: 'Full Name (as on documents)', type: 'text', placeholder: 'e.g., Ananya Desai', required: true },
      { key: 'age', label: 'Age', type: 'number', min: 18, max: 60, required: true },
      { key: 'annualIncome', label: 'Annual Income (₹)', type: 'number', min: 200000, step: 50000, required: true },
      { key: 'employmentType', label: 'Employment Type', type: 'select', options: ['salaried', 'self-employed', 'business'], required: true },
      { key: 'coverageAmount', label: 'Coverage Amount (₹)', type: 'number', min: 2500000, max: 100000000, step: 500000, required: true },
      { key: 'policyTermYears', label: 'Policy Term (Years)', type: 'select', options: [10, 15, 20, 25, 30], required: true },
      { key: 'preExistingConditions', label: 'Pre-existing Conditions', type: 'text', placeholder: 'e.g., Diabetes, Hypertension (or "None")', required: false },
    ],
    minIncome: 200000,
    minAge: 18,
    maxAge: 60,
    maxCoverageMultiplier: 25,
    maxMaturityAge: 75,
  },
} as const;

/**
 * Indicative premium per ₹1 lakh of cover per year, by age band.
 * Used by the assistant to answer "what will this cost me?" with real numbers
 * instead of a canned line.
 */
export const PREMIUM_TABLE: { maxAge: number; ratePerLakhPerYear: number }[] = [
  { maxAge: 30, ratePerLakhPerYear: 110 },
  { maxAge: 40, ratePerLakhPerYear: 165 },
  { maxAge: 50, ratePerLakhPerYear: 320 },
  { maxAge: 60, ratePerLakhPerYear: 620 },
  { maxAge: 200, ratePerLakhPerYear: 900 },
];

/** Medical loading applied when a pre-existing condition is declared. */
export const PRE_EXISTING_LOADING = 0.4;

export const DOCUMENT_REQUIREMENTS: Record<JourneyType, Document[]> = {
  loan: [
    {
      id: 'pan',
      name: 'PAN Card',
      required: true,
      acceptedTypes: ['image/png', 'image/jpeg', 'application/pdf'],
      maxSizeMB: 5,
      description: 'Clear photo or scan of your PAN card',
      hint: 'Name and PAN number must be readable',
    },
    {
      id: 'aadhaar',
      name: 'Aadhaar Card',
      required: true,
      acceptedTypes: ['image/png', 'image/jpeg', 'application/pdf'],
      maxSizeMB: 5,
      description: 'Front and back of your Aadhaar',
      hint: 'Both sides, address clearly visible',
    },
    {
      id: 'salary_slips',
      name: 'Salary Slips (Last 3 months)',
      required: true,
      acceptedTypes: ['application/pdf'],
      maxSizeMB: 5,
      description: 'Three most recent salary slips',
      hint: 'Must cover the last 3 months',
    },
    {
      id: 'bank_statement',
      name: 'Bank Statement (Last 6 months)',
      required: true,
      acceptedTypes: ['application/pdf'],
      maxSizeMB: 5,
      description: 'Statement of your salary account',
      hint: 'Must cover a full 6-month period',
    },
    {
      id: 'form16',
      name: 'Form 16 / IT Returns',
      required: false,
      acceptedTypes: ['application/pdf'],
      maxSizeMB: 5,
      description: 'Latest financial year',
      hint: 'Latest assessment year preferred',
    },
  ],
  insurance: [
    {
      id: 'pan',
      name: 'PAN Card',
      required: true,
      acceptedTypes: ['image/png', 'image/jpeg', 'application/pdf'],
      maxSizeMB: 5,
      description: 'Clear photo or scan of your PAN card',
      hint: 'Name and PAN number must be readable',
    },
    {
      id: 'aadhaar',
      name: 'Aadhaar Card',
      required: true,
      acceptedTypes: ['image/png', 'image/jpeg', 'application/pdf'],
      maxSizeMB: 5,
      description: 'Front and back of your Aadhaar',
      hint: 'Both sides, address clearly visible',
    },
    {
      id: 'income_proof',
      name: 'Income Proof',
      required: true,
      acceptedTypes: ['application/pdf'],
      maxSizeMB: 5,
      description: 'Salary slips / IT Returns / Form 16',
      hint: 'Must be from the current financial year',
    },
    {
      id: 'medical_reports',
      name: 'Medical Reports (if any)',
      required: false,
      acceptedTypes: ['application/pdf', 'image/png', 'image/jpeg'],
      maxSizeMB: 5,
      description: 'Recent medical test reports',
      hint: 'Reports not older than 3 months',
    },
    {
      id: 'photo',
      name: 'Passport Size Photo',
      required: true,
      acceptedTypes: ['image/png', 'image/jpeg'],
      maxSizeMB: 2,
      description: 'Recent colour photograph',
      hint: 'Plain background, face clearly visible',
    },
  ],
};

export const LOAN_PERSONAS: Persona[] = [
  {
    id: 'salaried_pro',
    name: 'Rahul Sharma',
    description: 'Salaried, strong CIBIL, low existing EMIs',
    tag: 'Clean approval',
    applicant: {
      fullName: 'Rahul Sharma',
      age: 28,
      annualIncome: 1800000,
      employmentType: 'salaried',
      existingEMIs: 15000,
      creditScore: 780,
      loanAmount: 1000000,
      tenureMonths: 60,
    },
  },
  {
    id: 'self_employed',
    name: 'Priya Nair',
    description: 'Self-employed, high income, no existing EMIs',
    tag: 'Good income, no debt',
    applicant: {
      fullName: 'Priya Nair',
      age: 35,
      annualIncome: 2500000,
      employmentType: 'self-employed',
      existingEMIs: 0,
      creditScore: 720,
      loanAmount: 1500000,
      tenureMonths: 84,
    },
  },
  {
    id: 'low_credit',
    name: 'Amit Verma',
    description: 'Income is fine, credit score is the blocker',
    tag: 'Conditional / rejected',
    applicant: {
      fullName: 'Amit Verma',
      age: 30,
      annualIncome: 1200000,
      employmentType: 'salaried',
      existingEMIs: 8000,
      creditScore: 580,
      loanAmount: 500000,
      tenureMonths: 48,
    },
  },
  {
    id: 'high_income',
    name: 'Sneha Iyer',
    description: 'Top-tier profile asking for a large loan',
    tag: 'High value',
    applicant: {
      fullName: 'Sneha Iyer',
      age: 40,
      annualIncome: 5000000,
      employmentType: 'salaried',
      existingEMIs: 50000,
      creditScore: 800,
      loanAmount: 4000000,
      tenureMonths: 120,
    },
  },
];

export const INSURANCE_PERSONAS: Persona[] = [
  {
    id: 'young_pro',
    name: 'Ananya Desai',
    description: '26, salaried, seeks ₹1 Cr cover',
    tag: 'Cheapest premium',
    applicant: {
      fullName: 'Ananya Desai',
      age: 26,
      annualIncome: 1500000,
      employmentType: 'salaried',
      coverageAmount: 10000000,
      policyTermYears: 20,
      preExistingConditions: 'None',
    },
  },
  {
    id: 'family_breadwinner',
    name: 'Vikram Malhotra',
    description: '38, two dependents, ₹2 Cr cover',
    tag: 'High cover',
    applicant: {
      fullName: 'Vikram Malhotra',
      age: 38,
      annualIncome: 3500000,
      employmentType: 'salaried',
      coverageAmount: 20000000,
      policyTermYears: 25,
      preExistingConditions: 'None',
    },
  },
  {
    id: 'pre_existing',
    name: 'Farhan Qureshi',
    description: '45, diabetes declared, ₹1.5 Cr cover',
    tag: 'Premium loading',
    applicant: {
      fullName: 'Farhan Qureshi',
      age: 45,
      annualIncome: 2800000,
      employmentType: 'self-employed',
      coverageAmount: 15000000,
      policyTermYears: 15,
      preExistingConditions: 'Diabetes',
    },
  },
  {
    id: 'senior',
    name: 'Lakshmi Raman',
    description: '55, hypertension, shorter term',
    tag: 'Age-sensitive',
    applicant: {
      fullName: 'Lakshmi Raman',
      age: 55,
      annualIncome: 2000000,
      employmentType: 'salaried',
      coverageAmount: 5000000,
      policyTermYears: 10,
      preExistingConditions: 'Hypertension',
    },
  },
];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  salaried: 'Salaried',
  'self-employed': 'Self-Employed',
  business: 'Business Owner',
};

export const VERDICT_LABELS = {
  eligible: 'Eligible',
  conditional: 'Conditionally Eligible',
  'not-eligible': 'Not Eligible',
} as const;

export const VERDICT_COLORS = {
  eligible: 'success',
  conditional: 'warning',
  'not-eligible': 'error',
} as const;

/**
 * Processing stages shown to the applicant for each journey. Stage 4
 * ("Final decision") is where the approve/reject outcome lands, so the demo
 * can show both the approval and the rejection path end to end.
 */
export const JOURNEY_STAGES: Record<JourneyType, string[]> = {
  loan: ['Application received', 'Eligibility check', 'Document verification', 'Under review', 'Final decision', 'Disbursement'],
  insurance: ['Application received', 'Eligibility check', 'Document verification', 'Under review', 'Final decision', 'Policy issued'],
};

/** Messages the simulated AI narrates while it "works". */
export const ELIGIBILITY_PROCESSING_STEPS = [
  'Reading your profile…',
  'Scoring 6 underwriting criteria…',
  'Comparing against policy rules…',
  'Writing your explanation…',
];

export const DOCUMENT_PROCESSING_STEPS = [
  'Reading the document…',
  'Extracting text and name fields…',
  'Cross-checking against your application…',
  'Writing feedback…',
];
