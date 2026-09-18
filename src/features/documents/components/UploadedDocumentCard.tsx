import { useState, type ReactNode } from 'react';
import type { Document, DocumentCheck, UploadedDocument } from '../../../shared/types/common';
import { Badge, Button, RichText } from '../../../shared/components';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  RefreshCw,
  ScanLine,
  Trash2,
  WandSparkles,
  FlaskConical,
} from 'lucide-react';
import { cn } from '../../../shared/utils/cn';
import { formatDateTime } from '../../../shared/utils/formatters';
import { createSampleFile, type SampleVariant } from '../validator';

export interface UploadedDocumentCardProps {
  document: Document;
  uploaded: UploadedDocument;
  applicantName: string;
  /** Enables the sample-file and remove actions. */
  onUpload?: (file: File) => void | Promise<void>;
  onRemove?: () => void;
  /** True while this specific document is being reviewed. */
  busy?: boolean;
  /** Hides the demo helpers (used on the read-only dashboard panel). */
  hideSampleActions?: boolean;
}

const STATUS_META: Record<
  UploadedDocument['status'],
  { badge: 'success' | 'error' | 'warning' | 'neutral'; label: string; tile: string; icon: ReactNode }
> = {
  pass: {
    badge: 'success',
    label: 'Verified',
    tile: 'bg-success-100 text-success-600',
    icon: <CheckCircle2 className="h-5 w-5" />,
  },
  fail: {
    badge: 'error',
    label: 'Needs fixing',
    tile: 'bg-error-100 text-error-600',
    icon: <XCircle className="h-5 w-5" />,
  },
  warning: {
    badge: 'warning',
    label: 'Review advised',
    tile: 'bg-warning-100 text-warning-600',
    icon: <AlertCircle className="h-5 w-5" />,
  },
  pending: {
    badge: 'neutral',
    label: 'Awaiting review',
    tile: 'bg-surface-100 text-surface-500',
    icon: <FileText className="h-5 w-5" />,
  },
};

function CheckRow({ check }: { check: DocumentCheck }) {
  const tone =
    check.status === 'pass'
      ? 'text-success-600'
      : check.status === 'warning'
        ? 'text-warning-600'
        : 'text-error-600';

  return (
    <li className="flex items-start gap-2">
      <span className={`mt-0.5 flex-shrink-0 ${tone}`}>
        {check.status === 'pass' ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : check.status === 'warning' ? (
          <AlertCircle className="h-4 w-4" />
        ) : (
          <XCircle className="h-4 w-4" />
        )}
      </span>
      <span className="min-w-0">
        <span className="text-xs font-semibold text-surface-700">{check.label}</span>
        <span className="block text-xs leading-relaxed text-surface-600">{check.detail}</span>
      </span>
    </li>
  );
}

export function UploadedDocumentCard({
  document,
  uploaded,
  applicantName,
  onUpload,
  onRemove,
  busy,
  hideSampleActions,
}: UploadedDocumentCardProps) {
  const meta = STATUS_META[uploaded.status];
  const [showChecks, setShowChecks] = useState(uploaded.status !== 'pass');
  const hasIssue = uploaded.status === 'fail' || uploaded.status === 'warning';
  const showSamples = !hideSampleActions && Boolean(onUpload) && !busy;

  const trySample = (variant: SampleVariant) => {
    if (!onUpload) return;
    void onUpload(createSampleFile(document, applicantName, variant));
  };

  return (
    <div
      className={cn(
        'rounded-xl border bg-white transition-shadow',
        uploaded.status === 'fail'
          ? 'border-error-200'
          : uploaded.status === 'warning'
            ? 'border-warning-200'
            : uploaded.status === 'pass'
              ? 'border-success-200'
              : 'border-surface-200'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn('flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg', meta.tile)}>
            {busy ? <RefreshCw className="h-5 w-5 animate-spin" /> : meta.icon}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-surface-900">{uploaded.fileName}</p>
            <p className="text-xs text-surface-500">
              {document.name} • {(uploaded.fileSize / 1024).toFixed(0)} KB • {formatDateTime(uploaded.uploadedAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <Badge variant={meta.badge} size="sm" dot>
            {busy ? 'Reviewing…' : meta.label}
          </Badge>
          {onRemove && !busy && (
            <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove ${document.name}`} className="px-2">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {busy ? (
        <div className="border-t border-surface-100 px-4 py-3">
          <p className="text-xs text-surface-500">
            <span className="font-medium text-surface-700">Reviewing this document…</span> reading text, matching your
            name, checking dates.
          </p>
        </div>
      ) : (
        <>
          {/* Verdict */}
          {uploaded.summary && (
            <div
              className={cn(
                'mx-4 mb-3 rounded-lg border p-3',
                uploaded.status === 'pass'
                  ? 'border-success-200 bg-success-50'
                  : uploaded.status === 'warning'
                    ? 'border-warning-200 bg-warning-50'
                    : 'border-error-200 bg-error-50'
              )}
            >
              <p
                className={cn(
                  'text-sm font-medium',
                  uploaded.status === 'pass'
                    ? 'text-success-800'
                    : uploaded.status === 'warning'
                      ? 'text-warning-800'
                      : 'text-error-800'
                )}
              >
                {uploaded.summary}
              </p>
              {hasIssue && uploaded.feedback && (
                <div className="mt-2">
                  <RichText text={uploaded.feedback} className="text-surface-700" />
                </div>
              )}
              {hasIssue && uploaded.fixAction && (
                <div className="mt-2 rounded-md border border-primary-200 bg-white p-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Your next step</p>
                  <p className="text-sm text-surface-700">{uploaded.fixAction}</p>
                </div>
              )}
            </div>
          )}

          {/* Reviewer detail */}
          <div className="flex flex-wrap items-center gap-2 px-4">
            {typeof uploaded.confidence === 'number' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-100 px-2.5 py-1 text-xs font-medium text-surface-600">
                <ScanLine className="h-3.5 w-3.5" />
                Text confidence {uploaded.confidence}%
              </span>
            )}
            {uploaded.checks && uploaded.checks.length > 0 && (
              <button
                type="button"
                onClick={() => setShowChecks(current => !current)}
                className="rounded-full bg-surface-100 px-2.5 py-1 text-xs font-medium text-surface-700 transition-colors hover:bg-surface-200"
              >
                {showChecks ? 'Hide' : 'Show'} the {uploaded.checks.length} checks we ran
              </button>
            )}
          </div>

          {showChecks && uploaded.checks && uploaded.checks.length > 0 && (
            <div className="mt-3 border-t border-surface-100 bg-surface-50 px-4 py-3">
              <ul className="space-y-2.5">
                {uploaded.checks.map(check => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </ul>
              {uploaded.signals && uploaded.signals.length > 0 && (
                <div className="mt-3 border-t border-surface-200 pt-3">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-surface-500">
                    Signals detected in this file
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {uploaded.signals.map(signal => (
                      <span
                        key={signal}
                        className="rounded-full border border-warning-200 bg-warning-50 px-2 py-0.5 text-[11px] text-warning-800"
                      >
                        {signal}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {showSamples && (
            <div className="flex flex-wrap items-center gap-2 border-t border-surface-100 px-4 py-3">
              <span className="text-xs text-surface-500">Demo:</span>
              <Button variant="ghost" size="sm" onClick={() => trySample('clean')} className="text-xs">
                <WandSparkles className="h-3.5 w-3.5" />
                Swap for a clean copy
              </Button>
              <Button variant="ghost" size="sm" onClick={() => trySample('flawed')} className="text-xs">
                <FlaskConical className="h-3.5 w-3.5" />
                Show me a problem
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
