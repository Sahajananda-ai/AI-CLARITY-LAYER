import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { ChatWindow } from '../features/chat/components/ChatWindow';
import { buildReference, getApplicationStage, getLifecycleStageIndex, getDocumentSnapshot } from '../features/chat/engine';
import { NotificationFeed, dispatchNotification } from '../features/notifications';
import type { LifecycleStage } from '../features/notifications/engine';
import { generateStatementPdf } from '../features/statement';
import { DocumentStatusList } from '../features/documents';
import { getDocumentRequirements } from '../features/documents';
import { Badge, Button, Card, LanguageToggle } from '../shared/components';
import { SwipeToast, Dock, BorderGlow } from '../shared/components/motion';
import { useI18n } from '../shared/i18n';
import {
  ArrowLeft,
  CreditCard,
  Shield,
  Sparkles,
  Upload,
  CheckCircle2,
  AlertCircle,
  XCircle,
  CircleDot,
  FileDown,
  Hourglass,
  CheckCheck,
  ThumbsDown,
  Gauge,
  MessagesSquare,
  Bot,
  ArrowUp,
} from 'lucide-react';
import { JOURNEY_CONFIG, JOURNEY_STAGES, VERDICT_LABELS, VERDICT_COLORS } from '../shared/utils/constants';
import { cn, formatCurrency } from '../shared/utils/cn';

