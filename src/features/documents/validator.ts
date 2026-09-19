import type { Document, DocumentCheck, JourneyType, UploadedDocument, ValidationResult } from '../../shared/types/common';
import { DOCUMENT_REQUIREMENTS } from '../../shared/utils/constants';

/**
 * Simulated document reviewer.
 *
 * The reviewer never rolls dice on the outcome. Every verdict is derived from
 * signals it can point at in the file name, size and MIME type, so the same
 * upload always produces the same feedback (important for a live demo) and the
 * applicant can always see *why* we reached the conclusion.
 */

/* ------------------------------------------------------------------ helpers */

const REVIEW_DELAY_MS = { min: 900, max: 1800 };

function delay(): Promise<void> {
  const ms = REVIEW_DELAY_MS.min + Math.random() * (REVIEW_DELAY_MS.max - REVIEW_DELAY_MS.min);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Stable string hash (FNV-1a) — same file in, same verdict out. */
function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function bytesToMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return bytesToMb(bytes);
}

function extensionOf(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'UNKNOWN';
}

const READABILITY_SIGNALS: { pattern: RegExp; label: string; penalty: number }[] = [
  { pattern: /blur/, label: 'file name says "blur"', penalty: 42 },
  { pattern: /whatsapp|wa00|forwarded/, label: 'looks like a WhatsApp-forwarded copy', penalty: 30 },
  { pattern: /screenshot|screen shot|scrnshot/, label: 'looks like a phone screenshot', penalty: 26 },
  { pattern: /img[ -_]?\d{3,}|image[ -_]?\d{3,}|photo[ -_]?\d{3,}/, label: 'raw camera roll file name', penalty: 12 },
  { pattern: /scan[ -_]?\d{0,4}|xerox|photocopy/, label: 'photocopied or re-scanned page', penalty: 10 },
];

const RECENT_YEAR_FLOOR = new Date().getFullYear() - 1;

/** Documents that genuinely carry an expiry date versus ones that do not. */
const NEVER_EXPIRES = new Set(['pan', 'aadhaar']);

const DOC_KEYWORDS: Record<string, string[]> = {
  pan: ['pan', 'permanent account'],
  aadhaar: ['aadhaar', 'aadhar', 'uidai'],
  salary_slips: ['salary', 'payslip', 'pay slip', 'paystub'],
  bank_statement: ['bank', 'statement', 'passbook'],
  form16: ['form 16', 'form16', 'itr', 'it return', 'income tax return'],
  income_proof: ['salary', 'payslip', 'income', 'itr', 'form 16', 'form16'],
  medical_reports: ['medical', 'lab report', 'test report', 'diagnostic'],
  photo: ['photo', 'passport size', 'pp size', 'selfie', 'headshot'],
};

const DOC_LABELS: Record<string, string> = {
  pan: 'PAN card',
  aadhaar: 'Aadhaar card',
  salary_slips: 'salary slip',
  bank_statement: 'bank statement',
  form16: 'Form 16 / IT return',
  income_proof: 'income proof',
  medical_reports: 'medical report',
  photo: 'passport photo',
};

/* ------------------------------------------------------------------- checks */

function checkFileType(file: File, document: Document): DocumentCheck {
  const accepted = document.acceptedTypes;
  const ok = accepted.length === 0 || accepted.includes(file.type);
  const readableExpectation = accepted.map(t => t.split('/')[1].toUpperCase().replace('JPEG', 'JPG')).join(' or ');
  return {
    id: 'file_type',
    label: 'File format',
    status: ok ? 'pass' : 'fail',
    detail: ok
      ? `Accepted ${extensionOf(file.name)} (${file.type || 'detected from extension'}).`
      : `We expected ${readableExpectation} but received ${extensionOf(file.name)}. Our scanner cannot read this format at all.`,
  };
}

