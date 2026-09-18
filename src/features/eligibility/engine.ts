import type {
  Criteria,
  EligibilityResult,
  LoanApplicant,
  InsuranceApplicant,
  Applicant,
} from '../../shared/types/common';
import { JOURNEY_CONFIG, EMPLOYMENT_TYPE_LABELS, PREMIUM_TABLE } from '../../shared/utils/constants';
import { formatCurrency } from '../../shared/utils/formatters';

/**
 * The eligibility "engine" is a deterministic underwriting rulebook. It is
 * deliberate about three things so the output never reads like a bare if/else:
 *
 *  1. every criterion explains itself in plain language with the actual numbers
 *     compared (see `comparison`),
 *  2. near-misses earn partial credit instead of scoring a flat zero, so the
 *     score moves in a believable way when the applicant edits one field,
 *  3. the verdict accounts for *which* criteria failed — a low-weight miss
 *     (declared diabetes) never blocks an otherwise strong profile the way a
 *     low credit score does.
 */

/** Fraction of a criterion's weight earned, allowing smooth partial credit. */
function linearCredit(value: number, threshold: number, floor: number): number {
  if (value >= threshold) return 1;
  if (value <= floor) return 0;
  return (value - floor) / (threshold - floor);
}

function evaluateLoanCriteria(applicant: LoanApplicant): { criteria: Criteria[]; score: number } {
  const config = JOURNEY_CONFIG.loan;
  const criteria: Criteria[] = [];
  const credits: number[] = [];

  // --- 1. Age ------------------------------------------------------------
  const agePassed = applicant.age >= config.minAge && applicant.age <= config.maxAge;
  criteria.push({
    id: 'age',
    label: 'Age band',
    passed: agePassed,
    reason: agePassed
      ? `At ${applicant.age} you sit inside the ${config.minAge}-${config.maxAge} band this product lends to.`
      : `At ${applicant.age} you fall outside the ${config.minAge}-${config.maxAge} band for a personal loan.`,
    comparison: `Age ${applicant.age} vs allowed ${config.minAge}-${config.maxAge}`,
    weight: 0.1,
    actionable: false,
    suggestion: agePassed ? undefined : 'This one cannot be changed — ask us about a secured loan or a co-applicant instead.',
  });
  credits.push(agePassed ? 1 : 0);

  // --- 2. Income ---------------------------------------------------------
  const incomePassed = applicant.annualIncome >= config.minIncome;
  criteria.push({
    id: 'income',
    label: 'Minimum income',
    passed: incomePassed,
    reason: incomePassed
      ? `Your ${formatCurrency(applicant.annualIncome)} annual income clears our ${formatCurrency(config.minIncome)} floor, with ${formatCurrency(applicant.annualIncome - config.minIncome)} of headroom.`
      : `Your ${formatCurrency(applicant.annualIncome)} annual income is ${formatCurrency(config.minIncome - applicant.annualIncome)} short of our ${formatCurrency(config.minIncome)} floor.`,
    comparison: `${formatCurrency(applicant.annualIncome)} vs ${formatCurrency(config.minIncome)} required`,
    weight: 0.25,
    actionable: true,
    suggestion: incomePassed
      ? undefined
      : `Add a co-applicant's income or declare freelance/bonus income — even ${formatCurrency(config.minIncome - applicant.annualIncome)} more per year would clear this.`,
  });
  credits.push(linearCredit(applicant.annualIncome, config.minIncome, config.minIncome * 0.6));

  // --- 3. Employment -----------------------------------------------------
  const empPassed = applicant.employmentType !== 'business';
  criteria.push({
    id: 'employment',
    label: 'Employment stability',
    passed: empPassed,
    reason: empPassed
      ? `You are ${EMPLOYMENT_TYPE_LABELS[applicant.employmentType].toLowerCase()}, so your income is verifiable from salary credits or filed returns.`
      : 'Business owners are welcome, but we need audited numbers before we can price the risk.',
    comparison: `${EMPLOYMENT_TYPE_LABELS[applicant.employmentType]} profile`,
    weight: 0.15,
    actionable: true,
    suggestion: empPassed ? undefined : 'Upload 2 years of ITRs plus 12 months of business bank statements to convert this to a pass.',
  });
  credits.push(empPassed ? 1 : 0.4);

  // --- 4. Credit score ---------------------------------------------------
  const creditPassed = applicant.creditScore >= config.minCreditScore;
  const scoreGap = config.minCreditScore - applicant.creditScore;
  criteria.push({
    id: 'credit_score',
    label: 'Credit score (CIBIL)',
    passed: creditPassed,
    reason: creditPassed
      ? `A ${applicant.creditScore} CIBIL score is ${applicant.creditScore - config.minCreditScore} points above our ${config.minCreditScore} cut-off — this is your strongest lever on the rate we can offer.`
      : `A ${applicant.creditScore} CIBIL score is ${scoreGap} points below our ${config.minCreditScore} cut-off, and it is the single biggest reason we cannot approve at standard pricing today.`,
    comparison: `CIBIL ${applicant.creditScore} vs ${config.minCreditScore} required`,
    weight: 0.25,
    actionable: true,
    suggestion: creditPassed
      ? undefined
      : scoreGap <= 40
        ? `You are only ${scoreGap} points away. Clearing one overdue card balance usually moves the score 30-50 points in a billing cycle.`
        : `Bring your score up ${scoreGap} points: clear overdue EMIs first, then keep card utilisation under 30% for 3 months.`,
  });
  credits.push(linearCredit(applicant.creditScore, config.minCreditScore, 500));

  // --- 5. FOIR (debt-to-income) -----------------------------------------
  const monthlyIncome = applicant.annualIncome / 12;
  const proposedEmi = calculateEmi(applicant.loanAmount, config.annualInterestRate, Number(applicant.tenureMonths));
  const totalObligation = applicant.existingEMIs + proposedEmi;
  const foir = monthlyIncome > 0 ? totalObligation / monthlyIncome : 1;
  const foirPassed = foir <= config.maxFOIR;
  const foirCeiling = monthlyIncome * config.maxFOIR;
  criteria.push({
    id: 'foir',
    label: 'Debt-to-income (FOIR)',
    passed: foirPassed,
    reason: foirPassed
      ? `Roughly ${(foir * 100).toFixed(0)}% of your ${formatCurrency(monthlyIncome)} monthly income would go to EMIs — comfortably under our ${(config.maxFOIR * 100).toFixed(0)}% ceiling.`
      : `About ${(foir * 100).toFixed(0)}% of your ${formatCurrency(monthlyIncome)} monthly income would go to EMIs, past our ${(config.maxFOIR * 100).toFixed(0)}% ceiling.`,
    comparison: `FOIR ${(foir * 100).toFixed(0)}% vs ${(config.maxFOIR * 100).toFixed(0)}% limit`,
    weight: 0.15,
    actionable: true,
    suggestion: foirPassed
      ? undefined
      : `Either close ${formatCurrency(Math.max(0, totalObligation - foirCeiling))}/month of existing EMIs, or stretch the tenure — a longer tenure lowers the monthly instalment and fixes this by itself.`,
  });
  credits.push(linearCredit(config.maxFOIR, foir, config.maxFOIR * 1.6));

  // --- 6. Loan-to-income -------------------------------------------------
  const loanToIncome = applicant.annualIncome > 0 ? applicant.loanAmount / applicant.annualIncome : 99;
  const loanPassed = loanToIncome <= 5;
  criteria.push({
    id: 'loan_amount',
    label: 'Loan size vs income',
    passed: loanPassed,
    reason: loanPassed
      ? `You are asking for ${loanToIncome.toFixed(1)}x your annual income, inside our 5x unsecured limit.`
      : `You are asking for ${loanToIncome.toFixed(1)}x your annual income, above our 5x unsecured limit.`,
    comparison: `${loanToIncome.toFixed(1)}x income vs 5.0x limit`,
    weight: 0.1,
    actionable: true,
    suggestion: loanPassed
      ? undefined
      : `Drop the request to about ${formatCurrency(applicant.annualIncome * 5)} and this criterion passes immediately.`,
  });
  credits.push(linearCredit(5, loanToIncome, 7.5));

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const earned = criteria.reduce((sum, c, i) => sum + c.weight * credits[i], 0);
  return { criteria, score: Math.round((earned / totalWeight) * 100) };
}

