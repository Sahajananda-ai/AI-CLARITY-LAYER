import { useState, type FormEvent, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { useI18n } from '../shared/i18n';
import { DEMO_OTP, dispatchNotification } from '../features/notifications/engine';
import { Button, Input, LanguageToggle, Badge } from '../shared/components';
import { Sparkles, Phone, ShieldCheck, ArrowRight, MessageSquare, MessageCircle, RotateCcw } from 'lucide-react';
import type { Applicant } from '../shared/types/common';

/**
 * OTP login — the first screen, and the number that every SMS/WhatsApp update
 * is addressed to afterwards.
 *
 * The OTP is fixed (246810) and mirrored into the notification feed as a real
 * SMS + WhatsApp message, so the "we message your phone" story is visible from
 * the very first screen instead of appearing only after submission.
 *
 * The session (`state.phone`) is only set once the OTP is verified, so the gate
 * genuinely enforces the second step. LoginScreen is a module-level component
 * (not nested) so its local state survives re-renders of the provider.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { state } = useApp();
  if (!state.phone) return <LoginScreen />;
  return <>{children}</>;
}

function LoginScreen() {
  const { state, actions } = useApp();
  const { dict, format, language } = useI18n();
  const navigate = useNavigate();

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const phoneValid = /^[6-9]\d{9}$/.test(phoneInput);

  const sendOtp = (event?: FormEvent) => {
    event?.preventDefault();
    if (!phoneValid) {
      setError(dict.login.invalidPhone);
      return;
    }
    setError('');
    setBusy(true);
    // Simulated gateway latency so the sending state is visible.
    window.setTimeout(() => {
      actions.addNotification(
        dispatchNotification('otp', {
          journeyType: state.journeyType ?? 'loan',
          applicant:
            state.applicant ??
            ({ fullName: 'Paytm User', age: 30, annualIncome: 300000, employmentType: 'salaried' } as Applicant),
          reference: 'LOGIN',
          language,
          dict,
          phone: phoneInput,
        })
      );
      setBusy(false);
      setStep('otp');
    }, 900);
  };

  const verify = (event?: FormEvent) => {
    event?.preventDefault();
    if (otp !== DEMO_OTP) {
      setError(dict.login.invalidOtp);
      return;
    }
    setError('');
    setBusy(true);
    window.setTimeout(() => {
      actions.setPhone(phoneInput);
      setBusy(false);
      // Returning applicants with an in-flight application go straight back to it.
      navigate(state.journeyType ? (state.submitted ? '/dashboard' : '/wizard') : '/', { replace: true });
    }, 700);
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface-50">
      <header className="border-b border-surface-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-surface-900">{dict.appName}</span>
          </div>
          <LanguageToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-card sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100">
              <Phone className="h-6 w-6 text-primary-600" />
            </div>
            <Badge variant="info" size="sm" dot>
              OTP login
            </Badge>
          </div>

          {step === 'phone' ? (
            <form onSubmit={sendOtp}>
              <h1 className="mb-1 text-xl font-bold text-surface-900">{dict.login.title}</h1>
              <p className="mb-6 text-sm text-surface-600">{dict.login.subtitle}</p>
              <div className="mb-4">
                <Input
                  label={dict.login.phoneLabel}
                  value={phoneInput}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setPhoneInput(event.target.value.replace(/\D/g, '').slice(0, 10));
                    setError('');
                  }}
                  placeholder={dict.login.phonePlaceholder}
                  inputMode="numeric"
                  autoComplete="tel"
                  leftIcon={<Phone className="h-4 w-4" />}
                  error={error || undefined}
                  helperText={phoneInput.length > 0 && !phoneValid ? dict.login.invalidPhone : undefined}
                />
              </div>
              <Button type="submit" size="lg" className="w-full" loading={busy} disabled={busy}>
                {busy ? dict.login.sending : dict.login.sendOtp}
                {!busy && <ArrowRight className="h-4 w-4" />}
              </Button>
              <div className="mt-4 space-y-2 rounded-lg bg-surface-50 p-3 text-xs text-surface-500">
                <p className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-primary-500" />
                  SMS updates to this number
                </p>
                <p className="flex items-center gap-2">
                  <MessageCircle className="h-3.5 w-3.5 flex-shrink-0 text-success-600" />
                  WhatsApp updates to this number
                </p>
                <p className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 text-surface-400" />
                  {dict.login.privacyNote}
                </p>
              </div>
            </form>
          ) : (
            <form onSubmit={verify}>
              <h1 className="mb-1 text-xl font-bold text-surface-900">{dict.login.otpLabel}</h1>
              <p className="mb-6 text-sm text-surface-600">
                {format(dict.login.otpSubtitle, { phone: phoneInput, code: DEMO_OTP })}
              </p>
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 p-3 text-xs text-primary-800">
                <ShieldCheck className="h-4 w-4 flex-shrink-0" />
                {dict.login.demoHint}
              </div>
              <div className="mb-4">
                <Input
                  label={dict.login.otpLabel}
                  value={otp}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setOtp(event.target.value.replace(/\D/g, '').slice(0, 6));
                    setError('');
                  }}
                  placeholder="••••••"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  error={error || undefined}
                  className="text-center text-lg tracking-[0.5em]"
                />
              </div>
              <Button type="submit" size="lg" className="w-full" loading={busy} disabled={busy || otp.length < 6}>
                {busy ? dict.login.verifying : dict.login.verify}
                {!busy && <ArrowRight className="h-4 w-4" />}
              </Button>
              <div className="mt-4 flex items-center justify-between text-xs">
                <button
                  type="button"
                  className="font-medium text-surface-500 transition-colors hover:text-primary-600"
                  onClick={() => {
                    setStep('phone');
                    setOtp('');
                    setError('');
                  }}
                >
                  {dict.login.changeNumber}
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1 font-medium text-primary-600 transition-colors hover:text-primary-700"
                  onClick={() => sendOtp()}
                >
                  <RotateCcw className="h-3 w-3" />
                  {dict.login.resend}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-surface-400">
          Demo: any valid 10-digit number works. OTP {DEMO_OTP}.
        </p>
      </main>
    </div>
  );
}
