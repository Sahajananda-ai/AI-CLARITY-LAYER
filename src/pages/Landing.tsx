import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { Badge, Button, Card, RichText } from '../shared/components';
import { RubberSegment, ScrollExpand } from '../shared/components/motion';
import { useI18n } from '../shared/i18n';
import {
  CreditCard,
  Shield,
  ArrowRight,
  CheckCircle2,
  ScanSearch,
  BellRing,
  ChevronDown,
  Mic,
  Languages,
} from 'lucide-react';
import { JOURNEY_CONFIG, LOAN_PERSONAS, INSURANCE_PERSONAS } from '../shared/utils/constants';
import { cn } from '../shared/utils/cn';

export function Landing() {
  const { state, actions } = useApp();
  const { dict, language, setLanguage } = useI18n();
  const navigate = useNavigate();
  const journeysRef = useRef<HTMLDivElement>(null);
  const [openJourney, setOpenJourney] = useState<'loan' | 'insurance' | null>('loan');

  const capabilities = [
    {
      icon: CheckCircle2,
      title: dict.landing.cap1Title,
      desc: dict.landing.cap1Desc,
      accent: 'from-success-500/15 to-success-500/5 text-success-600',
    },
    {
      icon: ScanSearch,
      title: dict.landing.cap2Title,
      desc: dict.landing.cap2Desc,
      accent: 'from-primary-500/15 to-primary-500/5 text-primary-600',
    },
    {
      icon: BellRing,
      title: dict.landing.cap3Title,
      desc: dict.landing.cap3Desc,
      accent: 'from-warning-500/15 to-warning-500/5 text-warning-600',
    },
    {
      icon: Mic,
      title: language === 'hi' ? 'बोलिए या लिखिए' : language === 'kn' ? 'ಮಾತನಾಡಿ ಅಥವಾ ಬರೆಯಿರಿ' : 'Speak or type',
      desc:
        language === 'hi'
          ? 'माइक से पूछें और जवाब सुनें — असिस्टेंट आपकी भाषा में बोलकर जवाब देता है।'
          : language === 'kn'
            ? 'ಮೈಕ್ ಮೂಲಕ ಕೇಳಿ ಮತ್ತು ಉತ್ತರ ಆಲಿಸಿ — ಸಹಾಯಕ ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ ಧ್ವನಿಯಲ್ಲಿ ಉತ್ತರಿಸುತ್ತಾನೆ.'
            : 'Ask with your voice and hear the answer back — the assistant speaks in your language.',
      accent: 'from-indigo-500/15 to-indigo-500/5 text-indigo-600',
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
      <header className="sticky top-0 z-10 border-b border-surface-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Paytm Clarity Layer" className="h-9 w-auto rounded-lg" />
          </div>
          <div className="flex items-center gap-2">
            {/* Rubber language switch — each language in its own script. */}
            <RubberSegment
              items={language === 'en' ? ['English', 'हिंदी', 'ಕನ್ನಡ'] : language === 'hi' ? ['English', 'हिंदी', 'ಕನ್ನಡ'] : ['English', 'हिंदी', 'ಕನ್ನಡ']}
              defaultValue={language === 'en' ? 'English' : language === 'hi' ? 'हिंदी' : 'ಕನ್ನಡ'}
              size="sm"
              onChange={(_value, index) => setLanguage((['en', 'hi', 'kn'] as const)[index])}
            />
            {canResume && (
              <Button variant="secondary" size="sm" onClick={() => navigate(resumePath)}>
                <ArrowRight className="h-4 w-4" />
                {dict.resume}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        {canResume && (
          <div className="animate-rise-in mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50 p-4">
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

        {/* Hero */}
        <div className="hero-mesh mx-auto mb-12 max-w-4xl rounded-3xl px-6 py-12 text-center sm:py-16">
          <Badge variant="info" size="md" className="animate-rise-in mb-5" dot>
            {dict.landing.badge}
          </Badge>
          <h1 className="animate-rise-in mb-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-surface-900 sm:text-5xl lg:text-6xl" style={{ animationDelay: '60ms' }}>
            {dict.landing.heroTitle} <span className="brand-gradient-text">{dict.landing.heroHighlight}</span>
            {dict.landing.heroTitleTail}
          </h1>
          <p className="animate-rise-in mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-surface-600" style={{ animationDelay: '120ms' }}>
            {dict.landing.heroSubtitle}
          </p>
          <div className="animate-rise-in flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: '180ms' }}>
            <Button
              size="lg"
              onClick={() => journeysRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="shadow-lg shadow-primary-600/25"
            >
              {dict.landing.chooseJourney}
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-1.5 rounded-full border border-surface-200 bg-white px-3 py-2 text-xs font-medium text-surface-500">
              <Languages className="h-3.5 w-3.5 text-primary-500" />
              English · हिंदी · ಕನ್ನಡ
            </div>
          </div>
          <p className="mt-4 text-xs text-surface-500">{dict.landing.runsInBrowser}</p>
        </div>

        {/* Expand-on-scroll brand strip */}
        <div className="mb-16">
          <ScrollExpand
            src="/logo.png"
            alt="Paytm Clarity Layer"
            title="Paytm Clarity Layer"
            scrollHint={language === 'hi' ? 'स्क्रॉल करें' : language === 'kn' ? 'ಸ್ಕ್ರೋಲ್' : 'Scroll'}
            useWindowScroll
            height={320}
            mediaZoom={1.25}
          >
            <p className="max-w-xl text-sm leading-relaxed text-white/85 sm:text-base">
              {language === 'hi'
                ? 'हर निर्णय समझाया गया। हर दस्तावेज़ तुरंत जाँचा गया। हर कदम पर आपके फ़ोन पर संदेश।'
                : language === 'kn'
                  ? 'ಪ್ರತಿ ನಿರ್ಧಾರ ವಿವರಿಸಲಾಗಿದೆ. ಪ್ರತಿ ದಸ್ತಾವೇಜು ತಕ್ಷಣ ಪರಿಶೀಲಿತ. ಪ್ರತಿ ಹಂತದಲ್ಲೂ ನಿಮ್ಮ ಫೋನ್‌ಗೆ ಸಂದೇಶ.'
                  : 'Every decision explained. Every document checked instantly. Every step messaged to your phone.'}
            </p>
          </ScrollExpand>
        </div>

        {/* Capabilities — one accent gradient per card, staggered entrance */}
        <div className="mb-20 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {capabilities.map((capability, index) => (
            <Card
              key={capability.title}
              variant="elevated"
              padding="lg"
              className="animate-rise-in group h-full transition-transform duration-200 hover:-translate-y-1"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div className={cn('mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br', capability.accent)}>
                <capability.icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-base font-semibold text-surface-900">{capability.title}</h3>
              <p className="text-sm leading-relaxed text-surface-600">{capability.desc}</p>
            </Card>
          ))}
        </div>

        {/* Journey selection — accordion: choose one, it expands open */}
        <div ref={journeysRef} className="mx-auto max-w-4xl scroll-mt-20">
          <h2 className="mb-2 text-center text-3xl font-bold tracking-tight text-surface-900">{dict.landing.chooseTitle}</h2>
          <p className="mb-8 text-center text-sm text-surface-600">{dict.landing.chooseSubtitle}</p>

          <div className="space-y-4">
            {(['loan', 'insurance'] as const).map(type => {
              const config = JOURNEY_CONFIG[type];
              const Icon = type === 'loan' ? CreditCard : Shield;
              const persona = type === 'loan' ? LOAN_PERSONAS[0] : INSURANCE_PERSONAS[0];
              const isOpen = openJourney === type;
              return (
                <div
                  key={type}
                  className={cn(
                    'overflow-hidden rounded-2xl border bg-white transition-all duration-300',
                    isOpen ? 'border-primary-300 shadow-card-hover ring-1 ring-primary-100' : 'border-surface-200 shadow-card'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpenJourney(isOpen ? null : type)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-surface-50"
                  >
                    <span className="flex items-center gap-4">
                      <span
                        className={cn(
                          'flex h-12 w-12 items-center justify-center rounded-xl transition-colors',
                          isOpen ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white' : 'bg-primary-100 text-primary-600'
                        )}
                      >
                        <Icon className="h-6 w-6" />
                      </span>
                      <span>
                        <span className="block text-lg font-semibold text-surface-900">{config.title}</span>
                        <span className="block text-sm text-surface-500">{config.subtitle}</span>
                      </span>
                    </span>
                    <ChevronDown
                      className={cn('h-5 w-5 flex-shrink-0 text-surface-400 transition-transform duration-300', isOpen && 'rotate-180')}
                    />
                  </button>

                  <div
                    className="grid transition-all duration-300 ease-out"
                    style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                  >
                    <div className="overflow-hidden">
                      <div className="border-t border-surface-100 p-5">
                        <ul className="mb-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                          {[
                            dict.landing.detailsVerdict.replace('{count}', String(config.fields.length)),
                            dict.landing.docsReviewed,
                            dict.landing.assistantAnswers,
                          ].map(item => (
                            <li key={item} className="flex items-start gap-2 rounded-lg bg-surface-50 p-2.5 text-surface-600">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success-600" />
                              {item}
                            </li>
                          ))}
                        </ul>

                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary-50/60 p-3">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-primary-700">{dict.landing.tryProfile}</p>
                            <p className="text-sm text-surface-700">
                              {persona.name} — {persona.description}
                            </p>
                          </div>
                          <Badge variant="info" size="sm">
                            {persona.tag}
                          </Badge>
                        </div>

                        <Button onClick={() => startJourney(type)} className="w-full sm:w-auto">
                          {type === 'loan' ? dict.landing.startLoan : dict.landing.startInsurance}
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
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
