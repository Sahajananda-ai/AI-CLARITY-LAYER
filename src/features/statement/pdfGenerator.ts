import { jsPDF } from 'jspdf';
import type {
  Applicant,
  EligibilityResult,
  JourneyType,
  LoanApplicant,
  InsuranceApplicant,
  UploadedDocument,
} from '../../shared/types/common';
import type { NotificationRecord } from '../notifications/engine';
import type { TranslationDict } from '../../shared/i18n';
import { JOURNEY_CONFIG, PREMIUM_TABLE, VERDICT_LABELS, PRE_EXISTING_LOADING } from '../../shared/utils/constants';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import { calculateEmi, estimateAnnualPremium } from '../eligibility/engine';

/**
 * Downloadable statement, generated entirely on-device with jsPDF.
 *
 * Six sections, each in its own labelled block:
 *   1. Application summary   — applicant, product, reference, current stage
 *   2. Eligibility verdict   — score, verdict, criterion-by-criterion table
 *   3. Documents verified    — each document and its review outcome
 *   4. What you will pay     — EMI/premium maths computed from the application
 *   5. How your product works — repayment rules, missed-payment policy,
 *                              premium rules, claim process (policy explainer)
 *   6. Notifications sent    — every SMS/WhatsApp milestone on record
 *
 * Section titles render in the active UI language; the body stays English so
 * the financial terms stay unambiguous for the demo.
 */

interface StatementInput {
  journeyType: JourneyType;
  applicant: Applicant;
  eligibility: EligibilityResult;
  uploadedDocs: UploadedDocument[];
  notifications: NotificationRecord[];
  reference: string;
  stageLabel: string;
  language: 'en' | 'hi' | 'kn';
  dict: TranslationDict;
}

const MARGIN = 16;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BRAND = { r: 37, g: 99, b: 235 }; // primary-600
const INK = { r: 15, g: 23, b: 42 }; // surface-900
const MUTED = { r: 100, g: 116, b: 139 }; // surface-500
const SURFACE = { r: 241, g: 245, b: 249 }; // surface-100

class PdfWriter {
  private pdf: jsPDF;
  private input: StatementInput;
  private y = MARGIN;

  constructor(input: StatementInput) {
    this.input = input;
    this.pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  }

  private ensureSpace(needed: number) {
    if (this.y + needed > PAGE_H - MARGIN - 14) this.newPage();
  }

  private newPage() {
    this.pdf.addPage();
    this.y = MARGIN;
  }

  setFill(color: { r: number; g: number; b: number }) {
    this.pdf.setFillColor(color.r, color.g, color.b);
  }

  private setText(color: { r: number; g: number; b: number }) {
    this.pdf.setTextColor(color.r, color.g, color.b);
  }

  private font(style: 'normal' | 'bold' | 'italic', size: number) {
    this.pdf.setFont('helvetica', style);
    this.pdf.setFontSize(size);
  }

  sectionTitle(text: string) {
    this.ensureSpace(22);
    this.setFill(BRAND);
    this.rect(MARGIN, this.y, CONTENT_W, 8, 'F');
    this.setText({ r: 255, g: 255, b: 255 });
    this.font('bold', 11);
    this.pdf.text(text, MARGIN + 3, this.y + 5.6);
    this.y += 12;
    this.setText(INK);
  }

  /** Key–value row with a light zebra background for scanability. */
  kv(key: string, value: string, zebra = false) {
    this.ensureSpace(8);
    if (zebra) {
      this.setFill(SURFACE);
      this.rect(MARGIN, this.y - 1, CONTENT_W, 6.6, 'F');
    }
    this.setText(MUTED);
    this.font('normal', 9);
    this.pdf.text(key, MARGIN + 2, this.y + 3.2);
    this.setText(INK);
    this.font('bold', 9);
    const lines = this.pdf.splitTextToSize(value, CONTENT_W - 62);
    this.pdf.text(lines[0] ?? value, MARGIN + 60, this.y + 3.2);
    if (lines.length > 1) {
      this.y += 4.6;
      this.pdf.text(lines.slice(1).join(' '), MARGIN + 60, this.y + 3.2);
      this.y += 1.6;
    }
    this.y += 6.6;
  }

  bullet(text: string) {
    this.font('normal', 9);
    const lines = this.pdf.splitTextToSize(text, CONTENT_W - 8);
    this.ensureSpace(lines.length * 4.4 + 1.5);
    this.setText(INK);
    this.pdf.circle(MARGIN + 2.2, this.y + 2.6, 0.7, 'F');
    this.pdf.text(lines, MARGIN + 6.5, this.y + 3.2);
    this.y += lines.length * 4.4 + 1.2;
  }