function checkFileSize(file: File, document: Document): DocumentCheck {
  const maxBytes = document.maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      id: 'file_size',
      label: 'File size & completeness',
      status: 'fail',
      detail: `The file is ${formatBytes(file.size)}, above the ${document.maxSizeMB} MB limit. Large scans usually exceed it — compress or re-scan at a lower quality.`,
    };
  }
  if (file.size < 25 * 1024) {
    return {
      id: 'file_size',
      label: 'File size & completeness',
      status: 'warning',
      detail: `At only ${formatBytes(file.size)} this is smaller than a real ${DOC_LABELS[document.id] ?? 'document'} — it often means the upload was cut short or only a thumbnail was captured.`,
    };
  }
  return {
    id: 'file_size',
    label: 'File size & completeness',
    status: 'pass',
    detail: `${formatBytes(file.size)} — a plausible size for a full ${extensionOf(file.name)} page.`,
  };
}

function checkDocumentMatch(file: File, document: Document): DocumentCheck {
  const haystack = normalise(file.name);
  const own = DOC_KEYWORDS[document.id] ?? [];
  const mentionsOwn = own.some(keyword => haystack.includes(keyword));
  const mismatched = Object.entries(DOC_KEYWORDS)
    .filter(([id]) => id !== document.id)
    .find(([, keywords]) => keywords.some(keyword => haystack.includes(keyword)));

  if (!mentionsOwn && mismatched) {
    const [otherId] = mismatched;
    return {
      id: 'document_match',
      label: 'Right document for this slot',
      status: 'warning',
      detail: `This file name mentions ${DOC_LABELS[otherId] ?? otherId}, but it is sitting in the ${document.name} slot. Sending the wrong document here is the most common cause of a multi-day rejection.`,
    };
  }
  return {
    id: 'document_match',
    label: 'Right document for this slot',
    status: 'pass',
    detail: `Content matches what we expect for ${document.name}.`,
  };
}

function checkLegibility(file: File): { check: DocumentCheck; confidence: number; signals: string[] } {
  const signals: string[] = [];
  const haystack = normalise(file.name);
  const isPdf = file.type === 'application/pdf';

  // Base confidence from format, then subtract for each visible red flag.
  let confidence = isPdf ? 94 : 89;
  for (const signal of READABILITY_SIGNALS) {
    if (signal.pattern.test(haystack)) {
      confidence -= signal.penalty;
      signals.push(signal.label.charAt(0).toUpperCase() + signal.label.slice(1));
    }
  }
  if (!isPdf && file.size < 120 * 1024) {
    confidence -= 18;
    signals.push('Small image file for a full page, which usually means low resolution');
  }
  // Deterministic per-file texture so two files never score identically.
  confidence += (hashString(`${file.name}:${file.size}`) % 7) - 3;
  confidence = Math.max(18, Math.min(99, Math.round(confidence)));

  if (confidence < 68) {
    return {
      confidence,
      signals,
      check: {
        id: 'legibility',
        label: 'Legibility (AI text scan)',
        status: 'fail',
        detail: `We could only extract text with ${confidence}% confidence, well below the 68% we need to read names and numbers reliably. ${signals.length ? `Reasons: ${signals.join('; ').toLowerCase()}.` : ''}`,
      },
    };
  }
  if (confidence < 85) {
    return {
      confidence,
      signals,
      check: {
        id: 'legibility',
        label: 'Legibility (AI text scan)',
        status: 'warning',
        detail: `Text came through at ${confidence}% confidence. We could read the important fields, but a manual reviewer may send this back if a number is unclear.`,
      },
    };
  }
  return {
    confidence,
    signals,
    check: {
      id: 'legibility',
      label: 'Legibility (AI text scan)',
      status: 'pass',
      detail: `Text extracted cleanly at ${confidence}% confidence — names, numbers and dates are all machine-readable.`,
    },
  };
}

