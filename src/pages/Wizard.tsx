import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { evaluateEligibility } from '../features/eligibility';
import { validateDocument, getDocumentRequirements } from '../features/documents';
import { dispatchNotification } from '../features/notifications/engine';
import { EligibilityForm } from '../features/eligibility/components/EligibilityForm';
import { EligibilityResultView } from '../features/eligibility/components/EligibilityResult';
import { DocumentList } from '../features/documents/components/DocumentList';
import { PurposePicker } from '../features/eligibility/components/PurposePicker';
import { BankDetailsForm } from '../features/eligibility/components/BankDetailsForm';
import { Button, Card, Spinner, Badge } from '../shared/components';
import { SlideCommit } from '../shared/components/motion';
import { useI18n } from '../shared/i18n';
import { useAIThinking } from '../shared/hooks';
import { ArrowLeft, CheckCircle2, Sparkles, AlertCircle, WandSparkles, Send, Building2, Target } from 'lucide-react';
import type { Applicant } from '../shared/types/common';
import { JOURNEY_CONFIG, ELIGIBILITY_PROCESSING_STEPS } from '../shared/utils/constants';
import { cn } from '../shared/utils/cn';

const STEPS = ['details', 'eligibility', 'documents', 'bank'] as const;

export function Wizard() {
  const { state, actions } = useApp();
  const { dict, format, language } = useI18n();
  const navigate = useNavigate();

  const [isChecking, setIsChecking] = useState(false);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  const { journeyType, applicant, eligibilityResult, uploadedDocuments, wizardStep, phone, bankDetails, bankVerified } =
    state;
  const thinking = useAIThinking(ELIGIBILITY_PROCESSING_STEPS, isChecking);

  // Deep-linking to /wizard without a journey selected starts over cleanly.
  if (!journeyType) return <Navigate to="/" replace />;

  const config = JOURNEY_CONFIG[journeyType];
  const documents = getDocumentRequirements(journeyType);
  const requiredDocuments = documents.filter(doc => doc.required);
  const currentIndex = STEPS.indexOf(wizardStep);
  // Insurance skips the loan-purpose and bank steps visually? No — bank applies
  // to both (premium mandate), purpose is loan-only but stays as a sub-part of details.
  const visibleSteps: typeof STEPS = journeyType === 'loan' ? STEPS : (['details', 'eligibility', 'documents', 'bank'] as const);

  const uploadedFor = (id: string) => uploadedDocuments.find(doc => doc.documentId === id);
  const requiredVerified = requiredDocuments.filter(doc => uploadedFor(doc.id)?.status === 'pass').length;
  const blockingFailures = uploadedDocuments.filter(doc => doc.fileName && doc.status === 'fail');
  const warnings = uploadedDocuments.filter(doc => doc.fileName && doc.status === 'warning');
  const allRequiredVerified = requiredVerified === requiredDocuments.length;
  const canSubmit = allRequiredVerified && blockingFailures.length === 0 && bankVerified;

  const submitBlockedReason = (() => {
    if (blockingFailures.length > 0) {
      return format(dict.wizard.mustFixMsg, { count: blockingFailures.length });
    }
    const missing = requiredDocuments.length - requiredVerified;
    if (missing > 0) return format(dict.wizard.missingDocsMsg, { count: missing });
    if (!bankVerified) return dict.bank.subtitle;
    return '';
  })();

  const runEligibilityCheck = async (applicantData: Applicant) => {
    setIsChecking(true);
    await new Promise(resolve => setTimeout(resolve, 1600 + Math.random() * 900));
    const result = evaluateEligibility(applicantData);
    actions.setApplicant(applicantData);
    actions.setEligibility(result);
    // Milestone: eligibility outcome lands on the phone as well as the screen.
    if (phone) {
      actions.addNotification(
        dispatchNotification('eligibility_passed', {
          journeyType,
          applicant: applicantData,
          reference: `PRE-${Date.now().toString(36).toUpperCase()}`,
          language,
          dict,
          phone,
          eligibilityScore: result.score,
        })
      );
    }
    setIsChecking(false);
  };

  const uploadDocument = async (docId: string, file: File) => {
    const requirement = documents.find(doc => doc.id === docId);
    if (!requirement) return;

    setBusyDocumentId(docId);
    try {
      const result = await validateDocument(file, requirement, applicant?.fullName ?? '', journeyType);
      actions.updateDocument(`upload-${docId}`, {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        uploadedAt: new Date(),
        status: result.status,
        feedback: result.feedback,
        fixAction: result.fixAction,
        summary: result.summary,
        confidence: result.confidence,
        checks: result.checks,
        signals: result.signals,
      });
      // Milestone: a document problem pings the phone immediately, so the
      // "documents submitted / problem found" SMS beat is never silent.
      if (result.status === 'fail' && phone && applicant) {
        const failedCount = uploadedDocuments.filter(doc => doc.fileName && doc.status === 'fail').length + 1;
        actions.addNotification(
          dispatchNotification('document_issue', {
            journeyType,
            applicant,
            reference: `PRE-${Date.now().toString(36).toUpperCase()}`,
            language,
            dict,
            phone,
            documentCount: failedCount,
          })
        );
      }
    } finally {
      setBusyDocumentId(null);
    }
  };

  /**
   * Demo helper: fills every unfilled required document with a realistic sample
   * file, one at a time, so the review feedback is visible without the judge
   * needing a PAN card PDF on their laptop.
   */
  const autoFillSamples = async () => {
    setIsAutoFilling(true);
    try {
      for (const requirement of requiredDocuments) {
        const existing = uploadedFor(requirement.id);
        if (existing?.status === 'pass') continue;
        await uploadDocument(requirement.id, createSampleFileSafe(requirement, applicant?.fullName ?? ''));
      }
    } finally {
      setIsAutoFilling(false);
    }
  };

  const handleSubmit = () => {
    actions.submitApplication();
    // The first milestone message goes out the moment the application is
    // accepted (an event handler, not the reducer: dispatching performs
    // side effects — timestamps and the optional n8n POST).
    if (journeyType && applicant && phone) {
      actions.addNotification(
        dispatchNotification('application_received', {
          journeyType,
          applicant,
          reference: buildRef(journeyType, applicant),
          language,
          dict,
          phone,
        })
      );
    }
    navigate('/dashboard');
    // The lifecycle clock starts ticking with the first milestone, so the
    // tracker advances from step 1 automatically (verified → review → decision).
    actions.advanceLifecycle('received');
  };

  const stepMeta: { key: (typeof STEPS)[number]; label: string; icon: typeof Target }[] = [
    { key: 'details', label: dict.wizard.stepDetails, icon: Target },
    { key: 'eligibility', label: dict.wizard.stepEligibility, icon: Sparkles },
    { key: 'documents', label: dict.wizard.stepDocuments, icon: CheckCircle2 },
    { key: 'bank', label: dict.bank.stepTitle, icon: Building2 },
  ];

  return (
    <div className="min-h-screen bg-surface-50">
      <header className="sticky top-0 z-10 border-b border-surface-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
              {dict.wizard.startOver}
            </Button>
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-surface-900">{config.title}</p>
                {applicant?.fullName && <p className="truncate text-xs text-surface-500">{applicant.fullName}</p>}
              </div>
            </div>
            {/* Balances the header on wider screens without squeezing the title on phones. */}
            <div className="hidden w-20 sm:block" />
          </div>

          <ol className="flex items-center">
            {visibleSteps.map((step, index) => {
              const isComplete = index < currentIndex;
              const isCurrent = index === currentIndex;
              const isReachable =
                index <= currentIndex ||
                (step === 'eligibility' && Boolean(applicant)) ||
                (step === 'documents' && Boolean(eligibilityResult)) ||
                (step === 'bank' && allRequiredVerified);
              const meta = stepMeta.find(s => s.key === step)!;
              return (
                <li key={step} className="flex flex-1 items-center">
                  <button
                    type="button"
                    disabled={!isReachable}
                    onClick={() => isReachable && actions.setWizardStep(step)}
                    className={cn('step-btn flex items-center gap-2', isReachable ? 'cursor-pointer' : 'cursor-default')}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all',
                        isComplete || isCurrent
                          ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-md shadow-primary-500/25'
                          : 'bg-surface-200 text-surface-500',
                        isCurrent && 'animate-pulse-ring ring-4 ring-primary-100'
                      )}
                    >
                      {isComplete ? <CheckCircle2 className="h-5 w-5" /> : <meta.icon className="h-4 w-4" />}
                    </span>
                    <span
                      className={cn(
                        'hidden text-sm font-medium sm:block',
                        isComplete || isCurrent ? 'text-surface-900' : 'text-surface-500'
                      )}
                    >
                      {meta.label}
                    </span>
                  </button>
                  {index < visibleSteps.length - 1 && (
                    <span className={cn('mx-2 h-1 flex-1 rounded transition-colors', isComplete ? 'bg-primary-500' : 'bg-surface-200')} />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 pb-24">
        {isChecking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/30 backdrop-blur-sm">
            <Card variant="elevated" padding="lg" className="animate-pop-in w-full max-w-md text-center">
              <Spinner size="lg" className="mx-auto mb-4" />
              <p className="font-medium text-surface-900">{thinking.step}</p>
              <p className="mt-1 text-xs text-surface-500">
                {language === 'hi'
                  ? `चरण ${thinking.index + 1}/${thinking.total} — असली जाँच को भी इतना ही समय लगता है`
                  : language === 'kn'
                    ? `ಹಂತ ${thinking.index + 1}/${thinking.total} — ನಿಜವಾದ ಪರಿಶೀಲನೆಗೂ ಇಷ್ಟೇ ಸಮಯ`
                    : `Step ${thinking.index + 1} of ${thinking.total} — a real check would take about as long as this`}
              </p>
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-700 transition-all duration-700"
                  style={{ width: `${((thinking.index + 1) / thinking.total) * 100}%` }}
                />
              </div>
            </Card>
          </div>
        )}

        {wizardStep === 'details' && (
          <div className="animate-rise-in space-y-6">
            {journeyType === 'loan' && <PurposePicker />}

            <div>
              <h2 className="text-2xl font-bold text-surface-900">{dict.wizard.detailsTitle}</h2>
              <p className="text-surface-600">{format(dict.wizard.detailsSubtitle, { count: config.fields.length })}</p>
            </div>
            <EligibilityForm
              journeyType={journeyType}
              onSubmit={applicantData => void runEligibilityCheck(applicantData)}
              initialData={(applicant ?? undefined) as Record<string, unknown> | undefined}
            />
          </div>
        )}

        {wizardStep === 'eligibility' && eligibilityResult && (
          <EligibilityResultView result={eligibilityResult} onContinue={() => actions.setWizardStep('documents')} />
        )}

        {wizardStep === 'documents' && (
          <div className="animate-rise-in space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-surface-900">{dict.wizard.docsTitle}</h2>
                <p className="text-surface-600">{dict.wizard.docsSubtitle}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void autoFillSamples()}
                disabled={isAutoFilling || Boolean(busyDocumentId) || canSubmit}
                title="Demo helper: fills every pending document with a realistic sample so you can see the review feedback"
              >
                {isAutoFilling ? <Spinner size="sm" /> : <WandSparkles className="h-4 w-4" />}
                {isAutoFilling ? dict.wizard.addingSamples : dict.wizard.demoAddSamples}
              </Button>
            </div>

            <DocumentList
              documents={documents}
              uploadedDocs={uploadedDocuments}
              applicantName={applicant?.fullName ?? ''}
              onUpload={uploadDocument}
              onRemove={actions.removeDocument}
              busyDocumentId={busyDocumentId}
            />

            <div className="sticky bottom-0 -mx-4 border-t border-surface-200 bg-white/95 px-4 py-4 backdrop-blur">
              {!canSubmit && submitBlockedReason && (
                <p className="mb-3 flex items-start gap-2 text-sm text-warning-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  {submitBlockedReason}
                  {warnings.length > 0 && dict.wizard.warningsNote}
                </p>
              )}
              {allRequiredVerified && blockingFailures.length === 0 && (
                <p className="mb-3 flex items-start gap-2 text-sm text-success-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  {bankVerified ? dict.wizard.allVerifiedMsg : dict.bank.subtitle}
                </p>
              )}
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => actions.setWizardStep('eligibility')}>
                  <ArrowLeft className="h-4 w-4" />
                  {dict.back}
                </Button>
                <Button onClick={() => actions.setWizardStep('bank')} disabled={!allRequiredVerified || blockingFailures.length > 0} className="flex-1">
                  {dict.bank.stepTitle}
                  <Building2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {wizardStep === 'bank' && (
          <div className="animate-rise-in space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-surface-900">{dict.bank.title}</h2>
              <p className="text-surface-600">{dict.bank.subtitle}</p>
            </div>

            <BankDetailsForm
              initial={bankDetails}
              applicantName={applicant?.fullName ?? ''}
              onVerified={details => {
                actions.setBankDetails(details);
                actions.setBankVerified(true);
              }}
            />

            <div className="sticky bottom-0 -mx-4 border-t border-surface-200 bg-white/95 px-4 py-4 backdrop-blur">
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => actions.setWizardStep('documents')}>
                  <ArrowLeft className="h-4 w-4" />
                  {dict.back}
                </Button>
              </div>
            </div>
          </div>
        )}

        {wizardStep === 'bank' && bankVerified && (
          <Card variant="elevated" padding="lg" className="animate-rise-in mt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <Badge variant="success" size="md" dot>
                {dict.bank.verifiedTitle}
              </Badge>
              <p className="max-w-md text-sm text-surface-600">{dict.bank.verifiedBody}</p>
              <div className="w-full pt-2">
                <SlideCommit
                  label={dict.wizard.submitApplication}
                  doneLabel={language === 'hi' ? 'जमा हो गया ✓' : language === 'kn' ? 'ಸಲ್ಲಿಸಲಾಗಿದೆ ✓' : 'Submitted ✓'}
                  errorLabel={language === 'hi' ? 'फिर कोशिश करें' : language === 'kn' ? 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ' : 'Try again'}
                  trackColor="#0b5cd6"
                  handleColor="#ffffff"
                  successColor="#16a34a"
                  dangerColor="#dc2626"
                  onConfirm={() => {
                    handleSubmit();
                  }}
                />
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-surface-400">
                  <Send className="h-3 w-3" />
                  {language === 'hi'
                    ? 'स्लाइड करके जमा करें — गलती से दबने से बचाव, और यह कदम गिनती में है'
                    : language === 'kn'
                      ? 'ಸ್ಲೈಡ್ ಮಾಡಿ ಸಲ್ಲಿಸಿ — ಅನೈಚ್ಛಿಕ ಒತ್ತುವಿಕೆ ತಪ್ಪಿಸಿ, ಈ ಹಂತ ಎಣಿಕೆಯಲ್ಲಿ'
                      : 'Slide to submit — no accidental taps, and the moment counts'}
                </p>
              </div>
            </div>
          </Card>
        )}

        {wizardStep === 'documents' && (
          <div className="mt-6 text-center">
            <Badge variant="neutral" size="sm">
              {format(dict.wizard.slotsFilled, {
                filled: uploadedDocuments.filter(doc => doc.fileName).length,
                total: documents.length,
              })}
            </Badge>
          </div>
        )}
      </main>
    </div>
  );
}

/** Local import shim so the top-of-file imports stay tidy. */
import { createSampleFile } from '../features/documents/validator';
function createSampleFileSafe(requirement: Parameters<typeof createSampleFile>[0], name: string) {
  return createSampleFile(requirement, name, 'clean');
}

/** Same reference scheme the dashboard uses. */
function buildRef(journeyType: 'loan' | 'insurance', applicant: Applicant): string {
  const prefix = journeyType === 'loan' ? 'PL' : 'TI';
  const seed = `${applicant.fullName}|${applicant.age}|${applicant.annualIncome}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000000;
  }
  return `${prefix}-${String(hash).padStart(8, '0').slice(0, 8)}`;
}
