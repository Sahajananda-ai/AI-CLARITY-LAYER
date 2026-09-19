import { useApp } from '../../../contexts/AppContext';
import { LOAN_PURPOSES } from '../../../shared/utils/constants';
import { useI18n } from '../../../shared/i18n';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '../../../shared/utils/cn';

const PURPOSE_EMOJI: Record<string, string> = {
  medical: '🏥',
  wedding: '💍',
  'home renovation': '🏠',
  education: '🎓',
  'debt consolidation': '📊',
  travel: '✈️',
  business: '💼',
  vehicle: '🚗',
};

/**
 * "Why do you need this loan?" — eight purpose cards. Underwriting uses the
 * stated purpose to price the product; storing it also lets the assistant and
 * the PDF statement quote the whole file back to the applicant.
 */
export function PurposePicker() {
  const { state, actions } = useApp();
  const { dict } = useI18n();
  const applicant = state.applicant as { loanPurpose?: string } | null;
  const selected = applicant?.loanPurpose;

  const choose = (purpose: string) => {
    if (state.applicant) {
      actions.setApplicant({ ...state.applicant, loanPurpose: purpose });
    }
  };

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-card">
      <h3 className="text-base font-semibold text-surface-900">{dict.purpose.title}</h3>
      <p className="mb-4 text-sm text-surface-500">{dict.purpose.subtitle}</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {LOAN_PURPOSES.map(purpose => {
          const active = selected === purpose;
          return (
            <button
              key={purpose}
              type="button"
              onClick={() => choose(purpose)}
              aria-pressed={active}
              className={cn(
                'group relative flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-all duration-200',
                active
                  ? 'border-primary-500 bg-primary-50 shadow-md shadow-primary-500/10 ring-1 ring-primary-300'
                  : 'border-surface-200 bg-white hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md'
              )}
            >
              {active && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-white">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </span>
              )}
              <span className="text-2xl transition-transform duration-200 group-hover:scale-110">{PURPOSE_EMOJI[purpose] ?? '💰'}</span>
              <span className={cn('text-xs font-medium leading-tight', active ? 'text-primary-800' : 'text-surface-700')}>
                {dict.purpose[purpose as keyof typeof dict.purpose] as string}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