function evaluateInsuranceCriteria(applicant: InsuranceApplicant): { criteria: Criteria[]; score: number } {
  const config = JOURNEY_CONFIG.insurance;
  const criteria: Criteria[] = [];
  const credits: number[] = [];

  // --- 1. Age ------------------------------------------------------------
  const age = Number(applicant.age);
  const agePassed = age >= config.minAge && age <= config.maxAge;
  criteria.push({
    id: 'age',
    label: 'Entry age',
    passed: agePassed,
    reason: agePassed
      ? `At ${age} you are inside the ${config.minAge}-${config.maxAge} entry band. Premiums rise with age, so locking a term now is cheaper than waiting.`
      : `At ${age} you are outside the ${config.minAge}-${config.maxAge} entry band for this plan.`,
    comparison: `Age ${age} vs allowed ${config.minAge}-${config.maxAge}`,
    weight: 0.15,
    actionable: false,
    suggestion: agePassed ? undefined : 'Entry age is fixed. Let us show you a plan with a wider band instead.',
  });
  credits.push(agePassed ? 1 : 0);

  // --- 2. Income ---------------------------------------------------------
  const incomePassed = applicant.annualIncome >= config.minIncome;
  criteria.push({
    id: 'income',
    label: 'Minimum income',
    passed: incomePassed,
    reason: incomePassed
      ? `Your ${formatCurrency(applicant.annualIncome)} annual income supports the premium without stretching your monthly budget.`
      : `We look for at least ${formatCurrency(config.minIncome)} a year so the premium stays affordable if you are out of work.`,
    comparison: `${formatCurrency(applicant.annualIncome)} vs ${formatCurrency(config.minIncome)} required`,
    weight: 0.2,
    actionable: true,
    suggestion: incomePassed ? undefined : `Declaring additional income proof for ${formatCurrency(config.minIncome - applicant.annualIncome)} more would clear this.`,
  });
  credits.push(linearCredit(applicant.annualIncome, config.minIncome, config.minIncome * 0.6));

  // --- 3. Employment -----------------------------------------------------
  const empPassed = applicant.employmentType !== 'business';
  criteria.push({
    id: 'employment',
    label: 'Income verification',
    passed: empPassed,
    reason: empPassed
      ? `${EMPLOYMENT_TYPE_LABELS[applicant.employmentType]} income is straightforward for us to verify, so underwriting is faster.`
      : 'Business income needs audited proof before underwriting can proceed.',
    comparison: `${EMPLOYMENT_TYPE_LABELS[applicant.employmentType]} profile`,
    weight: 0.15,
    actionable: true,
    suggestion: empPassed ? undefined : 'Share 2 years of ITRs and we can verify this without a field visit.',
  });
  credits.push(empPassed ? 1 : 0.4);

  // --- 4. Coverage vs income --------------------------------------------
  const coverageMultiplier = applicant.annualIncome > 0 ? applicant.coverageAmount / applicant.annualIncome : 99;
  const coveragePassed = coverageMultiplier <= config.maxCoverageMultiplier;
  criteria.push({
    id: 'coverage',
    label: 'Cover amount vs income',
    passed: coveragePassed,
    reason: coveragePassed
      ? `A ${formatCurrency(applicant.coverageAmount)} cover is ${coverageMultiplier.toFixed(1)}x your income — a sensible replacement for the years your family depends on it.`
      : `A ${formatCurrency(applicant.coverageAmount)} cover is ${coverageMultiplier.toFixed(1)}x your income, above the ${config.maxCoverageMultiplier}x we can underwrite without a medical.`,
    comparison: `${coverageMultiplier.toFixed(1)}x income vs ${config.maxCoverageMultiplier}x limit`,
    weight: 0.25,
    actionable: true,
    suggestion: coveragePassed
      ? undefined
      : `Bring the cover to about ${formatCurrency(applicant.annualIncome * config.maxCoverageMultiplier)}, or keep it and opt for the medical examination track.`,
  });
  credits.push(linearCredit(config.maxCoverageMultiplier, coverageMultiplier, config.maxCoverageMultiplier * 1.6));

  // --- 5. Policy term ----------------------------------------------------
  const termYears = Number(applicant.policyTermYears);
  const maturityAge = age + termYears;
  const termPassed = maturityAge <= config.maxMaturityAge;
  criteria.push({
    id: 'policy_term',
    label: 'Maturity age',
    passed: termPassed,
    reason: termPassed
      ? `A ${termYears}-year term matures at age ${maturityAge}, inside our ${config.maxMaturityAge}-year ceiling.`
      : `A ${termYears}-year term matures at age ${maturityAge}, past our ${config.maxMaturityAge}-year ceiling.`,
    comparison: `Matures at ${maturityAge} vs max ${config.maxMaturityAge}`,
    weight: 0.15,
    actionable: true,
    suggestion: termPassed
      ? undefined
      : `Shorten the term to ${config.maxMaturityAge - age} years or fewer and this passes.`,
  });
  credits.push(linearCredit(config.maxMaturityAge, maturityAge, config.maxMaturityAge + 8));

  // --- 6. Pre-existing conditions ---------------------------------------
  const declared = (applicant.preExistingConditions || '').trim();
  const hasCondition = declared !== '' && declared.toLowerCase() !== 'none';
  criteria.push({
    id: 'pre_existing',
    label: 'Pre-existing conditions',
    passed: !hasCondition,
    reason: hasCondition
      ? `You declared "${declared}". This does not disqualify you — declaring it honestly now avoids a claim dispute later. Expect a premium loading of roughly 40% and possibly a medical test.`
      : 'Nothing declared, so you get standard pricing and a shorter medical questionnaire.',
    comparison: hasCondition ? `Declared: ${declared}` : 'None declared',
    weight: 0.1,
    actionable: false,
    suggestion: hasCondition ? 'Keep your prescriptions and last 3 months of reports handy — underwriting may ask for them.' : undefined,
  });
  credits.push(hasCondition ? 0.5 : 1);

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const earned = criteria.reduce((sum, c, i) => sum + c.weight * credits[i], 0);
  return { criteria, score: Math.round((earned / totalWeight) * 100) };
}

