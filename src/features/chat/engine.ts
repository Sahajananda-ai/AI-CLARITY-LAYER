import type {
  Applicant,
  ChatIntent,
  ChatMessage,
  EligibilityResult,
  JourneyType,
  LoanApplicant,
  InsuranceApplicant,
  UploadedDocument,
} from '../../shared/types/common';
import { JOURNEY_CONFIG, JOURNEY_STAGES, PRE_EXISTING_LOADING } from '../../shared/utils/constants';
import { formatCurrency } from '../../shared/utils/formatters';
import { calculateEmi, estimateAnnualPremium, evaluateEligibility } from '../eligibility/engine';
import { getDocumentRequirements } from '../documents/validator';

/**
 * Status assistant.
 *
 * Two things keep this from being a canned line generator:
 *  1. intent classification is scored, not first-match, so overlapping
 *     questions ("which docs are pending" vs "when will it finish") resolve to
 *     the right handler, and the matched terms are surfaced in the UI.
 *  2. every answer is computed from the live application state — the current
 *     stage, the actual document verdicts, EMI maths and even a re-run of the
 *     eligibility engine to answer "what would change the outcome?".
 */

export interface ChatContext {
  applicant: Applicant;
  journeyType: JourneyType;
  eligibility: EligibilityResult | null;
  uploadedDocs: UploadedDocument[];
}

export interface ChatReply {
  intent: ChatIntent;
  response: string;
  /** Terms that drove the classification, surfaced in the UI for transparency. */
  signals: string[];
  confidence: number;
}

const REPLY_DELAY_MS = { min: 700, max: 1600 };

