import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { ChatWindow } from '../features/chat/components/ChatWindow';
import { buildReference, getApplicationStage, getDocumentSnapshot } from '../features/chat/engine';
import { NotificationFeed, dispatchNotification } from '../features/notifications';
import { generateStatementPdf } from '../features/statement';
import { DocumentStatusList } from '../features/documents';
import { getDocumentRequirements } from '../features/documents';
import { Badge, Button, Card, LanguageToggle } from '../shared/components';
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
  FastForward,
} from 'lucide-react';
import { JOURNEY_CONFIG, JOURNEY_STAGES, VERDICT_LABELS, VERDICT_COLORS } from '../shared/utils/constants';
import { cn, formatCurrency } from '../shared/utils/cn';

export function Dashboard() {
  const { state, actions } = useApp();
  const navigate = useNavigate();
  const { dict, format, language } = useI18n();
  const { journeyType, applicant, eligibilityResult, uploadedDocuments } = state;
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Nothing to track yet — send the applicant back to the right step.
  if (!journeyType) return <Navigate to="/" replace />;
  if (!applicant || !eligibilityResult) return <Navigate to="/wizard" replace />;

  const config = JOURNEY_CONFIG[journeyType];
  const documents = getDocumentRequirements(journeyType);
  const snapshot = getDocumentSnapshot(journeyType, uploadedDocuments);
  const stage = getApplicationStage(journeyType, snapshot);
  const stages = JOURNEY_STAGES[journeyType];
  const reference = buildReference({ journeyType, applicant });
  const verdictColor = VERDICT_COLORS[eligibilityResult.verdict] as 'success' | 'warning' | 'error';
  const failedCriteria = eligibilityResult.criteria.filter(criterion => !criterion.passed);

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
          stageLabel: stage.label,
          language,
          dict,
        });
      } finally {
        setIsGeneratingPdf(false);
      }
    }, 60);
  };

  /** Demo control: fire the next lifecycle milestone immediately. */
  const advanceStageNow = () => {
    const order = ['received', 'verified', 'approved', 'finalized'] as const;
    const next = state.lifecycle ? order[order.indexOf(state.lifecycle) + 1] : ('verified' as const);
    if (!next || next === 'received' || !journeyType || !applicant || !state.phone) return;
    const kinds = { verified: 'documents_verified', approved: 'approved', finalized: 'finalized' } as const;
    const kind: (typeof kinds)[keyof typeof kinds] = kinds[next];
    if (kind) {
      actions.addNotification(
        dispatchNotification(kind, {
          journeyType,
          applicant,
          reference,
          language,
          dict,
          phone: state.phone,
        })
      );
    }
    actions.advanceLifecycle(next);
  };

  return (
    <div className="min-h-screen bg-surface-50">
      <header className="sticky top-0 z-10 border-b border-surface-200 bg-white">
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
              <div className="hidden h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-100 sm:flex">
                {journeyType === 'loan' ? (
                  <CreditCard className="h-5 w-5 text-primary-600" />
                ) : (
                  <Shield className="h-5 w-5 text-primary-600" />
                )}
              </div>
              <div className="hidden min-w-0 text-right sm:block">
                <h1 className="truncate text-base font-bold text-surface-900">
                  {config.title} • {applicant.fullName}
                </h1>
                <p className="truncate text-xs text-surface-500">
                  {reference} • {stage.label}
                </p>
              </div>
              <Badge variant={verdictColor} dot size="md" className="flex-shrink-0 whitespace-nowrap">
                {VERDICT_LABELS[eligibilityResult.verdict]}
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

      <main className="mx-auto max-w-7xl px-4 py-6 pb-24">
        {/* Live stage tracker */}
        <Card variant="elevated" padding="md" className="mb-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-surface-900">{dict.dashboard.whereStands}</h2>
              <p className="text-xs text-surface-500">
                {stage.blocker
                  ? format(dict.dashboard.heldUpBy, { blocker: stage.blocker })
                  : dict.dashboard.nothingBlocking}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {state.submitted && state.lifecycle !== 'finalized' && (
                <Button variant="secondary" size="sm" onClick={advanceStageNow} title="Demo control: skip ahead to the next milestone now">
                  <FastForward className="h-4 w-4" />
                  Advance stage now
                </Button>
              )}
              <Button size="sm" onClick={downloadPdf} loading={isGeneratingPdf} id="pdf-download-btn">
                <FileDown className="h-4 w-4" />
                {dict.statement.downloadPdf}
              </Button>
              <span className="hidden rounded-full bg-surface-100 px-3 py-1 text-xs font-medium text-surface-600 md:inline">
                {format(dict.dashboard.stepOf, { current: stage.index + 1, total: stages.length })}
              </span>
            </div>
          </div>

          <ol className="flex flex-col gap-3 sm:flex-row sm:items-start">
            {stages.map((label, index) => {
              const isDone = index < stage.index;
              const isCurrent = index === stage.index;
              return (
                <li key={label} className="flex flex-1 items-center gap-3 sm:flex-col sm:items-start">
                  <div className="flex items-center gap-2 sm:w-full">
                    <span
                      className={cn(
                        'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        isDone
                          ? 'bg-success-500 text-white'
                          : isCurrent
                            ? 'bg-primary-600 text-white ring-4 ring-primary-100'
                            : 'bg-surface-200 text-surface-500'
                      )}
                    >
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                    </span>
                    <span className={cn('hidden flex-1 rounded sm:block', isDone ? 'bg-success-200' : 'bg-surface-200', 'h-0.5')} />
                  </div>
                  <div className="min-w-0">
                    <p className={cn('text-xs font-medium', isCurrent ? 'text-primary-700' : 'text-surface-600')}>{label}</p>
                    {isCurrent && <p className="text-[11px] text-surface-400">in progress</p>}
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
          <div className="lg:col-span-3">
            <Card variant="elevated" padding="lg" className="lg:sticky lg:top-24">
              <div className="mb-5 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary-600" />
                <h2 className="text-sm font-semibold text-surface-900">Why you got this verdict</h2>
              </div>

              <div className="mb-4 text-center">
                <Badge variant={verdictColor} size="md" dot className="mb-2">
                  {VERDICT_LABELS[eligibilityResult.verdict]}
                </Badge>
                <div className="text-3xl font-bold text-surface-900">{eligibilityResult.score}%</div>
                <p className="text-xs text-surface-500">weighted eligibility score</p>
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
                    What would change the outcome
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
                      <dt className="text-surface-500">Loan amount</dt>
                      <dd className="font-medium text-surface-900">{formatCurrency(applicant.loanAmount)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-surface-500">Tenure</dt>
                      <dd className="font-medium text-surface-900">{applicant.tenureMonths} months</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-surface-500">Monthly income</dt>
                      <dd className="font-medium text-surface-900">{formatCurrency(applicant.annualIncome / 12)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-surface-500">Existing EMIs</dt>
                      <dd className="font-medium text-surface-900">{formatCurrency(applicant.existingEMIs)}</dd>
                    </div>
                  </>
                )}
                {journeyType === 'insurance' && 'coverageAmount' in applicant && (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-surface-500">Cover</dt>
                      <dd className="font-medium text-surface-900">{formatCurrency(applicant.coverageAmount)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-surface-500">Term</dt>
                      <dd className="font-medium text-surface-900">{applicant.policyTermYears} years</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-surface-500">Annual income</dt>
                      <dd className="font-medium text-surface-900">{formatCurrency(applicant.annualIncome)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-surface-500">Declared conditions</dt>
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
                <h2 className="text-sm font-semibold text-surface-900">Document review</h2>
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
                  {snapshot.verified.length}/{documents.filter(doc => doc.required).length} verified
                </Badge>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-success-50 p-2">
                  <div className="text-xl font-bold text-success-600">{snapshot.verified.length}</div>
                  <div className="text-[11px] text-surface-600">Verified</div>
                </div>
                <div className="rounded-lg bg-warning-50 p-2">
                  <div className="text-xl font-bold text-warning-600">
                    {snapshot.flagged.filter(doc => doc.status === 'warning').length}
                  </div>
                  <div className="text-[11px] text-surface-600">Review</div>
                </div>
                <div className="rounded-lg bg-error-50 p-2">
                  <div className="text-xl font-bold text-error-600">
                    {snapshot.flagged.filter(doc => doc.status === 'fail').length}
                  </div>
                  <div className="text-[11px] text-surface-600">Issues</div>
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
                    Action needed to unblock this application
                  </p>
                  <ul className="mb-3 space-y-1 text-xs text-primary-800">
                    {snapshot.notUploaded.map(doc => (
                      <li key={doc.id} className="flex items-center gap-1.5">
                        <CircleDot className="h-3 w-3 flex-shrink-0" />
                        {doc.name} — not uploaded
                      </li>
                    ))}
                    {snapshot.flagged
                      .filter(doc => doc.status === 'fail')
                      .map(doc => (
                        <li key={doc.id} className="flex items-center gap-1.5">
                          <CircleDot className="h-3 w-3 flex-shrink-0" />
                          {doc.fileName} — must be replaced
                        </li>
                      ))}
                  </ul>
                  <Button size="sm" onClick={goToUploads} className="w-full">
                    <Upload className="h-4 w-4" />
                    Upload the missing documents
                  </Button>
                </div>
              )}
            </Card>
          </div>

          {/* Assistant */}
          <div className="lg:col-span-3 md:order-2 lg:order-4">
            <Card variant="elevated" padding="none" className="flex h-[70vh] min-h-[460px] flex-col lg:sticky lg:top-24 lg:h-[640px]">
              <ChatWindow />
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