/**
 * A verdict needs both a decent score AND no high-weight failure. That is why
 * declared diabetes (weight 0.1) can still be "Eligible", while a weak CIBIL
 * (weight 0.25) pushes the same profile to "Conditionally Eligible".
 */
function determineVerdict(score: number, criteria: Criteria[]): EligibilityResult['verdict'] {
  const criticalFailures = criteria.filter(c => !c.passed && c.weight >= 0.2);
  if (score >= 78 && criticalFailures.length === 0) return 'eligible';
  if (score >= 50 && criticalFailures.length <= 1) return 'conditional';
  return 'not-eligible';
}

function buildSummary(
  applicant: Applicant,
  verdict: EligibilityResult['verdict'],
  score: number,
  criteria: Criteria[]
): string {
  const firstName = (applicant.fullName || 'You').trim().split(/\s+/)[0] || 'You';
  const passed = criteria.filter(c => c.passed);
  const failed = criteria.filter(c => !c.passed);
  const biggestBlocker = [...failed].sort((a, b) => b.weight - a.weight)[0];
  const head =
    verdict === 'eligible'
      ? `${firstName}, you clear every criterion that matters — nothing here should stop an approval.`
      : verdict === 'conditional'
        ? `${firstName}, you are mostly there. ${passed.length} of ${criteria.length} criteria pass, but we would need a couple of things addressed before an approval is likely.`
        : `${firstName}, on today's numbers we could not approve this at standard terms — ${failed.length} of ${criteria.length} criteria fall short.`;

  const tail = biggestBlocker
    ? verdict === 'eligible'
      ? ` The one item to be aware of is ${biggestBlocker.label.toLowerCase()} — ${biggestBlocker.comparison ?? biggestBlocker.reason} That changes your price, not your approval.`
      : ` The biggest single reason is ${biggestBlocker.label.toLowerCase()}: ${biggestBlocker.comparison ?? biggestBlocker.reason}`
    : '';

  return `${head}${tail} (overall ${score}%).`;
}

