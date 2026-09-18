import { useI18n, LANGUAGE_CODES, type LanguageCode } from '../i18n';
import { Languages } from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * Three-way language switcher shown in every page header. It deliberately
 * displays each language in its own script (English / हिंदी / ಕನ್ನಡ) so the
 * judge can find their language even before switching.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage, dict } = useI18n();

  return (
    <div
      className={cn('inline-flex items-center gap-0.5 rounded-lg border border-surface-200 bg-white p-0.5', className)}
      role="group"
      aria-label="Select language"
    >
      <Languages className="ml-1.5 h-3.5 w-3.5 flex-shrink-0 text-surface-400" />
      {LANGUAGE_CODES.map(code => (
        <button
          key={code}
          type="button"
          onClick={() => setLanguage(code as LanguageCode)}
          aria-pressed={language === code}
          className={cn(
            'rounded-md px-2 py-1 text-xs font-semibold transition-colors',
            language === code ? 'bg-primary-600 text-white' : 'text-surface-600 hover:bg-surface-100'
          )}
        >
          {dict.language[code]}
        </button>
      ))}
    </div>
  );
}