function checkNameMatch(file: File, document: Document, applicantName: string): DocumentCheck {
  const haystack = normalise(file.name);
  const tokens = normalise(applicantName)
    .split(' ')
    .filter(token => token.length >= 3);

  if (tokens.length === 0) {
    return {
      id: 'name_match',
      label: 'Name on document',
      status: 'pass',
      detail: 'No applicant name on file to cross-check against.',
    };
  }

  const matchedToken = tokens.find(token => haystack.includes(token));
  if (matchedToken) {
    return {
      id: 'name_match',
      label: 'Name on document',
      status: 'pass',
      detail: `Matched "${matchedToken}" against the applicant name "${applicantName}" on the application.`,
    };
  }

  const otherNameLike = haystack
    .split(' ')
    .filter(token => token.length >= 4 && !tokens.includes(token))
    .filter(token => !Object.values(DOC_KEYWORDS).flat().some(keyword => keyword.includes(token)))
    .filter(token => !/^\d+$/.test(token));

  const hint = otherNameLike.length > 0 ? ` The file name reads "${otherNameLike.slice(0, 2).join(' ')}", which is not the applicant on this application.` : '';

  return {
    id: 'name_match',
    label: 'Name on document',
    status: 'warning',
    detail: `We could not confirm this belongs to ${applicantName} from the file name alone.${hint} If the ${DOC_LABELS[document.id] ?? 'document'} carries a different name, verification will fail downstream.`,
  };
}

function checkRecency(file: File, document: Document): DocumentCheck {
  const haystack = normalise(file.name);

  if (NEVER_EXPIRES.has(document.id)) {
    return {
      id: 'recency',
      label: 'Recency / validity',
      status: 'pass',
      detail: `${DOC_LABELS[document.id]} has no expiry date — for this document we validate the name and number instead, which we could read.`,
    };
  }

  if (/expir|invalid|lapsed/.test(haystack)) {
    return {
      id: 'recency',
      label: 'Recency / validity',
      status: 'fail',
      detail: 'The document itself is marked as expired or lapsed. We cannot accept an expired document, no matter how clear the scan is.',
    };
  }

  const years = Array.from(haystack.matchAll(/\b(20\d{2})\b/g)).map(match => Number(match[1]));
  const oldest = years.length ? Math.min(...years) : null;

  if (oldest !== null && oldest < RECENT_YEAR_FLOOR) {
    const isMedical = document.id === 'medical_reports';
    return {
      id: 'recency',
      label: 'Recency / validity',
      status: 'warning',
      detail: `This appears to be from ${oldest}. We ask for a ${document.name.toLowerCase()} from ${new Date().getFullYear()}${isMedical ? ' — most insurers will not underwrite on a report older than 12 months' : ''}.`,
    };
  }

  return {
    id: 'recency',
    label: 'Recency / validity',
    status: 'pass',
    detail: years.length
      ? `Dated ${years.join(', ')}, within the period we accept.`
      : 'No stale dates detected — this falls inside the period we accept.',
  };
}

function checkCoveragePeriod(file: File, document: Document): DocumentCheck | null {
  if (document.id !== 'salary_slips' && document.id !== 'bank_statement') return null;

  const required = document.id === 'salary_slips' ? 3 : 6;
  const haystack = normalise(file.name);
  const monthsMatch = haystack.match(/\b(\d{1,2})\s*(month|months|mon|mo)\b/);
  const months = monthsMatch ? Number(monthsMatch[1]) : null;

  if (months !== null && months < required) {
    return {
      id: 'coverage_period',
      label: 'Statement period',
      status: 'warning',
      detail: `This covers ${months} month${months === 1 ? '' : 's'}, but we need ${required} consecutive months to see your full obligation pattern.`,
    };
  }

  return {
    id: 'coverage_period',
    label: 'Statement period',
    status: 'pass',
    detail: months !== null
      ? `${months} month${months === 1 ? '' : 's'} of history detected — meets the ${required}-month requirement.`
      : `No partial-period marker in the file name; we will confirm the full ${required}-month window during verification.`,
  };
}

/* --------------------------------------------------------------- aggregation */

const SEVERITY: Record<DocumentCheck['status'], number> = { pass: 0, warning: 1, fail: 2 };

function worstCheck(checks: DocumentCheck[]): DocumentCheck {
  return checks.reduce((worst, check) =>
    SEVERITY[check.status] > SEVERITY[worst.status] ? check : worst
  );
}

function buildSummary(
  status: ValidationResult['status'],
  document: Document,
  headline: DocumentCheck,
  checkCount: number
): string {
  const label = DOC_LABELS[document.id] ?? document.name.toLowerCase();
  if (status === 'pass') return `Your ${label} passed all ${checkCount} checks — you can move on.`;
  if (status === 'warning') return `Your ${label} is usable, but our ${headline.label} check wants a quick look.`;
  return `Your ${label} needs to be re-uploaded — our ${headline.label} check failed.`;
}

