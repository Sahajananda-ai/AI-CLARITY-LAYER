import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { Badge, Button, Card, RichText, LanguageToggle } from '../shared/components';
import { useI18n } from '../shared/i18n';
import {
  CreditCard,
  Shield,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  ScanText,
  ArrowLeft,
  BellRing,
} from 'lucide-react';
import { JOURNEY_CONFIG, LOAN_PERSONAS, INSURANCE_PERSONAS } from '../shared/utils/constants';
import { cn } from '../shared/utils/cn';

export function Landing() {
  const { state, actions } = useApp();
  const { dict, format } = useI18n();
  const navigate = useNavigate();
  const journeysRef = useRef<HTMLDivElement>(null);

  // Capability cards live inside the component so they re-render with the
  // active language.
  const capabilities = [
    {
      icon: CheckCircle2,
      title: dict.landing.cap1Title,
      desc: dict.landing.cap1Desc,
      accent: 'bg-success-100 text-success-600',
    },
    {
      icon: ScanText,
      title: dict.landing.cap2Title,
      desc: dict.landing.cap2Desc,
      accent: 'bg-primary-100 text-primary-600',
    },
    {
      icon: BellRing,
      title: dict.landing.cap3Title,
      desc: dict.landing.cap3Desc,
      accent: 'bg-warning-100 text-warning-600',
    },
  ];

  const startJourney = (type: 'loan' | 'insurance') => {
    actions.setJourney(type);
    navigate('/wizard');
  };

  const resumePath = state.submitted ? '/dashboard' : '/wizard';
  const canResume = Boolean(state.journeyType);
  const resumeLabel = state.journeyType
    ? `${JOURNEY_CONFIG[state.journeyType].title}${state.applicant ? ` • ${state.applicant.fullName}` : ''}`
    : '';

  return (
    <div className="min-h-screen bg-surface-50">
      <header className="sticky top-0 z-10 border-b border-surface-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-surface-900">{dict.appName}</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-surface-600 md:flex">
            <button type="button" className="transition-colors hover:text-primary-600" onClick={() => startJourney('loan')}>
              {dict.landing.loanJourney}
            </button>
            <button type="button" className="transition-colors hover:text-primary-600" onClick={() => startJourney('insurance')}>
              {dict.landing.insuranceJourney}
            </button>
            <button
              type="button"
              className="transition-colors hover:text-primary-600"
              onClick={() => journeysRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              {dict.landing.compare}
            </button>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            {canResume && (
              <Button variant="secondary" size="sm" onClick={() => navigate(resumePath)}>
                <ArrowLeft className="h-4 w-4" />
                {dict.resume}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        {canResume && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-600 text-white">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary-900">{dict.landing.inProgress}</p>
                <p className="text-xs text-primary-700">{resumeLabel}</p>
              </div>
            </div>
            <Button size="sm" onClick={() => navigate(resumePath)}>
              {state.submitted ? dict.landing.openTracker : dict.landing.continueApplication}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="mx-auto mb-14 max-w-3xl text-center">
          <Badge variant="info" size="md" className="mb-5" dot>
            {dict.landing.badge}
          </Badge>
          <h1 className="mb-5 text-4xl font-bold leading-tight text-surface-900 sm:text-5xl lg:text-6xl">
            {dict.landing.heroTitle} <span className="text-primary-600">{dict.landing.heroHighlight}</span>
            {dict.landing.heroTitleTail}
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-surface-600">{dict.landing.heroSubtitle}</p>
          <Button
            size="lg"
            onClick={() => journeysRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="w-full sm:w-auto"
          >
            {dict.landing.chooseJourney}
            <ArrowRight className="h-5 w-5" />
          </Button>
          <p className="mt-3 text-xs text-surface-500">{dict.landing.runsInBrowser}</p>
        </div>

        <div className="mb-16 grid grid-cols-1 gap-6 md:grid-cols-3">
          {capabilities.map(capability => (
            <Card key={capability.title} variant="elevated" padding="lg" className="h-full">
              <div className={cn('mb-4 flex h-12 w-12 items-center justify-center rounded-xl', capability.accent)}>
                <capability.icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-surface-900">{capability.title}</h3>
              <p className="text-sm leading-relaxed text-surface-600">{capability.desc}</p>
            </Card>
          ))}
        </div>

        <div ref={journeysRef} className="mx-auto max-w-4xl scroll-mt-20">
          <h2 className="mb-2 text-center text-2xl font-bold text-surface-900">{dict.landing.chooseTitle}</h2>
          <p className="mb-8 text-center text-sm text-surface-600">{dict.landing.chooseSubtitle}</p>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {(['loan', 'insurance'] as const).map(type => {
              const config = JOURNEY_CONFIG[type];
              const Icon = type === 'loan' ? CreditCard : Shield;
              const persona = type === 'loan' ? LOAN_PERSONAS[0] : INSURANCE_PERSONAS[0];
              return (
                <Card key={type} variant="elevated" padding="lg" className="flex flex-col">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100">
                      <Icon className="h-6 w-6 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-surface-900">{config.title}</h3>
                      <p className="text-sm text-surface-600">{config.subtitle}</p>
                    </div>
                  </div>

                  <ul className="mb-5 space-y-2 text-sm">
                    {[
                      format(dict.landing.detailsVerdict, { count: config.fields.length }),
                      dict.landing.docsReviewed,
                      dict.landing.assistantAnswers,
                    ].map(item => (
                      <li key={item} className="flex items-start gap-2 text-surface-600">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success-600" />
                        {item}
                      </li>
                    ))}
                  </ul>

                  <div className="mb-5 rounded-lg bg-surface-50 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-surface-500">{dict.landing.tryProfile}</p>
                    <p className="text-sm text-surface-700">
                      {persona.name} — {persona.description}
                    </p>
                  </div>

                  <Button onClick={() => startJourney(type)} className="mt-auto w-full">
                    {type === 'loan' ? dict.landing.startLoan : dict.landing.startInsurance}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Card>
              );
            })}
          </div>

          <Card variant="outlined" padding="lg" className="mt-8">
            <RichText className="text-surface-600" text={dict.landing.howAiWorks} />
          </Card>
        </div>
      </main>

      <footer className="mt-16 border-t border-surface-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 text-center text-sm text-surface-500">{dict.landing.footer}</div>
      </footer>
    </div>
  );
}