function buildNotes(rawScore: number, score: number, criteria: Criteria[]): string[] {
  const notes: string[] = [];
  const passed = criteria.filter(c => c.passed).length;
  notes.push(`${passed} of ${criteria.length} criteria passed, weighted by how much each one matters to underwriting.`);
  if (score < rawScore) {
    notes.push(`Base score ${rawScore}% then -${rawScore - score}% for the heavyweight miss(es) below, giving ${score}%.`);
  }
  const criticalFailures = criteria.filter(c => !c.passed && c.weight >= 0.2);
  if (criticalFailures.length === 0) {
    notes.push('No high-weight criterion failed, which is what keeps the verdict at the top tier.');
  } else {
    notes.push(
      `High-weight failures (${criticalFailures.map(c => c.label.toLowerCase()).join(', ')}) cap the verdict — even a perfect score elsewhere would not lift it.`
    );
  }
  const lowWeightMisses = criteria.filter(c => !c.passed && c.weight < 0.2);
  if (lowWeightMisses.length > 0) {
    const labels = lowWeightMisses.map(c => c.label.toLowerCase()).join(', ');
    notes.push(
      `${labels.charAt(0).toUpperCase()}${labels.slice(1)} affected the score but not the verdict, because we score risk, not perfection.`
    );
  }
  if (score >= 50 && score < 78) {
    notes.push('A gap this size usually closes with one or two targeted fixes rather than a new application.');
  }
  return notes;
}