  paragraph(text: string, size = 9) {
    this.font('normal', size);
    const lines = this.pdf.splitTextToSize(text, CONTENT_W);
    this.ensureSpace(lines.length * 4.4 + 2);
    this.setText(INK);
    this.pdf.text(lines, MARGIN, this.y + 3.2);
    this.y += lines.length * 4.4 + 3;
  }

  tableRow(cells: string[], widths: number[], zebra = false, boldFirst = true) {
    this.ensureSpace(8);
    if (zebra) {
      this.setFill(SURFACE);
      this.rect(MARGIN, this.y - 1, CONTENT_W, 6.6, 'F');
    }
    let x = MARGIN + 2;
    cells.forEach((cell, index) => {
      this.font(boldFirst && index === 0 ? 'bold' : 'normal', 8.5);
      this.setText(index === 0 ? INK : MUTED);
      const lines = this.pdf.splitTextToSize(cell, widths[index] - 2);
      this.pdf.text(lines[0], x, this.y + 3.2);
      x += widths[index];
    });
    this.y += 6.6;
  }

  spacer(h = 4) {
    this.y += h;
  }

  /** Jump to an absolute Y position (used after drawing the cover band). */
  setY(y: number) {
    this.y = y;
  }

  rect(x: number, y: number, w: number, h: number, style: 'F' | 'S') {
    this.pdf.rect(x, y, w, h, style);
  }