export function Dashboard() {
  const { state, actions } = useApp();
  const navigate = useNavigate();
  const { dict, format, language } = useI18n();
  const { journeyType, applicant, eligibilityResult, uploadedDocuments, decision } = state;
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Nothing to track yet — send the applicant back to the right step.
  if (!journeyType) return <Navigate to="/" replace />;
  if (!applicant || !eligibilityResult) return <Navigate to="/wizard" replace />;

  const config = JOURNEY_CONFIG[journeyType];
  const documents = getDocumentRequirements(journeyType);
  const snapshot = getDocumentSnapshot(journeyType, uploadedDocuments);
  // After submission the lifecycle clock takes over the tracker, so approved /
  // finalised actually move it — it used to freeze at step 3 no matter what.
  const docStage = getApplicationStage(journeyType, snapshot);
  const stage = {
    ...docStage,
    index: getLifecycleStageIndex(state.lifecycle, state.submitted, docStage.index, decision),
  };
  const stages = JOURNEY_STAGES[journeyType];
  const reference = buildReference({ journeyType, applicant });
  const verdictColor = VERDICT_COLORS[eligibilityResult.verdict] as 'success' | 'warning' | 'error';
  const failedCriteria = eligibilityResult.criteria.filter(criterion => !criterion.passed);
  const rejected = decision === 'rejected';
  const approved = decision === 'approved';
  const waitingForDecision = state.submitted && !decision && (state.lifecycle === 'review' || state.lifecycle === 'verified');

  const goToUploads = () => {
    actions.setWizardStep('documents');
    navigate('/wizard');
  };

  const downloadPdf = () => {
    if (!journeyType || !applicant || !eligibilityResult) return;
    setIsGeneratingPdf(true);
    // Let the button paint its busy state before the (synchronous) build runs.
    window.setTimeout(() => {
      try {
        generateStatementPdf({
          journeyType,
          applicant,
          eligibility: eligibilityResult,
          uploadedDocs: uploadedDocuments,
          notifications: state.notifications,
          reference,
          stageLabel: rejected ? dict.lifecycle.rejectedBannerTitle : stage.label,
          language,
          dict,
        });
      } finally {
        setIsGeneratingPdf(false);
      }
    }, 60);
  };

  /** Fires the milestone SMS for a lifecycle stage in the active language. */
  const fireMilestone = (next: 'verified' | 'review' | 'approved' | 'finalized' | 'rejected') => {
    if (!journeyType || !applicant || !state.phone) return;
    const kinds = {
      verified: 'documents_verified',
      review: 'under_review',
      approved: 'approved',
      finalized: 'finalized',
      rejected: 'rejected',
    } as const;
    actions.addNotification(
      dispatchNotification(kinds[next], {
        journeyType,
        applicant,
        reference,
        language,
        dict,
        phone: state.phone,
        rejectionReason: failedCriteria[0]?.reason?.slice(0, 120),
      })
    );
  };

  const advanceTo = (stage: LifecycleStage) => {
    const kinds: Partial<Record<LifecycleStage, Parameters<typeof fireMilestone>[0]>> = {
      verified: 'verified',
      review: 'review',
      approved: 'approved',
      finalized: 'finalized',
      rejected: 'rejected',
    };
    const kind = kinds[stage];
    if (kind) fireMilestone(kind);
    actions.advanceLifecycle(stage);
  };

  /** Demo control: fire the next lifecycle milestone immediately. */
  const advanceStageNow = () => {
    const order: LifecycleStage[] = ['received', 'verified', 'review'];
    const next = state.lifecycle ? order[order.indexOf(state.lifecycle) + 1] : 'verified';
    if (!next) return;
    advanceTo(next);
  };

  /** The underwriter's verdict — the demo's approve/reject moment. */
  const makeDecision = (choice: 'approved' | 'rejected') => {
    actions.setDecision(choice);
    fireMilestone(choice === 'approved' ? 'approved' : 'rejected');
    actions.advanceLifecycle(choice);
  };

  // Rejection banner auto-scroll: bring the "what would change the outcome"
  // panel into view when the judge clicks "see the reasons".
  const scrollToReasons = () => {
    document.getElementById('verdict-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const isFinalized = state.lifecycle === 'finalized' || approved;

  return (
    <div className="min-h-screen bg-surface-50">
      {/* SMS popups: every freshly delivered milestone slides in, phone-style. */}
      <ToastHost />

      <header className="sticky top-0 z-10 border-b border-surface-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-shrink-0 items-center gap-2">
              <LanguageToggle className="hidden sm:inline-flex" />
              <Button
                variant="ghost"
                size="sm"
                className="whitespace-nowrap"
                onClick={() => {
                  actions.reset();
                  navigate('/');
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{dict.newApplication}</span>
                <span className="sm:hidden">{dict.new}</span>
              </Button>
            </div>

            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 sm:flex">
                {journeyType === 'loan' ? (
                  <CreditCard className="h-5 w-5 text-white" />
                ) : (
                  <Shield className="h-5 w-5 text-white" />
                )}
              </div>
              <div className="hidden min-w-0 text-right sm:block">
                <h1 className="truncate text-base font-bold text-surface-900">
                  {config.title} • {applicant.fullName}
                </h1>
                <p className="truncate text-xs text-surface-500">
                  {reference} • {rejected ? dict.lifecycle.rejectedBannerTitle : stage.label}
                </p>
              </div>
              <Badge variant={rejected ? 'error' : verdictColor} dot size="md" className="flex-shrink-0 whitespace-nowrap">
                {rejected ? dict.lifecycle.rejectedBannerTitle : VERDICT_LABELS[eligibilityResult.verdict]}
              </Badge>
            </div>
          </div>
          {/* The full identity line moves under the header on phones. */}
          <p className="mt-2 truncate text-xs text-surface-500 sm:hidden">
            {config.title} • {applicant.fullName} • {reference}
          </p>
          <div className="mt-2 sm:hidden">
            <LanguageToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 pb-28">
        {/* Rejection banner — the failed-journey demonstration */}
        {rejected && (
          <div className="animate-rise-in mb-6 overflow-hidden rounded-2xl border border-error-200 bg-gradient-to-br from-error-50 to-white shadow-card">
            <div className="flex flex-wrap items-start gap-4 p-5">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-error-100">
                <XCircle className="h-6 w-6 text-error-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-error-800">{dict.lifecycle.rejectedBannerTitle}</h2>
                <p className="mt-1 text-sm leading-relaxed text-error-700">{dict.lifecycle.rejectedBannerBody}</p>
                <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 p-4">
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-warning-800">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {dict.lifecycle.rejectedFixTitle}
                  </h3>
                  <ul className="space-y-1.5">
                    {eligibilityResult.suggestions.slice(0, 3).map((suggestion, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-warning-800">
                        <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-warning-500" />
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={scrollToReasons}>
                    {dict.lifecycle.viewReasons}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      actions.reset();
                      navigate('/wizard');
                    }}
                  >
                    {dict.lifecycle.reapply}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Waiting-for-decision card: application is fully in, clock is running */}
        {waitingForDecision && !isFinalized && (
          <Card variant="elevated" padding="md" className="animate-rise-in mb-6 border-primary-200 bg-gradient-to-br from-primary-50/60 to-white">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary-100">
                <Hourglass className="h-5 w-5 text-primary-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-surface-900">{dict.lifecycle.waitingAnswer}</h2>
                <p className="mt-0.5 text-sm text-surface-600">{dict.lifecycle.waitingBody}</p>
              </div>
              {state.lifecycle !== 'review' && (
                <Button variant="secondary" size="sm" onClick={advanceStageNow} title={dict.dashboard.advanceHint}>
                  {dict.dashboard.advance}
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* Live stage tracker */}
        <Card variant="elevated" padding="md" className="mb-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-surface-900">{dict.dashboard.whereStands}</h2>
              <p className="text-xs text-surface-500">
                {rejected
                  ? dict.lifecycle.rejectedBannerTitle
                  : stage.blocker
                    ? format(dict.dashboard.heldUpBy, { blocker: stage.blocker })
                    : dict.dashboard.nothingBlocking}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Underwriter decision control — the approve/reject demo moment */}
              {state.lifecycle === 'review' && !decision && (
                <div className="flex items-center gap-1.5 rounded-xl border border-surface-200 bg-surface-50 p-1.5">
                  <span className="px-1.5 text-[11px] font-semibold uppercase tracking-wide text-surface-500">
                    {dict.lifecycle.decisionTitle}
                  </span>
                  <button
                    type="button"
                    onClick={() => makeDecision('approved')}
                    className="flex items-center gap-1.5 rounded-lg bg-success-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-success-700 hover:shadow-md"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    {dict.lifecycle.approve}
                  </button>
                  <button
                    type="button"
                    onClick={() => makeDecision('rejected')}
                    className="flex items-center gap-1.5 rounded-lg bg-error-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-error-700 hover:shadow-md"
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                    {dict.lifecycle.reject}
                  </button>
                </div>
              )}
              {state.submitted && !decision && state.lifecycle !== 'review' && state.lifecycle !== 'finalized' && (
                <Button variant="secondary" size="sm" onClick={advanceStageNow} title={dict.dashboard.advanceHint}>
                  {dict.dashboard.advance}
                </Button>
              )}
              <Button size="sm" onClick={downloadPdf} loading={isGeneratingPdf} id="pdf-download-btn">
                <FileDown className="h-4 w-4" />
                {dict.statement.downloadPdf}
              </Button>
              <span className="hidden rounded-full bg-surface-100 px-3 py-1 text-xs font-medium text-surface-600 md:inline">
                {format(dict.dashboard.stepOf, { current: Math.min(stage.index + 1, stages.length), total: stages.length })}
              </span>
            </div>
          </div>

          <ol className="flex flex-col gap-3 sm:flex-row sm:items-start">
            {stages.map((label, index) => {
              const isDone = index < stage.index;
              const isCurrent = index === stage.index;
              const isRejectPoint = rejected && index === 4;
              const allComplete = stage.index >= stages.length;
              return (
                <li key={label} className="flex flex-1 items-center gap-3 sm:flex-col sm:items-start">
                  <div className="flex items-center gap-2 sm:w-full">
                    <span
                      className={cn(
                        'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        isRejectPoint
                          ? 'bg-error-500 text-white ring-4 ring-error-100'
                          : isDone || (allComplete && !isCurrent)
                            ? 'bg-success-500 text-white'
                            : isCurrent
                              ? 'bg-primary-600 text-white ring-4 ring-primary-100'
                              : 'bg-surface-200 text-surface-500'
                      )}
                    >
                      {isRejectPoint ? (
                        <XCircle className="h-4 w-4" />
                      ) : isDone || (allComplete && !isCurrent) ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span
                      className={cn(
                        'hidden flex-1 rounded sm:block',
                        isRejectPoint ? 'bg-error-300' : isDone || (allComplete && !isCurrent) ? 'bg-success-200' : 'bg-surface-200',
                        'h-0.5'
                      )}
                    />
                  </div>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        'text-xs font-medium',
                        isRejectPoint
                          ? 'text-error-700'
                          : isCurrent
                            ? 'text-primary-700'
                            : isDone || allComplete
                              ? 'text-success-700'
                              : 'text-surface-600'
                      )}
                    >
                      {label}
                    </p>
                    {isCurrent && !isRejectPoint && <p className="text-[11px] text-surface-400">{dict.dashboard.inProgress}</p>}
                    {isRejectPoint && <p className="text-[11px] text-error-600">{dict.lifecycle.rejectedBannerTitle}</p>}
                    {allComplete && !isCurrent && !isRejectPoint && (
                      <p className="text-[11px] text-success-600">{dict.dashboard.completed}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        {/* grid-cols-1 matters: without an explicit base track, the implicit
            auto track sizes to max-content and the page overflows on phones. */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-12">
          {/* Notification feed spans the first column on md and stacks on mobile */}
          <div className="lg:col-span-3 md:order-3 lg:order-1">
            <Card variant="elevated" padding="none" className="flex h-[520px] flex-col lg:sticky lg:top-24">
              <NotificationFeed />
            </Card>
          </div>
          {/* Eligibility summary */}
          <div className="lg:col-span-3" id="verdict-panel">
            <Card variant="elevated" padding="lg" className="lg:sticky lg:top-24">
              <div className="mb-5 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary-600" />
                <h2 className="text-sm font-semibold text-surface-900">{dict.eligibility.whyVerdict}</h2>
              </div>

              <div className="mb-4 text-center">
                <Badge variant={rejected ? 'error' : verdictColor} size="md" dot className="mb-2">
                  {rejected ? dict.lifecycle.rejectedBannerTitle : VERDICT_LABELS[eligibilityResult.verdict]}
                </Badge>
                <div className="text-3xl font-bold text-surface-900">{eligibilityResult.score}%</div>
                <p className="text-xs text-surface-500">{dict.eligibility.weightedScore}</p>
              </div>

              <p className="mb-5 rounded-lg bg-surface-50 p-3 text-sm leading-relaxed text-surface-700">
                {eligibilityResult.summary}
              </p>

              <div className="mb-5 space-y-2">
                {eligibilityResult.criteria.map(criterion => (
                  <div key={criterion.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-50 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      {criterion.passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-success-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 flex-shrink-0 text-error-600" />
                      )}
                      <span className="truncate text-xs font-medium text-surface-800">{criterion.label}</span>
                    </span>
                    <span className="flex-shrink-0 text-[11px] text-surface-500">{criterion.comparison}</span>
                  </div>
                ))}
              </div>

              {failedCriteria.length > 0 && (
                <div className="rounded-lg border border-warning-200 bg-warning-50 p-3">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-warning-800">
                    {dict.eligibility.whatWouldChange}
                  </h3>
                  <ul className="space-y-1.5">
                    {eligibilityResult.suggestions.slice(0, 3).map((suggestion, index) => (
                      <li key={index} className="flex items-start gap-2 text-xs text-warning-800">
                        <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-warning-500" />
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <dl className="mt-5 space-y-2 border-t border-surface-200 pt-4 text-xs">
                {journeyType === 'loan' && 'loanAmount' in applicant && (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-surface-500">{dict.dashboard.loanAmount}</dt>
                      <dd className="font-medium text-surface-900">{formatCurrency(applicant.loanAmount)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-surface-500">{dict.dashboard.tenure}</dt>
                      <dd className="font-medium text-surface-900">{applicant.tenureMonths} months</dd>
                    </div>
                    {applicant.loanPurpose && (
                      <div className="flex justify-between">
                        <dt className="text-surface-500">{dict.purpose.title}</dt>
                        <dd className="font-medium text-surface-900">
                          {dict.purpose[applicant.loanPurpose as keyof typeof dict.purpose] as string}
                        </dd>
                      </div>
                    )}
                    {state.bankDetails && (
                      <div className="flex justify-between">
                        <dt className="text-surface-500">{dict.bank.bankName}</dt>
                        <dd className="font-medium text-surface-900">••{state.bankDetails.accountNumber.slice(-4)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-surface-500">{dict.dashboard.monthlyIncome}</dt>
                      <dd className="font-medium text-surface-900">{formatCurrency(applicant.annualIncome / 12)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-surface-500">{dict.dashboard.existingEmis}</dt>
                      <dd className="font-medium text-surface-900">{formatCurrency(applicant.existingEMIs)}</dd>
                    </div>
                  </>
                )}
                {journeyType === 'insurance' && 'coverageAmount' in applicant && (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-surface-500">{dict.dashboard.cover}</dt>
                      <dd className="font-medium text-surface-900">{formatCurrency(applicant.coverageAmount)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-surface-500">{dict.dashboard.term}</dt>
                      <dd className="font-medium text-surface-900">{applicant.policyTermYears} years</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-surface-500">{dict.dashboard.annualIncome}</dt>
                      <dd className="font-medium text-surface-900">{formatCurrency(applicant.annualIncome)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-surface-500">{dict.dashboard.declaredConditions}</dt>
                      <dd className="font-medium text-surface-900">{applicant.preExistingConditions || 'None'}</dd>
                    </div>
                  </>
                )}
              </dl>
            </Card>
          </div>

          {/* Documents */}
          <div className="lg:col-span-3">
            <Card variant="elevated" padding="lg" className="lg:sticky lg:top-24">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-surface-900">{dict.dashboard.docReview}</h2>
                <Badge
                  variant={
                    snapshot.allRequiredVerified
                      ? 'success'
                      : snapshot.flagged.some(doc => doc.status === 'fail')
                        ? 'error'
                        : 'warning'
                  }
                  dot
                >
                  {snapshot.verified.length}/{documents.filter(doc => doc.required).length} {dict.dashboard.verified}
                </Badge>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-success-50 p-2">
                  <div className="text-xl font-bold text-success-600">{snapshot.verified.length}</div>
                  <div className="text-[11px] text-surface-600">{dict.dashboard.verified}</div>
                </div>
                <div className="rounded-lg bg-warning-50 p-2">
                  <div className="text-xl font-bold text-warning-600">
                    {snapshot.flagged.filter(doc => doc.status === 'warning').length}
                  </div>
                  <div className="text-[11px] text-surface-600">{dict.dashboard.review}</div>
                </div>
                <div className="rounded-lg bg-error-50 p-2">
                  <div className="text-xl font-bold text-error-600">
                    {snapshot.flagged.filter(doc => doc.status === 'fail').length}
                  </div>
                  <div className="text-[11px] text-surface-600">{dict.dashboard.issues}</div>
                </div>
              </div>

              <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                <DocumentStatusList
                  documents={documents}
                  uploadedDocs={uploadedDocuments}
                  applicantName={applicant.fullName}
                />
              </div>

              {(snapshot.notUploaded.length > 0 || snapshot.flagged.some(doc => doc.status === 'fail')) && (
                <div className="mt-4 rounded-lg border border-primary-200 bg-primary-50 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary-800">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {dict.dashboard.actionNeeded}
                  </p>
                  <ul className="mb-3 space-y-1 text-xs text-primary-800">
                    {snapshot.notUploaded.map(doc => (
                      <li key={doc.id} className="flex items-center gap-1.5">
                        <CircleDot className="h-3 w-3 flex-shrink-0" />
                        {format(dict.dashboard.notUploadedItem, { name: doc.name })}
                      </li>
                    ))}
                    {snapshot.flagged
                      .filter(doc => doc.status === 'fail')
                      .map(doc => (
                        <li key={doc.id} className="flex items-center gap-1.5">
                          <CircleDot className="h-3 w-3 flex-shrink-0" />
                          {format(dict.dashboard.mustReplaceItem, { name: doc.fileName })}
                        </li>
                      ))}
                  </ul>
                  <Button size="sm" onClick={goToUploads} className="w-full">
                    <Upload className="h-4 w-4" />
                    {dict.dashboard.uploadMissing}
                  </Button>
                </div>
              )}
            </Card>
          </div>

          {/* Assistant — the glowing centrepiece */}
          <div className="lg:col-span-3 md:order-2 lg:order-4">
            <BorderGlow
              borderRadius={16}
              backgroundColor="#ffffff"
              edgeSensitivity={36}
              glowRadius={44}
              glowIntensity={0.9}
              colors={['#0b5cd6', '#22c1dc', '#6366f1']}
              className="h-[70vh] min-h-[460px] shadow-card lg:sticky lg:top-24 lg:h-[640px]"
            >
              <div className="flex h-full flex-col overflow-hidden" style={{ borderRadius: 15 }}>
                <ChatWindow />
              </div>
            </BorderGlow>
          </div>
        </div>
      </main>

      {/* Quick navigation dock */}
      <Dock
        items={[
          {
            icon: <Gauge className="h-5 w-5" />,
            label: dict.dock.tracker,
            onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
          },
          {
            icon: <MessagesSquare className="h-5 w-5" />,
            label: dict.dock.messages,
            onClick: () => document.getElementById('verdict-panel')?.scrollIntoView({ behavior: 'smooth' }),
          },
          {
            icon: <Bot className="h-5 w-5" />,
            label: dict.dock.assistant,
            onClick: () => document.querySelector('[aria-label="Message the application assistant"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
          },
          {
            icon: <FileDown className="h-5 w-5" />,
            label: dict.statement.downloadPdf,
            onClick: downloadPdf,
          },
          {
            icon: <ArrowUp className="h-5 w-5" />,
            label: dict.dock.top,
            onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
          },
        ]}
      />
    </div>
  );
}

/**
 * Renders one SwipeToast per fresh milestone (FIFO, one at a time so the stack
 * never covers the screen). Pops for every step of the SMS flow: received →
 * eligibility → documents → verified → under review → decision. Dismissing a
 * toast (timeout, swipe or ✕) marks the message read and shows the next one.
 */
function ToastHost() {
  const { state, actions } = useApp();
  const { dict } = useI18n();
  const { pendingToastIds, notifications } = state;
  const shownIdsRef = useRef<Set<string>>(new Set());

  const nextId = pendingToastIds[0] ?? null;
  const record = nextId ? (notifications.find(n => n.id === nextId) ?? null) : null;

  useEffect(() => {
    if (nextId) shownIdsRef.current.add(nextId);
  }, [nextId]);

  const dismiss = () => {
    if (!nextId) return;
    actions.consumeToast(nextId);
    const target = notifications.find(n => n.id === nextId);
    if (target && !target.read) {
      // Mark just this one read so the feed badge stays honest.
      window.setTimeout(() => actions.markNotificationsRead(), 0);
    }
  };

  if (!record) return null;

  const isRejection = record.kind === 'rejected' || record.kind === 'document_issue';
  const kindLabel =
    record.kind === 'approved'
      ? dict.notifications.title
      : record.title;

  return (
    <div className="pointer-events-none fixed bottom-24 right-5 z-[80] flex flex-col items-end gap-2.5">
      <div className="pointer-events-auto">
        <SwipeToast
          key={record.id}
          open
          onClose={() => dismiss()}
          title={kindLabel}
          description={record.body}
          icon={
            <span
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full',
                isRejection ? 'bg-error-500/20 text-error-300' : 'bg-success-500/20 text-success-300'
              )}
            >
              {isRejection ? <XCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
            </span>
          }
          background="#0f172a"
          color="#f8fafc"
          fuseColor={isRejection ? '#f87171' : '#22c1dc'}
          width={356}
          radius={14}
          slideMs={400}
          settleBounce={0.2}
          swipeDistance={60}
          duration={6000}
          fuse="bottom"
          pauseOnHover
        />
      </div>
    </div>
  );
}
