import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { evaluateEligibility } from '../features/eligibility';
import { validateDocument, getDocumentRequirements, createSampleFile } from '../features/documents';
import { EligibilityForm } from '../features/eligibility/components/EligibilityForm';
import { EligibilityResultView } from '../features/eligibility/components/EligibilityResult';
import { DocumentList } from '../features/documents/components/DocumentList';
import { Button, Card, Spinner, Badge } from '../shared/components';
import { useAIThinking } from '../shared/hooks';
import { ArrowLeft, CheckCircle2, Sparkles, AlertCircle, WandSparkles, Send } from 'lucide-react';
import type { Applicant } from '../shared/types/common';
import { JOURNEY_CONFIG, ELIGIBILITY_PROCESSING_STEPS } from '../shared/utils/constants';
import { cn } from '../shared/utils/cn';

const STEP_LABELS = { details: 'Your details', eligibility: 'Eligibility', documents: 'Documents' } as const;
const STEPS = ['details', 'eligibility', 'documents'] as const;

export function Wizard() {
  const { state, actions } = useApp();
  const navigate = useNavigate();

  const [isChecking, setIsChecking] = useState(false);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  const { journeyType, applicant, eligibilityResult, uploadedDocuments, wizardStep } = state;
  const thinking = useAIThinking(ELIGIBILITY_PROCESSING_STEPS, isChecking);

  // Deep-linking to /wizard without a journey selected starts over cleanly.
  if (!journeyType) return <Navigate to="/" replace />;

  const config = JOURNEY_CONFIG[journeyType];
  const documents = getDocumentRequirements(journeyType);
  const requiredDocuments = documents.filter(doc => doc.required);
  const currentIndex = STEPS.indexOf(wizardStep);

  const uploadedFor = (id: string) => uploadedDocuments.find(doc => doc.documentId === id);
  const requiredVerified = requiredDocuments.filter(doc => uploadedFor(doc.id)?.status === 'pass').length;
  const blockingFailures = uploadedDocuments.filter(doc => doc.fileName && doc.status === 'fail');
  const warnings = uploadedDocuments.filter(doc => doc.fileName && doc.status === 'warning');
  const allRequiredVerified = requiredVerified === requiredDocuments.length;
  const canSubmit = allRequiredVerified && blockingFailures.length === 0;

  const submitBlockedReason = (() => {
    if (blockingFailures.length > 0) {
      return `${blockingFailures.length} document${blockingFailures.length === 1 ? '' : 's'} must be fixed before we can accept this application.`;
    }
    const missing = requiredDocuments.length - requiredVerified;
    if (missing > 0) return `${missing} required document${missing === 1 ? '' : 's'} still need to pass review.`;
    return '';
  })();

  const runEligibilityCheck = async (applicantData: Applicant) => {
    setIsChecking(true);
    await new Promise(resolve => setTimeout(resolve, 1600 + Math.random() * 900));
    const result = evaluateEligibility(applicantData);
    actions.setApplicant(applicantData);
    actions.setEligibility(result);
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
        await uploadDocument(requirement.id, createSampleFile(requirement, applicant?.fullName ?? '', 'clean'));
      }
    } finally {
      setIsAutoFilling(false);
    }
  };

  const handleSubmit = () => {
    actions.submitApplication();
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-surface-50">
      <header className="sticky top-0 z-10 border-b border-surface-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
              Start over
            </Button>
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-100">
                <Sparkles className="h-4 w-4 text-primary-600" />
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
            {STEPS.map((step, index) => {
              const isComplete = index < currentIndex;
              const isCurrent = index === currentIndex;
              const isReachable = index <= currentIndex || (index === 1 && applicant) || (index === 2 && eligibilityResult);
              return (
                <li key={step} className="flex flex-1 items-center">
                  <button
                    type="button"
                    disabled={!isReachable}
                    onClick={() => isReachable && actions.setWizardStep(step)}
                    className={cn('flex items-center gap-2', isReachable ? 'cursor-pointer' : 'cursor-default')}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all',
                        isComplete || isCurrent ? 'bg-primary-600 text-white' : 'bg-surface-200 text-surface-500',
                        isCurrent && 'ring-4 ring-primary-200'
                      )}
                    >
                      {isComplete ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
                    </span>
                    <span
                      className={cn(
                        'hidden text-sm font-medium sm:block',
                        isComplete || isCurrent ? 'text-surface-900' : 'text-surface-500'
                      )}
                    >
                      {STEP_LABELS[step]}
                    </span>
                  </button>
                  {index < STEPS.length - 1 && (
                    <span className={cn('mx-2 h-1 flex-1 rounded', isComplete ? 'bg-primary-600' : 'bg-surface-200')} />
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
            <Card variant="elevated" padding="lg" className="w-full max-w-md text-center">
              <Spinner size="lg" className="mx-auto mb-4" />
              <p className="font-medium text-surface-900">{thinking.step}</p>
              <p className="mt-1 text-xs text-surface-500">
                Step {thinking.index + 1} of {thinking.total} — a real check would take about as long as this
              </p>
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-200">
                <div
                  className="h-full rounded-full bg-primary-600 transition-all duration-700"
                  style={{ width: `${((thinking.index + 1) / thinking.total) * 100}%` }}
                />
              </div>
            </Card>
          </div>
        )}

        {wizardStep === 'details' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-surface-900">Tell us about yourself</h2>
              <p className="text-surface-600">
                {config.fields.length} fields, about a minute. Every decision is then explained in plain language — no
                jargon, no waiting.
              </p>
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
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-surface-900">Upload your documents</h2>
                <p className="text-surface-600">
                  Each file is reviewed the moment you upload it — you will know within seconds whether it is usable.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void autoFillSamples()}
                disabled={isAutoFilling || Boolean(busyDocumentId) || canSubmit}
                title="Demo helper: fills every pending document with a realistic sample so you can see the review feedback"
              >
                {isAutoFilling ? <Spinner size="sm" /> : <WandSparkles className="h-4 w-4" />}
                {isAutoFilling ? 'Adding samples…' : 'Demo: add all samples'}
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
                  {warnings.length > 0 && ' Reviews marked “review advised” can be submitted, but fixing them is quicker than a rejection.'}
                </p>
              )}
              {canSubmit && (
                <p className="mb-3 flex items-start gap-2 text-sm text-success-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  Everything required is verified. Your application is ready to submit.
                </p>
              )}
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => actions.setWizardStep('eligibility')}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button onClick={handleSubmit} disabled={!canSubmit} className="flex-1">
                  <Send className="h-4 w-4" />
                  Submit application
                </Button>
              </div>
            </div>
          </div>
        )}

        {wizardStep === 'documents' && (
          <div className="mt-6 text-center">
            <Badge variant="neutral" size="sm">
              {uploadedDocuments.filter(doc => doc.fileName).length} of {documents.length} document slots filled
            </Badge>
          </div>
        )}
      </main>
    </div>
  );
}