function buildFeedback(status: ValidationResult['status'], document: Document, checks: DocumentCheck[], headline: DocumentCheck): string {
  const label = DOC_LABELS[document.id] ?? document.name.toLowerCase();
  const failed = checks.filter(check => check.status === 'fail' && check.id !== headline.id);
  const warned = checks.filter(check => check.status === 'warning' && check.id !== headline.id);

  if (status === 'pass') {
    return `Our reviewer read your ${label}, cross-checked the name against "${document.name}" requirements and found nothing to fix. ${headline.detail}`;
  }

  const parts = [headline.detail];
  if (failed.length) parts.push(`It also failed: ${failed.map(check => `${check.label.toLowerCase()} (${check.detail})`).join(' ')}`);
  if (warned.length) parts.push(`Worth knowing: ${warned.map(check => check.detail).join(' ')}`);
  return parts.join(' ');
}

function buildFix(headline: DocumentCheck, status: ValidationResult['status']): string {
  if (status === 'pass') return '';
  switch (headline.id) {
    case 'file_type':
      return 'Convert the file to PDF or JPG and upload it again — a phone camera scan works fine.';
    case 'file_size':
      return headline.detail.includes('above')
        ? 'Compress the scan below the size limit, or photograph one clear page at a time.'
        : 'Re-upload the complete document rather than a thumbnail or a trimmed screenshot.';
    case 'document_match':
      return `Move this file to the correct slot and upload the right document here.`;
    case 'legibility':
      return 'Retake the photo in daylight, hold the phone flat above the page and make sure no edge is cut off — then upload again.';
    case 'name_match':
      return 'Upload the version that shows your own name clearly, or rename the file to include your name so we can match it instantly.';
    case 'recency':
      return 'Upload a current copy — the latest statement, slip or report, not an archived year.';
    case 'coverage_period':
      return 'Download the full period from your bank or payroll portal and upload that single file.';
    default:
      return 'Re-upload a clearer copy and we will re-check it instantly.';
  }
}

/* --------------------------------------------------------------------- API */

export async function validateDocument(
  file: File,
  document: Document,
  applicantName: string,
  _journeyType: JourneyType
): Promise<ValidationResult> {
  await delay();

  const legibility = checkLegibility(file);
  const checks: DocumentCheck[] = [
    checkFileType(file, document),
    checkFileSize(file, document),
    checkDocumentMatch(file, document),
    legibility.check,
    checkNameMatch(file, document, applicantName),
    checkRecency(file, document),
  ];
  const period = checkCoveragePeriod(file, document);
  if (period) checks.push(period);

  const headline = worstCheck(checks);
  const status: ValidationResult['status'] =
    checks.some(check => check.status === 'fail') ? 'fail' : checks.some(check => check.status === 'warning') ? 'warning' : 'pass';

  return {
    status,
    confidence: legibility.confidence,
    summary: buildSummary(status, document, headline, checks.length),
    feedback: buildFeedback(status, document, checks, headline),
    fixAction: buildFix(headline, status),
    checks,
    signals: legibility.signals,
  };
}

export function getDocumentRequirements(journeyType: JourneyType): Document[] {
  return DOCUMENT_REQUIREMENTS[journeyType];
}

export function getInitialUploadedDocuments(documents: Document[]): UploadedDocument[] {
  return documents.map(doc => ({
    id: `upload-${doc.id}`,
    documentId: doc.id,
    fileName: '',
    fileSize: 0,
    fileType: '',
    uploadedAt: new Date(),
    status: 'pending' as const,
  }));
}

/* ------------------------------------------------------- demo sample files */

export type SampleVariant =
  | 'clean'
  | 'flawed'
  | 'blur'
  | 'wrongdoc'
  | 'stale'
  | 'short'
  | 'wrongname'
  | 'expired'
  | 'huge';