function buildSuggestions(criteria: Criteria[]): string[] {
  const failed = criteria.filter(c => !c.passed && c.suggestion && c.actionable !== false);
  const fixed = criteria.filter(c => !c.passed && c.suggestion && c.actionable === false);
  return [...failed.map(c => c.suggestion!), ...fixed.map(c => c.suggestion!)];
}

export function evaluateEligibility(applicant: Applicant): EligibilityResult {
  const { criteria, score: rawScore } =
    'loanAmount' in applicant
      ? evaluateLoanCriteria(applicant as LoanApplicant)
      : evaluateInsuranceCriteria(applicant as InsuranceApplicant);

  // A missed criterion that carries real underwriting weight drags the headline
  // score down too, so "88% but conditional" never happens.
  const criticalFailureCount = criteria.filter(c => !c.passed && c.weight >= 0.2).length;
  const score = Math.max(0, rawScore - criticalFailureCount * 12);
  const verdict = determineVerdict(score, criteria);

  return {
    verdict,
    score,
    criteria,
    suggestions: buildSuggestions(criteria),
    summary: buildSummary(applicant, verdict, score, criteria),
    notes: buildNotes(rawScore, score, criteria),
  };
}

/* ---------------------------------------------------------------------------
 * Shared maths reused by the status assistant so the chatbot quotes the same
 * numbers the eligibility screen produced.
 * ------------------------------------------------------------------------- */

/** Standard amortising EMI. */
export function calculateEmi(principal: number, annualRate: number, months: number): number {
  if (months <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return principal / months;
  const factor = Math.pow(1 + r, months);
  return (principal * r * factor) / (factor - 1);
}

/** Indicative annual premium for a term plan, using the age-band table. */
export function estimateAnnualPremium(
  age: number,
  coverageAmount: number,
  termYears: number,
  conditionLoading = 0
): number {
  const band = PREMIUM_TABLE.find(b => age <= b.maxAge) ?? PREMIUM_TABLE[PREMIUM_TABLE.length - 1];
  const termFactor = termYears <= 15 ? 0.85 : termYears >= 25 ? 1.2 : 1;
  const annual = (coverageAmount / 100000) * band.ratePerLakhPerYear * termFactor * (1 + conditionLoading);
  return Math.max(0, Math.round(annual));
}