  /** Low-level access for the one-off cover block. */
  raw(): jsPDF {
    return this.pdf;
  }
  finalize(reference: string) {
    const total = this.pdf.getNumberOfPages();
    for (let page = 1; page <= total; page += 1) {
      this.pdf.setPage(page);
      this.setText(MUTED);
      this.font('normal', 7.5);
      this.pdf.text(`${this.input.dict.statement.ref}: ${reference}`, MARGIN, PAGE_H - 8);
      this.pdf.text(
        this.input.dict.statement.footer,
        PAGE_W / 2,
        PAGE_H - 8,
        { align: 'center' }
      );
      this.pdf.text(`Page ${page}/${total}`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' });
    }
  }

  save(fileName: string) {
    this.pdf.save(fileName);
  }
}

/* --------------------------------------------------------------- builders */

function buildLoanCosts(p: PdfWriter, applicant: LoanApplicant, dict: TranslationDict) {
  const config = JOURNEY_CONFIG.loan;
  const rate = config.annualInterestRate;
  const tenure = Number(applicant.tenureMonths);
  const emi = calculateEmi(applicant.loanAmount, rate, tenure);
  const total = emi * tenure;
  const interest = total - applicant.loanAmount;
  const fee = applicant.loanAmount * config.processorFeePct;

  p.kv(dict.dashboard.loanAmount, formatCurrency(applicant.loanAmount), true);
  p.kv(dict.dashboard.tenure, `${tenure} months`);
  p.kv('Indicative interest rate (p.a.)', `${(rate * 100).toFixed(2)}%`);
  p.kv('Monthly EMI', formatCurrency(emi), true);
  p.kv('Total interest over term', formatCurrency(interest));
  p.kv('Total repayment amount', formatCurrency(total), true);
  p.kv('One-time processing fee', formatCurrency(fee));
  p.kv('Processing fee + GST (18%)', formatCurrency(fee * 1.18));
  p.spacer(2);
  p.paragraph(
    `First EMI is due one month after disbursal, on the same date. Every EMI covers interest for the month plus a slice of the principal (amortisation), so the interest share shrinks every month. Prepay any time: part-payment reduces either the EMI or the remaining term — your choice. Foreclosure after 6 EMIs carries no penalty on this product.`
  );
}

function buildInsuranceCosts(p: PdfWriter, applicant: InsuranceApplicant, dict: TranslationDict) {
  const loading =
    applicant.preExistingConditions.trim() !== '' && applicant.preExistingConditions.trim().toLowerCase() !== 'none'
      ? PRE_EXISTING_LOADING
      : 0;
  const termYears = Number(applicant.policyTermYears);
  const annual = estimateAnnualPremium(applicant.age, applicant.coverageAmount, termYears, loading);
  const band = PREMIUM_TABLE.find(b => applicant.age <= b.maxAge) ?? PREMIUM_TABLE[PREMIUM_TABLE.length - 1];

  p.kv(dict.dashboard.cover, formatCurrency(applicant.coverageAmount), true);
  p.kv(dict.dashboard.term, `${termYears} years`);
  p.kv('Premium rate used', `₹${band.ratePerLakhPerYear} per ₹1 lakh cover / year (age band ≤ ${band.maxAge})`);
  p.kv('Annual premium', formatCurrency(annual), true);
  p.kv('Monthly equivalent', formatCurrency(annual / 12));
  p.kv('Total premium over term', formatCurrency(annual * termYears), true);
  if (loading > 0) {
    p.kv('Medical loading declared', `${Math.round(loading * 100)}% on base premium`);
  }
  p.kv('GST on premium', `18% (shown separately on the invoice)`);
  p.spacer(2);
  p.paragraph(
    `Premiums are level — they do not rise for the whole ${termYears}-year term even as you age. Pay annually to save ~2% versus monthly mode. A 15-day free-look period starts when you receive the policy: cancel within it for a full refund (minus medical costs). Grace period for missed premiums is 30 days; cover continues.`
  );
}

function buildPolicyExplainer(p: PdfWriter, journeyType: JourneyType) {
  if (journeyType === 'loan') {
    p.paragraph(
      'A personal loan gives you a lump sum today and converts it into fixed monthly instalments. Each EMI = principal share + interest share. Paying on time builds your credit history; the bureau sees every payment within 30 days.'
    );
    p.spacer(1);
    p.bullet('Repayment channels: UPI autopay (recommended), debit card e-mandate, or net-banking transfer.');
    p.bullet('Missed payment — day 1-3: reminder SMS + WhatsApp, late fee ₹500 plus GST on day 4.');
    p.bullet('Missed payment — day 4-30: bureau reporting of the overdue instalment, which can drop your score 40-80 points.');
    p.bullet('Missed payment — day 30-90: recovery calls; the full outstanding can be recalled after 90 days of non-payment.');
    p.bullet('Catching up: pay the overdue EMI plus the late fee any time before day 90 to return to good standing.');
    p.bullet('Prepayment: any amount, any time after 6 EMIs, zero foreclosure charges.');
    p.bullet('Eligibility levers if your score came out low: clear card dues (fastest), keep utilisation under 30% for 3 months, close small EMIs to cut FOIR, add a co-applicant, or request a smaller amount / longer tenure.');
    p.spacer(1);
    p.paragraph(`This product considers ages ${JOURNEY_CONFIG.loan.minAge}-${JOURNEY_CONFIG.loan.maxAge}, income from ${formatCurrency(JOURNEY_CONFIG.loan.minIncome)}/year, CIBIL ${JOURNEY_CONFIG.loan.minCreditScore}+, FOIR up to ${(JOURNEY_CONFIG.loan.maxFOIR * 100).toFixed(0)}%, up to 5x income unsecured.`);
  } else {
    p.paragraph(
      'Term insurance pays your family the full cover amount if anything happens to you during the term. There is no maturity payout — it is pure protection, which is why the premium stays low. The cover is a contract: honest disclosure today is what makes the claim payable tomorrow.'
    );
    p.spacer(1);
    p.bullet('What it covers: death from any cause after the first policy year (accidental death from day 1).');
    p.bullet('What it does not cover: death by suicide in year 1 (premiums refunded), and non-disclosed conditions discovered at claim time.');
    p.bullet('Missed premium — within 30 days: pay normally, cover continues untouched (grace period).');
    p.bullet('Missed premium — beyond 30 days: the policy lapses; reviving needs arrears plus a health declaration, within 2 years.');
    p.bullet('Claim process: nominee informs us (phone/branch/online) → documents collected from home → payout within 30 days of complete papers.');
    p.bullet('Tax: premiums qualify under Section 80C; the claim amount is tax-free under Section 10(10D).');
    p.bullet('Declarations: diabetes/hypertension do not disqualify — expect ~40% premium loading and possible medicals instead of a silent claim rejection later.');
    p.spacer(1);
    p.paragraph(`This product considers entry ages ${JOURNEY_CONFIG.insurance.minAge}-${JOURNEY_CONFIG.insurance.maxAge}, income from ${formatCurrency(JOURNEY_CONFIG.insurance.minIncome)}/year, cover up to ${JOURNEY_CONFIG.insurance.maxCoverageMultiplier}x income, maturity by age ${JOURNEY_CONFIG.insurance.maxMaturityAge}.`);
  }
}

function buildNotificationsSection(p: PdfWriter, notifications: NotificationRecord[], dict: TranslationDict) {
  if (notifications.length === 0) {
    p.paragraph(dict.statement.noneSent);
    return;
  }
  for (const notification of notifications) {
    p.bullet(
      `[${formatDate(notification.sentAt)} ${notification.sentAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}] ` +
        `${notification.channels === 'whatsapp' ? 'WhatsApp' : 'SMS + WhatsApp'} (${dict.language[notification.language]}): ${notification.body.replace(/\s+/g, ' ').slice(0, 180)}`
    );
  }
}

/* -------------------------------------------------------------------- API */

export function generateStatementPdf(input: StatementInput): void {
  const p = new PdfWriter(input);
  const { dict, applicant, eligibility, journeyType } = input;
  const firstName = applicant.fullName.split(' ')[0];

  /* Cover block */
  p.setFill(BRAND);
  p.rect(MARGIN, MARGIN, CONTENT_W, 26, 'F');
  p.raw().setTextColor(255, 255, 255);
  p.raw().setFont('helvetica', 'bold');
  p.raw().setFontSize(15);
  p.raw().text(`${dict.statement.title} — ${firstName}`, MARGIN + 4, MARGIN + 10);
  p.raw().setFont('helvetica', 'normal');
  p.raw().setFontSize(8.5);
  p.raw().text(
    dict.statement.generatedOn.replace('{date}', formatDate(new Date())),
    MARGIN + 4,
    MARGIN + 17
  );
  p.raw().text(dict.statement.summaryLine, MARGIN + 4, MARGIN + 22, { maxWidth: CONTENT_W - 8 });
  p.setY(MARGIN + 32);

  /* 1. Application summary */
  p.sectionTitle(dict.statement.sectionApplication);
  p.kv(dict.statement.ref, input.reference, true);
  p.kv(dict.statement.applicant, `${applicant.fullName}, ${applicant.age}`);
  p.kv(dict.statement.journey, journeyType === 'loan' ? 'Personal Loan' : 'Term Insurance');
  p.kv(dict.statement.status, input.stageLabel, true);
  if ('loanAmount' in applicant) {
    p.kv(dict.dashboard.loanAmount, formatCurrency(applicant.loanAmount));
    p.kv(dict.dashboard.tenure, `${applicant.tenureMonths} months`);
    p.kv(dict.dashboard.annualIncome, formatCurrency(applicant.annualIncome));
  } else {
    p.kv(dict.dashboard.cover, formatCurrency(applicant.coverageAmount));
    p.kv(dict.dashboard.term, `${applicant.policyTermYears} years`);
    p.kv(dict.dashboard.annualIncome, formatCurrency(applicant.annualIncome));
  }
  p.spacer(3);

  /* 2. Eligibility verdict */
  p.sectionTitle(dict.statement.sectionEligibility);
  p.kv(dict.statement.verdict, VERDICT_LABELS[eligibility.verdict], true);
  p.kv(dict.statement.score, `${eligibility.score}%`);
  p.paragraph(eligibility.summary);
  p.spacer(1);
  const w = [70, 40, 80];
  p.tableRow([dict.statement.criteria, 'Result', 'Comparison'], w, false, true);
  eligibility.criteria.forEach((criterion, index) => {
    p.tableRow(
      [criterion.label, criterion.passed ? dict.statement.passed : dict.statement.failed, criterion.comparison ?? '—'],
      w,
      index % 2 === 1,
      false
    );
  });
  if (eligibility.suggestions.length > 0) {
    p.spacer(2);
    p.paragraph('What would change the outcome:', 9.5);
    eligibility.suggestions.forEach(s => p.bullet(s));
  }
  p.spacer(3);

  /* 3. Documents */
  p.sectionTitle(dict.statement.sectionDocuments);
  const docRows = input.uploadedDocs.filter(doc => doc.fileName);
  if (docRows.length === 0) {
    p.paragraph('No documents uploaded yet.');
  } else {
    const dw = [60, 34, 96];
    p.tableRow(['Document', 'Status', 'Reviewer note'], dw, false, true);
    docRows.forEach((doc, index) => {
      const requirement = input.uploadedDocs.find(d => d.id === doc.id);
      const statusLabel =
        doc.status === 'pass'
          ? dict.statement.docVerified
          : doc.status === 'fail'
            ? dict.statement.docFailed
            : doc.status === 'warning'
              ? dict.statement.docWarning
              : dict.statement.docMissing;
      const note = (doc.summary ?? '').replace(/\s+/g, ' ').slice(0, 110);
      p.tableRow([requirement?.documentId ?? doc.documentId, statusLabel, note || '—'], dw, index % 2 === 1, false);
    });
  }
  p.spacer(3);

  /* 4. Costs */
  p.sectionTitle(dict.statement.sectionCosts);
  if ('loanAmount' in applicant) {
    buildLoanCosts(p, applicant as LoanApplicant, dict);
  } else {
    buildInsuranceCosts(p, applicant as InsuranceApplicant, dict);
  }
  p.spacer(3);

  /* 5. Policy explainer */
  p.sectionTitle(dict.statement.sectionPolicy.replace('{journey}', journeyType === 'loan' ? 'loan' : 'insurance'));
  buildPolicyExplainer(p, journeyType);
  p.spacer(3);

  /* 6. Notifications */
  p.sectionTitle(dict.statement.sectionNotifications);
  buildNotificationsSection(p, input.notifications, dict);

  p.finalize(input.reference);
  const fileName = `paytm-${journeyType}-statement-${input.reference}.pdf`;
  p.save(fileName);
}

export type { StatementInput };