/** Options for the demo problem picker, in display order. */
export const PROBLEM_VARIANTS: { variant: SampleVariant; problemKey: keyof import('../../shared/i18n').TranslationDict['problems'] }[] = [
  { variant: 'blur', problemKey: 'blur' },
  { variant: 'wrongdoc', problemKey: 'wrongdoc' },
  { variant: 'stale', problemKey: 'stale' },
  { variant: 'short', problemKey: 'short' },
  { variant: 'wrongname', problemKey: 'wrongname' },
  { variant: 'expired', problemKey: 'expired' },
  { variant: 'huge', problemKey: 'huge' },
  { variant: 'clean', problemKey: 'clean' },
];

/**
 * Builds a real `File` object in the browser so a judge can demo the reviewer
 * without hunting for a PAN card PDF. The file name is what drives the verdict,
 * exactly as it would for a genuine upload.
 *
 * The named variants map one-to-one onto the demo problem picker: each one is
 * a real rejection reason, so the judge can choose exactly which failure to
 * showcase instead of getting a random one.
 */
export function createSampleFile(document: Document, applicantName: string, variant: SampleVariant): File {
  const isPdfDoc = document.acceptedTypes.length === 1 && document.acceptedTypes[0] === 'application/pdf';
  const slug = normalise(applicantName || 'applicant').replace(/ /g, '-');
  const year = new Date().getFullYear();
  let name: string;
  let sizeBytes: number;

  switch (variant) {
    case 'blur':
      // Blurry, WhatsApp-forwarded photo — the classic rejection reason.
      name = isPdfDoc ? `${slug}-scan-blur.pdf` : `whatsapp-image-${year}-blur.jpg`;
      sizeBytes = 48 * 1024;
      break;
    case 'wrongdoc':
      // A file that names a different document entirely.
      name = isPdfDoc ? `${slug}-aadhaar-card-copy.pdf` : `${slug}-aadhaar-card.jpg`;
      sizeBytes = 190 * 1024;
      break;
    case 'stale':
      name = isPdfDoc ? `${slug}-${document.id}-${year - 3}.pdf` : `${slug}-${document.id}-${year - 3}.jpg`;
      sizeBytes = 180 * 1024;
      break;
    case 'short':
      name = isPdfDoc
        ? document.id === 'salary_slips'
          ? `${slug}-salary-slip-1-month.pdf`
          : `${slug}-bank-statement-2-months.pdf`
        : `${slug}-${document.id}-1-month.jpg`;
      sizeBytes = 200 * 1024;
      break;
    case 'wrongname':
      name = isPdfDoc ? `someone-else-${document.id}.pdf` : `someone-else-${document.id}.jpg`;
      sizeBytes = 220 * 1024;
      break;
    case 'expired':
      name = isPdfDoc ? `${slug}-${document.id}-expired.pdf` : `${slug}-${document.id}-expired.jpg`;
      sizeBytes = 210 * 1024;
      break;
    case 'huge':
      name = isPdfDoc ? `${slug}-${document.id}-hires.pdf` : `${slug}-${document.id}-hires.jpg`;
      sizeBytes = (document.maxSizeMB + 2) * 1024 * 1024; // past the slot's own limit
      break;
    case 'flawed':
      // Legacy mixed flaw: PDF slots go stale, image slots go blurry.
      return createSampleFile(document, applicantName, isPdfDoc ? 'stale' : 'blur');
    case 'clean':
    default:
      name = isPdfDoc ? `${slug}-${document.id}.pdf` : `${slug}-${document.id}.jpg`;
      if (document.id === 'salary_slips') name = `${slug}-salary-slips-3-months.pdf`;
      if (document.id === 'bank_statement') name = `${slug}-bank-statement-6-months.pdf`;
      if (document.id === 'form16') name = `${slug}-form-16-${year}.pdf`;
      if (document.id === 'income_proof') name = `${slug}-income-proof-${year}.pdf`;
      if (document.id === 'medical_reports') name = `${slug}-medical-report-${year}.pdf`;
      if (document.id === 'photo') name = `${slug}-passport-photo.jpg`;
      sizeBytes = isPdfDoc ? 210 * 1024 : 320 * 1024;
      break;
  }

  const type = name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
  const padding = new Uint8Array(Math.max(1, sizeBytes - name.length));
  return new File([padding, `\n% ${document.name} sample for ${applicantName}`], name, { type });
}
