import { useState, type FormEvent } from 'react';
import type { BankDetails } from '../../../shared/types/common';
import { BANK_OPTIONS, IFSC_PATTERN } from '../../../shared/utils/constants';
import { Input, Select, Button, Card, Badge } from '../../../shared/components';
import { useI18n } from '../../../shared/i18n';
import { useAIThinking } from '../../../shared/hooks';
import { ShieldCheck, Landmark, CheckCircle2 } from 'lucide-react';

interface BankDetailsFormProps {
  initial: BankDetails | null;
  applicantName: string;
  /** Fired once the account passes the simulated penny-drop check. */
  onVerified: (details: BankDetails) => void;
}

/**
 * Bank details for the disbursal account, verified with a simulated penny drop
 * (the ₹1 test credit every real lender runs). Validation is honest: account
 * number confirmed twice, IFSC format-checked, holder name pre-filled from the
 * application but editable.
 */
export function BankDetailsForm({ initial, applicantName, onVerified }: BankDetailsFormProps) {
  const { dict } = useI18n();
  const [details, setDetails] = useState<BankDetails>(
    initial ?? {
      accountHolder: applicantName,
      accountNumber: '',
      confirmAccountNumber: '',
      ifsc: '',
      bankName: BANK_OPTIONS[0],
    }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [verifying, setVerifying] = useState(false);
  const thinking = useAIThinking([dict.bank.pennyStep1, dict.bank.pennyStep2, dict.bank.pennyStep3], verifying, 700);

  const set = (key: keyof BankDetails, value: string) => {
    setDetails(prev => ({ ...prev, [key]: value }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[key];
      delete next._form;
      return next;
    });
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (details.accountHolder.trim().length < 3) next.accountHolder = dict.bank.holderRequired;
    if (!/^\d{6,18}$/.test(details.accountNumber)) next.accountNumber = dict.bank.invalidAccount;
    if (details.confirmAccountNumber !== details.accountNumber) next.confirmAccountNumber = dict.bank.mismatch;
    if (!IFSC_PATTERN.test(details.ifsc.toUpperCase())) next.ifsc = dict.bank.invalidIfsc;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (verifying) return;
    if (!validate()) return;
    setVerifying(true);
    // Simulated penny-drop round trip.
    window.setTimeout(() => {
      setVerifying(false);
      onVerified({ ...details, accountHolder: details.accountHolder.trim(), ifsc: details.ifsc.toUpperCase() });
    }, 2300);
  };

  return (
    <Card variant="default" padding="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="mb-1 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100">
            <Landmark className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-surface-900">{dict.bank.pennyTitle}</p>
            <p className="text-xs text-surface-500">{dict.bank.accountHolderHint}</p>
          </div>
        </div>

        <Input
          label={dict.bank.accountHolder}
          value={details.accountHolder}
          onChange={event => set('accountHolder', event.target.value)}
          error={errors.accountHolder}
          helperText={dict.bank.accountHolderHint}
          autoComplete="name"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={dict.bank.accountNumber}
            value={details.accountNumber}
            onChange={event => set('accountNumber', event.target.value.replace(/\D/g, '').slice(0, 18))}
            inputMode="numeric"
            autoComplete="off"
            error={errors.accountNumber}
          />
          <Input
            label={dict.bank.confirmAccountNumber}
            value={details.confirmAccountNumber}
            onChange={event => set('confirmAccountNumber', event.target.value.replace(/\D/g, '').slice(0, 18))}
            inputMode="numeric"
            autoComplete="off"
            error={errors.confirmAccountNumber}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={dict.bank.ifsc}
            value={details.ifsc}
            onChange={event => set('ifsc', event.target.value.toUpperCase().slice(0, 11))}
            placeholder="HDFC0001234"
            autoComplete="off"
            error={errors.ifsc}
            helperText={dict.bank.ifscHint}
            className="font-mono tracking-wider"
          />
          <Select
            label={dict.bank.bankName}
            value={details.bankName}
            onChange={event => set('bankName', event.target.value)}
            options={BANK_OPTIONS.map(bank => ({ value: bank, label: bank }))}
          />
        </div>

        {verifying && (
          <div className="flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3">
            <span className="flex h-2.5 w-2.5 flex-shrink-0">
              <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-primary-400 opacity-60" />
              <span className="h-2.5 w-2.5 rounded-full bg-primary-500" />
            </span>
            <p className="text-sm font-medium text-primary-800">{thinking.step}</p>
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" loading={verifying} disabled={verifying}>
          {verifying ? dict.documents.reviewing : dict.bank.verifiedTitle}
          {!verifying && <ShieldCheck className="h-4 w-4" />}
        </Button>
      </form>
    </Card>
  );
}

/** Small green chip shown once verification passed (used by the wizard). */
export function BankVerifiedChip() {
  const { dict } = useI18n();
  return (
    <Badge variant="success" size="sm" dot>
      <CheckCircle2 className="h-3 w-3" />
      {dict.bank.verifiedTitle}
    </Badge>
  );
}
