import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { Badge, Button, Card, RichText } from '../shared/components';
import {
  CreditCard,
  Shield,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  ScanText,
  MessageSquare,
  ArrowLeft,
} from 'lucide-react';
import { JOURNEY_CONFIG, LOAN_PERSONAS, INSURANCE_PERSONAS } from '../shared/utils/constants';
import { cn } from '../shared/utils/cn';

const CAPABILITIES = [
  {
    icon: CheckCircle2,
    title: 'Eligibility, explained',
    desc: 'Enter six details and get a weighted verdict that names every criterion you clear, every one you miss, and the exact change that would flip the outcome.',
    accent: 'bg-success-100 text-success-600',
  },
  {
    icon: ScanText,
    title: 'Document feedback in seconds',
    desc: 'Every upload is reviewed on the spot — blur, name mismatch, stale statement — with the specific flaw and the fix, not a rejection letter days later.',
    accent: 'bg-primary-100 text-primary-600',
  },
  {
    icon: MessageSquare,
    title: 'An assistant, not a status page',
    desc: 'Ask where things stand, what is pending, what it will cost or when to expect movement. Answers are computed from your live application file.',
    accent: 'bg-warning-100 text-warning-600',
  },
];

export function Landing() {
  const { state, actions } = useApp();
  const navigate = useNavigate();
  const journeysRef = useRef<HTMLDivElement>(null);

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
            <span className="text-lg font-bold text-surface-900">Paytm AI Clarity</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-surface-600 md:flex">
            <button type="button" className="transition-colors hover:text-primary-600" onClick={() => startJourney('loan')}>
              Loan journey
            </button>
            <button type="button" className="transition-colors hover:text-primary-600" onClick={() => startJourney('insurance')}>
              Insurance journey
            </button>
            <button
              type="button"
              className="transition-colors hover:text-primary-600"
              onClick={() => journeysRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Compare
            </button>
          </nav>
          {canResume && (
            <Button variant="secondary" size="sm" onClick={() => navigate(resumePath)}>
              <ArrowLeft className="h-4 w-4" />
              Resume
            </Button>
          )}
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
                <p className="text-sm font-medium text-primary-900">You have an application in progress</p>
                <p className="text-xs text-primary-700">{resumeLabel}</p>
              </div>
            </div>
            <Button size="sm" onClick={() => navigate(resumePath)}>
              {state.submitted ? 'Open status tracker' : 'Continue application'}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="mx-auto mb-14 max-w-3xl text-center">
          <Badge variant="info" size="md" className="mb-5" dot>
            Paytm AI-Powered Financial Journeys
          </Badge>
          <h1 className="mb-5 text-4xl font-bold leading-tight text-surface-900 sm:text-5xl lg:text-6xl">
            Understand your <span className="text-primary-600">application</span>, not just its status
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-surface-600">
            Plain-language eligibility reasoning, instant document feedback and a status assistant that actually
            answers — so nobody drops off because they could not tell what was happening.
          </p>
          <Button
            size="lg"
            onClick={() => journeysRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="w-full sm:w-auto"
          >
            Choose your journey
            <ArrowRight className="h-5 w-5" />
          </Button>
          <p className="mt-3 text-xs text-surface-500">
            Runs entirely in your browser — no sign-up, no API keys, works offline.
          </p>
        </div>

        <div className="mb-16 grid grid-cols-1 gap-6 md:grid-cols-3">
          {CAPABILITIES.map(capability => (
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
          <h2 className="mb-2 text-center text-2xl font-bold text-surface-900">Choose your journey</h2>
          <p className="mb-8 text-center text-sm text-surface-600">
            Both journeys share the same clarity layer — only the criteria and documents change.
          </p>

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
                      `${config.fields.length} details, one plain-English verdict`,
                      'Documents reviewed the moment you upload them',
                      'Assistant answers status, cost and timeline',
                    ].map(item => (
                      <li key={item} className="flex items-start gap-2 text-surface-600">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success-600" />
                        {item}
                      </li>
                    ))}
                  </ul>

                  <div className="mb-5 rounded-lg bg-surface-50 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-surface-500">Try this profile</p>
                    <p className="text-sm text-surface-700">
                      {persona.name} — {persona.description}
                    </p>
                  </div>

                  <Button onClick={() => startJourney(type)} className="mt-auto w-full">
                    Start {config.title.toLowerCase()}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Card>
              );
            })}
          </div>

          <Card variant="outlined" padding="lg" className="mt-8">
            <RichText
              className="text-surface-600"
              text={
                '**How the AI works here.** There is no external model call — and nothing leaves your device. The eligibility engine scores six weighted underwriting criteria with partial credit for near misses, the document reviewer derives its verdict from real file signals (name, size, format, dates) so the same file always gets the same answer, and the assistant classifies what you asked before composing a reply from your live application data.'
              }
            />
          </Card>
        </div>
      </main>

      <footer className="mt-16 border-t border-surface-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 text-center text-sm text-surface-500">
          Built for the Paytm AI-Powered Financial Journeys hackathon • Demo build, no real credit decisions are made
        </div>
      </footer>
    </div>
  );
}