function delay(): Promise<void> {
  const ms = REPLY_DELAY_MS.min + Math.random() * (REPLY_DELAY_MS.max - REPLY_DELAY_MS.min);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ------------------------------------------------------- intent classification */

const INTENT_PATTERNS: { intent: ChatIntent; weight: number; pattern: RegExp }[] = [
  { intent: 'greeting', weight: 2, pattern: /\b(hi|hii|hello|hey|namaste|good morning|good evening)\b/ },
  { intent: 'greeting', weight: 1, pattern: /\b(help|what can you do|options)\b/ },
  { intent: 'status', weight: 3, pattern: /\b(status|stage|where|progress|progressing|current|standing|update)\b/ },
  { intent: 'status', weight: 2, pattern: /\b(how far|how is my application|where is my application)\b/ },
  { intent: 'documents', weight: 3, pattern: /\b(document|documents|doc|docs|paper|papers|upload|uploaded|file|files|kyc)\b/ },
  { intent: 'documents', weight: 2, pattern: /\b(pending|missing|verify|verified|verification|rejected)\b/ },
  { intent: 'timeline', weight: 3, pattern: /\b(when|how long|timeline|eta|expected|expect|days?|weeks?|waiting)\b/ },
  { intent: 'timeline', weight: 2, pattern: /\b(how much time|by when|hear back|get the money|disburse)\b/ },
  { intent: 'amount', weight: 3, pattern: /\b(emi|installment|instalment|premium|interest|rate|monthly|cost|afford|pay)\b/ },
  { intent: 'amount', weight: 2, pattern: /\b(how much|charges|fee|fees|processing)\b/ },
  { intent: 'eligibility', weight: 3, pattern: /\b(eligib\w*|qualified|qualify|criteria|score|verdict|approved|approval)\b/ },
  // Weighted above `eligibility` on purpose: "what would improve my score"
  // mentions "score", but the applicant wants the actionable answer, not the scoreboard.
  { intent: 'improve', weight: 4, pattern: /\b(improve|increase|better|fix|reject\w*|declin\w*|denied|roadblock|blocker)\b/ },
  // "How can I become more eligible if my score came out low?" — 'eligible' and
  // 'score' both pull toward `eligibility`, so these need top weight.
  { intent: 'improve', weight: 5, pattern: /\b(more eligible|become eligible|become more|raise my|boost my)\b/ },
  { intent: 'improve', weight: 4, pattern: /\b(low|weak|poor|bad|less)\s+(score|cibil|credit|eligib\w*)\b/ },
  { intent: 'improve', weight: 2, pattern: /\b(what should i do|what can i do|why not|change the outcome)\b/ },
  // Repayment: "how do I repay / close / prepay" — weighted above `amount` so
  // "how much do I repay monthly" lands here when repayment is the intent.
  { intent: 'repayment', weight: 4, pattern: /\b(repay|repayment|prepay|prepay\w*|foreclos\w*|part.?payment|pay off|payback|pay back|autopay|mandate|emi date|due date)\b/ },
  { intent: 'repayment', weight: 2, pattern: /\b(how to pay|how do i pay|ways to pay|payment methods)\b/ },
  // Missed payment: must outrank `repayment` ("miss" + "pay" co-occur) and
  // `timeline` ("what happens now").
  { intent: 'missed_payment', weight: 5, pattern: /\b(missed|miss|i skipped|skipped|late payment|default\w*|overdue|past due|behind on)\b/ },
  { intent: 'missed_payment', weight: 3, pattern: /\b(can'?t pay|cannot pay|unable to pay|no money this month|lost my job|payment failed)\b/ },
  // Policy explainer: what the product covers/offers, claims, charges.
  { intent: 'policy', weight: 4, pattern: /\b(policy|cover|covered|coverage|claim|claims|exclusion|exclusions|terms|scheme|schemes|benefits|what does it (cover|offer|include)|insured)\b/ },
  { intent: 'policy', weight: 2, pattern: /\b(how does .*(work|loan|insurance)|what is (a |an )?(personal loan|term insurance)|late fee|charges|rules)\b/ },
  { intent: 'contact', weight: 3, pattern: /\b(human|agent|representative|executive|customer care|call|phone|email|branch|talk to someone)\b/ },
  { intent: 'cancel', weight: 3, pattern: /\b(cancel|withdraw|stop|abort|opt out|no longer)\b/ },
];

export function classifyIntent(message: string): { intent: ChatIntent; signals: string[]; confidence: number } {
  const lower = message.toLowerCase();
  const scores = new Map<ChatIntent, number>();
  const signals = new Set<string>();

  for (const { intent, weight, pattern } of INTENT_PATTERNS) {
    const match = lower.match(pattern);
    if (match) {
      scores.set(intent, (scores.get(intent) ?? 0) + weight);
      // Nested alternation groups can be undefined when a sibling branch
      // matched, so filter before trimming.
      for (const term of match) {
        if (term) signals.add(term.trim());
      }
    }
  }

  if (scores.size === 0) return { intent: 'general', signals: [], confidence: 0.3 };

  const [bestIntent, bestScore] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
  const total = [...scores.values()].reduce((sum, value) => sum + value, 0);
  return { intent: bestIntent, signals: [...signals].slice(0, 4), confidence: Math.min(0.98, bestScore / total) };
}

/* ------------------------------------------------------------------- helpers */

function businessDaysFromNow(days: number): Date {
  const date = new Date();
  let remaining = days;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date;
}

function shortDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function conditionLoadingOf(applicant: Applicant): number {
  if (!('coverageAmount' in applicant)) return 0;
  const declared = (applicant as InsuranceApplicant).preExistingConditions || '';
  const hasCondition = declared.trim() !== '' && declared.trim().toLowerCase() !== 'none';
  return hasCondition ? PRE_EXISTING_LOADING : 0;
}

function requiredDocsFor(journeyType: JourneyType) {
  return getDocumentRequirements(journeyType).filter(doc => doc.required);
}

export interface DocumentSnapshot {
  verified: UploadedDocument[];
  flagged: UploadedDocument[];
  awaitingReview: UploadedDocument[];
  notUploaded: { id: string; name: string }[];
  allRequiredVerified: boolean;
}

export function getDocumentSnapshot(journeyType: JourneyType, docs: UploadedDocument[]): DocumentSnapshot {
  const required = requiredDocsFor(journeyType);
  const uploaded = docs.filter(doc => doc.fileName);
  const byId = (id: string) => uploaded.find(doc => doc.documentId === id);

  const notUploaded = required
    .filter(req => !byId(req.id))
    .map(req => ({ id: req.id, name: req.name }));

  const allRequiredVerified = required.every(req => byId(req.id)?.status === 'pass');

  return {
    verified: uploaded.filter(doc => doc.status === 'pass'),
    flagged: uploaded.filter(doc => doc.status === 'fail' || doc.status === 'warning'),
    awaitingReview: uploaded.filter(doc => doc.status === 'pending'),
    notUploaded,
    allRequiredVerified,
  };
}

/** The stage the application would realistically be sitting in right now. */
export function getApplicationStage(journeyType: JourneyType, snapshot: DocumentSnapshot): { index: number; label: string; blocker: string | null } {
  const stages = JOURNEY_STAGES[journeyType];
  if (snapshot.flagged.some(doc => doc.status === 'fail')) {
    return { index: 1, label: stages[1], blocker: 'documents flagged by our reviewer' };
  }
  if (snapshot.notUploaded.length > 0) {
    return { index: 1, label: stages[1], blocker: `${snapshot.notUploaded.length} required document(s) not uploaded yet` };
  }
  if (snapshot.flagged.length > 0) {
    return { index: 1, label: stages[1], blocker: 'documents still waiting on a manual look' };
  }
  return { index: 2, label: stages[2], blocker: null };
}

/* ------------------------------------------------------------ status answers */

function statusResponse(ctx: ChatContext, reference: string): string {
  const stages = JOURNEY_STAGES[ctx.journeyType];
  const snapshot = getDocumentSnapshot(ctx.journeyType, ctx.uploadedDocs);
  const stage = getApplicationStage(ctx.journeyType, snapshot);

  const timeline = stages
    .map((label, index) => {
      const marker = index < stage.index ? '✓' : index === stage.index ? '▶' : '○';
      const emphasis = index === stage.index ? ' ← you are here' : '';
      return `${marker} ${index === stage.index ? `**${label}**` : label}${emphasis}`;
    })
    .join('\n');

  const lines = [
    `Your **${ctx.journeyType === 'loan' ? 'loan' : 'insurance'} application ${reference}** is at **${stage.label}** — step ${stage.index + 1} of ${stages.length}.`,
    '',
    timeline,
    '',
  ];

  if (stage.blocker) {
    lines.push(`**Why it has not moved:** ${stage.blocker}.`);
    if (snapshot.notUploaded.length) {
      lines.push(`Still awaiting: ${snapshot.notUploaded.map(doc => doc.name).join(', ')}.`);
    }
    if (snapshot.flagged.length) {
      lines.push(
        `Needs a look: ${snapshot.flagged
          .map(doc => `${doc.fileName} (${doc.status === 'fail' ? 'must be replaced' : 'review advised'})`)
          .join(', ')}.`
      );
    }
  } else {
    lines.push(
      `**Nothing is blocking you.** All ${snapshot.verified.length} required documents passed review, so an underwriter is picking this up next.`
    );
  }

  return lines.join('\n');
}

function documentsResponse(ctx: ChatContext): string {
  const requirements = requiredDocsFor(ctx.journeyType);
  const snapshot = getDocumentSnapshot(ctx.journeyType, ctx.uploadedDocs);
  const lines: string[] = [];

  lines.push(
    `You have **${snapshot.verified.length} of ${requirements.length} required documents verified**. Here is the line-by-line picture:`
  );
  lines.push('');

  for (const req of requirements) {
    const uploaded = ctx.uploadedDocs.find(doc => doc.documentId === req.id && doc.fileName);
    if (!uploaded) {
      lines.push(`• **${req.name}** — not uploaded yet`);
    } else if (uploaded.status === 'pass') {
      lines.push(`• **${req.name}** — verified ✓`);
    } else if (uploaded.status === 'fail') {
      lines.push(`• **${req.name}** — must be replaced. ${uploaded.feedback ?? ''}${uploaded.fixAction ? ` Fix: ${uploaded.fixAction}` : ''}`);
    } else if (uploaded.status === 'warning') {
      lines.push(`• **${req.name}** — usable, but flagged. ${uploaded.feedback ?? ''}${uploaded.fixAction ? ` Fix: ${uploaded.fixAction}` : ''}`);
    } else {
      lines.push(`• **${req.name}** — uploaded, awaiting review`);
    }
  }

  const optional = getDocumentRequirements(ctx.journeyType).filter(doc => !doc.required);
  if (optional.length) {
    lines.push('');
    lines.push(`Optional, but it would speed things up: ${optional.map(doc => doc.name).join(', ')}.`);
  }

  return lines.join('\n');
}

function timelineResponse(ctx: ChatContext): string {
  const snapshot = getDocumentSnapshot(ctx.journeyType, ctx.uploadedDocs);
  const stage = getApplicationStage(ctx.journeyType, snapshot);
  const isLoan = ctx.journeyType === 'loan';

  if (stage.blocker) {
    const unblockDays = 1;
    const after = businessDaysFromNow(unblockDays + (isLoan ? 2 : 3));
    return [
      `Honestly? **We are paused until documents are sorted** — right now ${stage.blocker}.`,
      '',
      `• Fix the flagged items today and verification restarts **immediately** (usually same working day).`,
      `• After that, ${isLoan ? 'credit assessment takes 1-2 working days' : 'underwriting takes 2-3 working days'}.`,
      `• On the current position, expect movement by **${shortDate(after)}**.`,
      '',
      `The date moves as soon as the documents land — uploading them is the single fastest thing you can do.`,
    ].join('\n');
  }

  if (isLoan) {
    const disbursal = businessDaysFromNow(2);
    return [
      `**All documents are verified**, so you are in the fast lane.`,
      '',
      `• Credit assessment: **1 working day** (no manual intervention needed on your file).`,
      `• Final approval + e-sign: **same day** once the assessment clears.`,
      `• Money in your bank: within **24 hours** of signing — realistically **${shortDate(disbursal)}**.`,
      '',
      `You will get a WhatsApp and email at each step. If nothing reaches you by ${shortDate(disbursal)}, nudge me here and I will escalate it.`,
    ].join('\n');
  }

  const issuance = businessDaysFromNow(3);
  return [
    `**All documents are verified**, so underwriting has what it needs.`,
    '',
    `• Medical assessment: waived for your profile, or **1 working day** if a test is called.`,
    `• Underwriting decision: **2-3 working days** from now.`,
    `• Policy document issue: within **24 hours** of approval — around **${shortDate(issuance)}**.`,
    '',
    `Your policy kicks in from the date of issuance, not the date you applied.`,
  ].join('\n');
}

/* ------------------------------------------------------------ money answers */

function amountResponse(ctx: ChatContext): string {
  if ('loanAmount' in ctx.applicant) {
    const applicant = ctx.applicant as LoanApplicant;
    const rate = JOURNEY_CONFIG.loan.annualInterestRate;
    const tenure = Number(applicant.tenureMonths);
    const emi = calculateEmi(applicant.loanAmount, rate, tenure);
    const totalPayable = emi * tenure;
    const totalInterest = totalPayable - applicant.loanAmount;
    const fee = applicant.loanAmount * JOURNEY_CONFIG.loan.processorFeePct;
    const monthlyIncome = applicant.annualIncome / 12;
    const totalObligation = applicant.existingEMIs + emi;

    return [
      `Here is the honest maths on your **${formatCurrency(applicant.loanAmount)}** over **${tenure} months** at our indicative rate of **${(rate * 100).toFixed(2)}% p.a.**:`,
      '',
      `• Monthly EMI: **${formatCurrency(emi)}**`,
      `• Total interest over the term: **${formatCurrency(totalInterest)}**`,
      `• Total you repay: **${formatCurrency(totalPayable)}**`,
      `• One-time processing fee: **${formatCurrency(fee)}**`,
      '',
      `With your existing ${formatCurrency(applicant.existingEMIs)} of EMIs, that is ${formatCurrency(totalObligation)} out of ${formatCurrency(monthlyIncome)} a month — about **${Math.round((totalObligation / monthlyIncome) * 100)}% of income**.`,
      '',
      tenure < 84
        ? `Stretching the tenure to 84 months would drop the EMI to roughly **${formatCurrency(calculateEmi(applicant.loanAmount, rate, 84))}**, though you would pay more interest overall.`
        : `Note that a longer tenure lowers the EMI but raises total interest — the trade-off is yours to make.`,
    ].join('\n');
  }

  const applicant = ctx.applicant as InsuranceApplicant;
  const loading = conditionLoadingOf(applicant);
  const termYears = Number(applicant.policyTermYears);
  const annual = estimateAnnualPremium(applicant.age, applicant.coverageAmount, termYears, loading);

  return [
    `Indicative cost for **${formatCurrency(applicant.coverageAmount)}** of cover over **${termYears} years**:`,
    '',
    `• Annual premium: **${formatCurrency(annual)}**`,
    `• Monthly equivalent: **${formatCurrency(annual / 12)}**`,
    `• That works out to about ₹${Math.round((annual / (applicant.coverageAmount / 100000)) ).toLocaleString('en-IN')} per year for every ₹1 lakh of cover.`,
    loading > 0
      ? `• Includes a **~${Math.round(loading * 100)}% loading** for the condition you declared — declaring it honestly is exactly why this will not become a claim problem later.`
      : `• Standard pricing applies because you have declared no pre-existing conditions.`,
    '',
    `These are indicative numbers, not a quote — the final premium is fixed at underwriting based on medicals and the payment term you pick.`,
  ].join('\n');
}

/* --------------------------------------------------------- eligibility answers */

function eligibilityResponse(ctx: ChatContext): string {
  const eligibility = ctx.eligibility;
  if (!eligibility) {
    return 'I do not have an eligibility result on this application yet. Run the eligibility check and I will break it down for you.';
  }

  const verdictLabels = { eligible: 'Eligible', conditional: 'Conditionally Eligible', 'not-eligible': 'Not Eligible' } as const;
  const failed = eligibility.criteria.filter(c => !c.passed);
  const passed = eligibility.criteria.filter(c => c.passed);

  const lines = [
    eligibility.summary,
    '',
    `**Verdict: ${verdictLabels[eligibility.verdict]}** — weighted score ${eligibility.score}%.`,
    '',
    passed.length ? `**Clear:** ${passed.map(c => c.label.toLowerCase()).join(', ')}.` : '',
    failed.length ? `**Short of the mark:**` : '',
    ...failed.map(c => `• ${c.label}: ${c.comparison ?? c.reason}`),
  ].filter(Boolean);

  return lines.join('\n');
}

/** Re-runs the eligibility engine on a corrected profile to answer "what if". */
function buildWhatIf(ctx: ChatContext): string | null {
  const eligibility = ctx.eligibility;
  if (!eligibility) return null;

  const failed = eligibility.criteria.filter(c => !c.passed && c.actionable !== false);
  if (failed.length === 0) return null;

  const target = [...failed].sort((a, b) => b.weight - a.weight)[0];
  const applicant = ctx.applicant;
  let mutated: Applicant | null = null;
  let changeDescription = '';

  if ('loanAmount' in applicant) {
    const a = { ...(applicant as LoanApplicant) };
    const config = JOURNEY_CONFIG.loan;
    switch (target.id) {
      case 'income':
        changeDescription = `your annual income were ${formatCurrency(config.minIncome)} instead of ${formatCurrency(a.annualIncome)}`;
        a.annualIncome = config.minIncome;
        mutated = a;
        break;
      case 'credit_score':
        changeDescription = `your CIBIL score were ${config.minCreditScore} instead of ${a.creditScore}`;
        a.creditScore = config.minCreditScore;
        mutated = a;
        break;
      case 'loan_amount':
        changeDescription = `you asked for ${formatCurrency(a.annualIncome * 5)} instead of ${formatCurrency(a.loanAmount)}`;
        a.loanAmount = a.annualIncome * 5;
        mutated = a;
        break;
      case 'foir': {
        const ceiling = (a.annualIncome / 12) * config.maxFOIR;
        const emi = calculateEmi(a.loanAmount, config.annualInterestRate, Number(a.tenureMonths));
        const allowedEmis = Math.max(0, Math.floor(ceiling - emi));
        if (allowedEmis < a.existingEMIs) {
          changeDescription = `your existing EMIs were ${formatCurrency(allowedEmis)} instead of ${formatCurrency(a.existingEMIs)}`;
          a.existingEMIs = allowedEmis;
          mutated = a;
        }
        break;
      }
      case 'employment':
        changeDescription = 'you also uploaded audited ITRs and business financials';
        mutated = a;
        break;
      default:
        break;
    }
  } else {
    const a = { ...(applicant as InsuranceApplicant) };
    const config = JOURNEY_CONFIG.insurance;
    switch (target.id) {
      case 'income':
        changeDescription = `your annual income were ${formatCurrency(config.minIncome)} instead of ${formatCurrency(a.annualIncome)}`;
        a.annualIncome = config.minIncome;
        mutated = a;
        break;
      case 'coverage':
        changeDescription = `the cover were ${formatCurrency(a.annualIncome * config.maxCoverageMultiplier)} instead of ${formatCurrency(a.coverageAmount)}`;
        a.coverageAmount = a.annualIncome * config.maxCoverageMultiplier;
        mutated = a;
        break;
      case 'policy_term':
        changeDescription = `your term were ${config.maxMaturityAge - a.age} years instead of ${a.policyTermYears}`;
        a.policyTermYears = config.maxMaturityAge - a.age;
        mutated = a;
        break;
      case 'employment':
        changeDescription = 'you also uploaded 2 years of ITRs to verify the business income';
        mutated = a;
        break;
      default:
        break;
    }
  }

  if (!mutated || !changeDescription) return null;

  const projected = evaluateEligibility(mutated);
  const verdictLabels = { eligible: 'Eligible', conditional: 'Conditionally Eligible', 'not-eligible': 'Not Eligible' } as const;

  if (projected.score <= eligibility.score) return null;

  return [
    `The single change worth the most to you is **${target.label.toLowerCase()}** (it carries ${Math.round(target.weight * 100)}% of our scoring weight).`,
    '',
    `If ${changeDescription}, your score would move from **${eligibility.score}% to ${projected.score}%** and the verdict would read **${verdictLabels[projected.verdict]}**.`,
    '',
    eligibility.suggestions[0] ? `Practically: ${eligibility.suggestions[0]}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function improveResponse(ctx: ChatContext): string {
  const eligibility = ctx.eligibility;
  if (!eligibility) {
    return 'I need your eligibility result before I can tell you what to improve. Run the eligibility check first and come back to me.';
  }

  const failed = eligibility.criteria.filter(c => !c.passed);
  if (failed.length === 0) {
    return [
      'Nothing on your profile is holding you back — every criterion passes.',
      '',
      'The only thing I would watch: avoid taking on new EMIs or missing a payment between now and disbursal, since we re-check the bureau at final approval.',
    ].join('\n');
  }

  const whatIf = buildWhatIf(ctx);
  const lines = [
    `Let me be precise about this. ${failed.length} of ${eligibility.criteria.length} criteria ${failed.length === 1 ? 'is' : 'are'} short:`,
    '',
    ...failed.map(
      c =>
        `• **${c.label}** — ${c.reason}${c.actionable === false ? ' (not something you can change, so do not worry about it)' : ''}`
    ),
  ];

  if (whatIf) {
    lines.push('');
    lines.push('---');
    lines.push(whatIf);
  }

  const documentBlockers = ctx.uploadedDocs.filter(doc => doc.fileName && doc.status === 'fail');
  if (documentBlockers.length) {
    lines.push('');
    lines.push(
      `Separately, **${documentBlockers.length} document(s) will be rejected as they stand** (${documentBlockers
        .map(doc => doc.fileName)
        .join(', ')}). That is a faster fix than anything above — re-upload and I will re-check in seconds.`
    );
  }

  return lines.join('\n');
}

/* ------------------------------------------------- repayment & policy answers */

/**
 * Repayment answer — computed from the live loan so the "how" always carries
 * the applicant's real numbers. For insurance it explains premium payment.
 */
function repaymentResponse(ctx: ChatContext): string {
  if ('loanAmount' in ctx.applicant) {
    const applicant = ctx.applicant as LoanApplicant;
    const rate = JOURNEY_CONFIG.loan.annualInterestRate;
    const tenure = Number(applicant.tenureMonths);
    const emi = calculateEmi(applicant.loanAmount, rate, tenure);
    const total = emi * tenure;

    return [
      `Here is exactly how repayment works on your **${formatCurrency(applicant.loanAmount)}** loan:`,
      '',
      `• **Your EMI is ${formatCurrency(emi)}/month** for ${tenure} months, starting one month after disbursal, same date.`,
      `• Total you will repay: **${formatCurrency(total)}** (${formatCurrency(total - applicant.loanAmount)} of that is interest).`,
      `• Every EMI = interest for the month + a growing slice of principal (amortisation). The interest share shrinks every month.`,
      '',
      `**Ways to pay** (in order of convenience):`,
      `• UPI Autopay — set once, debited automatically on the due date.`,
      `• Debit-card e-mandate or net-banking transfer — manual, but reliable.`,
      '',
      `**Paying early:** part-payment any time after 6 EMIs, zero charges — choose whether it shrinks your EMI or your remaining term. Full foreclosure is free after 6 EMIs too.`,
      '',
      `**Criteria we watch during repayment:** on-time record is reported to the bureau monthly; utilisation of credit lines under 30% and no new heavy EMIs keep your profile strong for the next loan.`,
    ].join('\n');
  }

  const applicant = ctx.applicant as InsuranceApplicant;
  const loading = conditionLoadingOf(applicant);
  const termYears = Number(applicant.policyTermYears);
  const annual = estimateAnnualPremium(applicant.age, applicant.coverageAmount, termYears, loading);

  return [
    `For your term plan, "repayment" is the **premium** — ${formatCurrency(annual)}/year (≈ ${formatCurrency(annual / 12)}/month) for ${termYears} years:`,
    '',
    `• Pay annually and save ~2% versus monthly mode; UPI autopay or card mandate both work.`,
    `• Premiums are **level** — locked at today's rate for all ${termYears} years, no age-based hikes.`,
    `• A **30-day grace period** follows every due date; cover continues untouched if you pay within it.`,
    `• After grace, the policy lapses — but you can revive within 2 years by clearing arrears plus a health declaration.`,
    `• Section 80C tax benefit applies to premiums; the payout itself is tax-free under 10(10D).`,
  ].join('\n');
}

/** What actually happens if an EMI/premium is missed — day by day. */
function missedPaymentResponse(ctx: ChatContext): string {
  if ('loanAmount' in ctx.applicant) {
    const applicant = ctx.applicant as LoanApplicant;
    const rate = JOURNEY_CONFIG.loan.annualInterestRate;
    const emi = calculateEmi(applicant.loanAmount, rate, Number(applicant.tenureMonths));

    return [
      `Straight answer, no sugar-coating. If your **${formatCurrency(emi)} EMI** bounces or is missed:`,
      '',
      `• **Day 1-3** — reminder SMS + WhatsApp from me; nothing else happens.`,
      `• **Day 4** — a late fee of ₹500 + GST is added to your account.`,
      `• **Day 4-30** — the overdue EMI is reported to CIBIL. A single 30-day delinquency typically drops the score 40-80 points and stays on the report for 24 months.`,
      `• **Day 30-90** — recovery calls begin; the account is flagged as DPD (days-past-due) 30/60/90.`,
      `• **Beyond 90 days** — the full outstanding can be recalled, and future loan approvals get very hard.`,
      '',
      `**The good news:** pay the overdue EMI + late fee any time before day 90 and the account returns to good standing — the "paid late" mark fades in impact well before it drops off.`,
      '',
      `**If this month is tight, do this instead:** pay partial (any amount stops the DPD clock at day 30), or tell me now and I can check restructuring options on your file.`,
    ].join('\n');
  }

  return [
    `For term insurance, a missed premium is gentler — but has a hard edge:`,
    '',
    `• **Within the 30-day grace period** — pay normally, cover and policy continue exactly as before. Nothing is reported anywhere.`,
    `• **Beyond 30 days** — the policy **lapses**: your family is no longer covered, and premiums already paid do not come back automatically.`,
    `• **Revival window** — within 2 years you can revive by paying all arrears plus interest and a fresh health declaration. Underwriting may re-price.`,
    `• **After 2 years** — the policy terminates permanently; you would need a new policy at your then-age rates.`,
    '',
    `One honest note: a lapsed-then-revived policy can raise claim scrutiny, so autopay is genuinely the safest setup.`,
  ].join('\n');
}

/** What the product offers/covers — the "schemes and policy" explainer. */
function policyResponse(ctx: ChatContext): string {
  const snapshot = getDocumentSnapshot(ctx.journeyType, ctx.uploadedDocs);

  if ('loanAmount' in ctx.applicant) {
    const applicant = ctx.applicant as LoanApplicant;
    const rate = JOURNEY_CONFIG.loan.annualInterestRate;
    const fee = applicant.loanAmount * JOURNEY_CONFIG.loan.processorFeePct;

    return [
      `Here is what your personal loan actually offers, in one place:`,
      '',
      `**The offer**`,
      `• ${formatCurrency(applicant.loanAmount)} over ${applicant.tenureMonths} months at ~${(rate * 100).toFixed(2)}% p.a. (fixed).`,
      `• One-time processing fee: ${formatCurrency(fee)} + GST, deducted at disbursal — no hidden charges after that.`,
      `• Zero prepayment/foreclosure penalty after 6 EMIs.`,
      '',
      `**How the loan works**`,
      `• You receive the full amount in one transfer; the EMI (interest + principal) is fixed every month.`,
      `• The bureau sees your repayment monthly — this loan *builds* credit history when paid on time.`,
      `• Collateral: none. This is an unsecured product.`,
      '',
      `**What it does not do**`,
      `• No top-up mid-term on this product; no interest-only months.`,
      `• Late payments cost real money (₹500+GST) and bureau damage — ask me "what if I miss a month?" for the timeline.`,
      '',
      `Your documents: ${snapshot.verified.length} verified${snapshot.allRequiredVerified ? '' : ', some still pending'} — the PDF statement on the dashboard carries all of this with your numbers.`,
    ].join('\n');
  }

  const applicant = ctx.applicant as InsuranceApplicant;
  const loading = conditionLoadingOf(applicant);
  const annual = estimateAnnualPremium(applicant.age, applicant.coverageAmount, Number(applicant.policyTermYears), loading);

  return [
    `Your term plan, explained plainly:`,
    '',
    `**What your family gets**`,
    `• The full **${formatCurrency(applicant.coverageAmount)}** as a tax-free lump sum if anything happens to you during the ${applicant.policyTermYears}-year term.`,
    `• Claim payout within 30 days of complete documents; nominee can raise it online, by phone or at a branch.`,
    '',
    `**What you pay**`,
    `• ${formatCurrency(annual)}/year (level premium, locked for the whole term)${loading > 0 ? `, including the ~${Math.round(loading * 100)}% loading for your declared condition` : ''}.`,
    `• GST extra; Section 80C deduction on the premium.`,
    '',
    `**What is covered** — death from any cause after year 1 (accidents from day 1).`,
    `**What is not** — suicide in year 1 (premiums refunded), and any condition you did not declare. Disclosure is what makes the claim payable.`,
    `**Extras** — 15-day free look on receipt, 30-day grace on premiums, optional riders (accidental death, critical illness) at issue time.`,
    '',
    `The PDF statement has all of this with your exact numbers.`,
  ].join('\n');
}

/* -------------------------------------------------------------- other answers */

function contactResponse(reference: string): string {
  return [
    'I can bring a human in whenever you want one.',
    '',
    '• **Phone:** 1800-123-4567 (9 AM – 8 PM, all days) — quote your reference so you do not repeat yourself.',
    '• **Email:** care@paytm.example — reply within 4 working hours.',
    '• **Branch visit:** not required for this application; everything here can be completed digitally.',
    `• **Your reference:** ${reference}`,
    '',
    'If you would rather not wait on a call, tell me what part is unclear and I will explain it here first.',
  ].join('\n');
}

function cancelResponse(ctx: ChatContext, reference: string): string {
  return [
    `Before you withdraw **${reference}**, worth knowing:`,
    '',
    ctx.journeyType === 'loan'
      ? '• Nothing has been charged yet — the processing fee is only collected at disbursal.'
      : '• No premium has been paid yet; cover starts only when the policy is issued.',
    '• Your eligibility result stays valid for 30 days, so you can come back and pick up where you left off.',
    '• Withdrawing now does not affect your credit score.',
    '',
    'If it is a specific blocker pushing you to this, say the word — most of them are fixable, and I can tell you exactly how from your file.',
  ].join('\n');
}

function generalResponse(ctx: ChatContext): string {
  const snapshot = getDocumentSnapshot(ctx.journeyType, ctx.uploadedDocs);
  const stage = getApplicationStage(ctx.journeyType, snapshot);

  return [
    `I have your whole file in front of me — ${ctx.journeyType === 'loan' ? 'loan' : 'insurance'}, currently at **${stage.label}**, ${snapshot.verified.length} document(s) verified.`,
    '',
    'Ask me anything about it, for example:',
    '• "Where is my application right now?"',
    '• "Which documents are still pending?"',
    '• "When will I hear back?"',
    ctx.journeyType === 'loan' ? '• "What is my EMI and total interest?"' : '• "What will the premium be?"',
    '• "Why is my score what it is, and what would improve it?"',
    '',
    'I answer from your actual application data, not a script — so if you want the reasoning behind any number, just ask.',
  ].join('\n');
}

/* ----------------------------------------------------------------- entrypoint */

export async function generateChatResponse(message: string, context: ChatContext): Promise<ChatReply> {
  const { intent, signals, confidence } = classifyIntent(message);
  const reference = buildReference(context);
  const ctx = context;

  let response: string;

  if (intent === 'general' && /^(hi|hii|hello|hey|namaste)\b/.test(message.trim().toLowerCase())) {
    response = [
      `Hello${ctx.applicant.fullName ? ` ${ctx.applicant.fullName.split(' ')[0]}` : ''}! I have your ${ctx.journeyType === 'loan' ? 'loan' : 'insurance'} application open.`,
      '',
      'What would you like to know first — where it stands, what is pending, or when to expect movement?',
    ].join('\n');
  } else {
    switch (intent) {
      case 'status':
        response = statusResponse(ctx, reference);
        break;
      case 'documents':
        response = documentsResponse(ctx);
        break;
      case 'timeline':
        response = timelineResponse(ctx);
        break;
      case 'amount':
        response = amountResponse(ctx);
        break;
      case 'eligibility':
        response = eligibilityResponse(ctx);
        break;
      case 'improve':
        response = improveResponse(ctx);
        break;
      case 'repayment':
        response = repaymentResponse(ctx);
        break;
      case 'missed_payment':
        response = missedPaymentResponse(ctx);
        break;
      case 'policy':
        response = policyResponse(ctx);
        break;
      case 'contact':
        response = contactResponse(reference);
        break;
      case 'cancel':
        response = cancelResponse(ctx, reference);
        break;
      case 'greeting':
        response = generalResponse(ctx);
        break;
      default:
        response = generalResponse(ctx);
    }
  }

  await delay();
  return { intent, response, signals, confidence };
}

/** Stable per-application reference derived from the applicant, not a timestamp. */
export function buildReference(ctx: { journeyType: JourneyType; applicant: Applicant }): string {
  const prefix = ctx.journeyType === 'loan' ? 'PL' : 'TI';
  const seed = `${ctx.applicant.fullName}|${ctx.applicant.age}|${ctx.applicant.annualIncome}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000000;
  }
  return `${prefix}-${String(hash).padStart(8, '0').slice(0, 8)}`;
}

/** Namespaced so a welcome message can never collide with persisted history. */
let welcomeCounter = 0;

export function createWelcomeMessage(journeyType: JourneyType, applicant: Applicant): ChatMessage {
  const amount =
    'loanAmount' in applicant
      ? `${formatCurrency((applicant as LoanApplicant).loanAmount)} loan over ${(applicant as LoanApplicant).tenureMonths} months`
      : `${formatCurrency((applicant as InsuranceApplicant).coverageAmount)} cover for ${(applicant as InsuranceApplicant).policyTermYears} years`;

  const firstName = (applicant.fullName || '').trim().split(/\s+/)[0] || 'there';
  const journeyWord = journeyType === 'loan' ? 'loan' : 'insurance';

  welcomeCounter += 1;

  return {
    id: `msg-welcome-${Date.now().toString(36)}-${welcomeCounter}`,
    role: 'assistant',
    content: [
      `Hi ${firstName}, your ${journeyWord} application for **${amount}** has reached us.`,
      '',
      'I am your application assistant. Unlike a status page, I can tell you *why* something is stuck and what to do next.',
      '',
      'Ask me: "where is my application?", "which documents are pending?", or "when will I hear back?"',
    ].join('\n'),
    timestamp: new Date(),
    intent: 'greeting',
  };
}
