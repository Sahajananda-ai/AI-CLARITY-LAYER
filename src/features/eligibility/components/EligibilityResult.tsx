import { useState } from 'react';
import type { EligibilityResult, Criteria } from '../../../shared/types/common';
import { VERDICT_LABELS, VERDICT_COLORS } from '../../../shared/utils/constants';
import { Card, Badge, Button, RichText } from '../../../shared/components';
import { ChevronDown, CheckCircle2, XCircle, AlertCircle, Info, ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '../../../shared/utils/cn';

interface CriteriaCardProps {
  criterion: Criteria;
}

function CriteriaCard({ criterion }: CriteriaCardProps) {
  const [expanded, setExpanded] = useState(!criterion.passed);

  return (
    <div className="overflow-hidden rounded-lg border border-surface-200">
      <button
        type="button"
        onClick={() => setExpanded(current => !current)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-surface-50"
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full',
              criterion.passed ? 'bg-success-100 text-success-600' : 'bg-error-100 text-error-600'
            )}
          >
            {criterion.passed ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-surface-900">
              {criterion.label}
              {criterion.actionable === false && (
                <span className="ml-2 rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-surface-500">
                  fixed rule
                </span>
              )}
            </p>
            {criterion.comparison && <p className="mt-0.5 text-xs text-surface-500">{criterion.comparison}</p>}
          </div>
        </div>
        <span
          className={cn(
            'flex flex-shrink-0 items-center gap-1 text-xs font-semibold',
            criterion.passed ? 'text-success-600' : 'text-error-600'
          )}
        >
          {criterion.passed ? 'Passed' : 'Short'}
          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
        </span>
      </button>

      {expanded && (
        <div className="border-t border-surface-100 bg-surface-50 px-4 py-3">
          <p className="text-sm leading-relaxed text-surface-700">{criterion.reason}</p>
          {criterion.suggestion && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-primary-50 p-3 text-sm text-primary-800">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-600" />
              <span>{criterion.suggestion}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Visual of the score band plus the two thresholds that decide the verdict. */
function ScoreMeter({ result }: { result: EligibilityResult }) {
  const barColor =
    result.verdict === 'eligible' ? 'bg-success-500' : result.verdict === 'conditional' ? 'bg-warning-500' : 'bg-error-500';

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-200">
        <div className={cn('h-full rounded-full transition-all duration-700', barColor)} style={{ width: `${result.score}%` }} />
      </div>
      {/* Threshold markers, positioned by value so they never drift from the bar. */}
      <div className="relative mt-1.5 h-4 text-[10px] font-medium uppercase tracking-wide">
        <span className="absolute left-0 text-surface-400">0</span>
        <span className="absolute left-1/2 -translate-x-1/2 text-surface-500">Conditional 50</span>
        <span className="absolute left-[78%] -translate-x-1/2 text-surface-500">Eligible 78</span>
        <span className="absolute right-0 text-surface-400">100</span>
      </div>
    </div>
  );
}

export function EligibilityResultView({ result, onContinue }: { result: EligibilityResult; onContinue: () => void }) {
  const verdictColor = VERDICT_COLORS[result.verdict] as 'success' | 'warning' | 'error';
  const failed = result.criteria.filter(criterion => !criterion.passed);
  const passed = result.criteria.filter(criterion => criterion.passed);

  return (
    <div className="space-y-6">
      <Card variant="elevated" padding="lg">
        <div className="mb-6 text-center">
          <Badge variant={verdictColor} size="md" dot className="mb-3">
            {VERDICT_LABELS[result.verdict]}
          </Badge>
          <div className="mb-1 text-4xl font-bold text-surface-900">{result.score}%</div>
          <p className="mb-5 text-xs font-medium uppercase tracking-wide text-surface-500">Weighted eligibility score</p>
          <ScoreMeter result={result} />
        </div>

        <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary-600" />
            <h3 className="text-sm font-semibold text-surface-900">Why you got this verdict</h3>
          </div>
          <p className="text-sm leading-relaxed text-surface-700">{result.summary}</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-lg bg-success-50 p-3">
            <div className="text-2xl font-bold text-success-600">{passed.length}</div>
            <div className="text-xs text-surface-600">Criteria you clear</div>
          </div>
          <div className="rounded-lg bg-error-50 p-3">
            <div className="text-2xl font-bold text-error-600">{failed.length}</div>
            <div className="text-xs text-surface-600">Criteria falling short</div>
          </div>
        </div>
      </Card>

      <Card variant="default" padding="lg">
        <h3 className="mb-1 text-lg font-semibold text-surface-900">Criterion by criterion</h3>
        <p className="mb-4 text-sm text-surface-500">Tap any row to see the actual comparison and what would change it.</p>
        <div className="space-y-3">
          {result.criteria.map(criterion => (
            <CriteriaCard key={criterion.id} criterion={criterion} />
          ))}
        </div>
      </Card>

      {result.notes && result.notes.length > 0 && (
        <Card variant="outlined" padding="lg">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-surface-900">
            <Info className="h-4 w-4 text-surface-500" />
            How we reached {result.score}%
          </h4>
          <ul className="space-y-2">
            {result.notes.map((note, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-surface-600">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-surface-400" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {result.suggestions.length > 0 && (
        <Card variant="default" padding="lg" className="border-warning-200 bg-warning-50">
          <h4 className="mb-3 flex items-center gap-2 font-semibold text-warning-800">
            <AlertCircle className="h-5 w-5" />
            What would change this outcome
          </h4>
          <div className="space-y-2">
            {result.suggestions.map((suggestion, index) => (
              <div key={index} className="flex items-start gap-2 text-sm text-warning-800">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warning-500" />
                <span>{suggestion}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {result.verdict !== 'eligible' && (
        <Card variant="default" padding="md" className="bg-white">
          <RichText
            className="text-surface-600"
            text="**You can still apply.** Plenty of applications are approved after a short-term fix, and nothing here affects your credit score. Applying now keeps your file moving while you work on the gaps."
          />
        </Card>
      )}

      <Button onClick={onContinue} size="lg" className="w-full">
        Continue to documents
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}
