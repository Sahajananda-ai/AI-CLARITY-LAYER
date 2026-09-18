import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { LoanApplicant, InsuranceApplicant, EmploymentType, Persona } from '../../../shared/types/common';
import { JOURNEY_CONFIG, LOAN_PERSONAS, INSURANCE_PERSONAS, EMPLOYMENT_TYPE_LABELS } from '../../../shared/utils/constants';
import { Input, Select, Button, Card } from '../../../shared/components';
import { formatCurrency } from '../../../shared/utils/formatters';
import { cn } from '../../../shared/utils/cn';
import { CheckCircle2, Wand2 } from 'lucide-react';

/** Normalised shape of a journey field, so we can read options safely. */
interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: (string | number)[];
  placeholder?: string;
  required?: boolean;
}

interface EligibilityFormProps {
  journeyType: 'loan' | 'insurance';
  onSubmit: (applicant: LoanApplicant | InsuranceApplicant) => void;
  /** Previously entered values, keyed by field name, used to restore the form. */
  initialData?: Record<string, unknown>;
}

export function EligibilityForm({ journeyType, onSubmit, initialData }: EligibilityFormProps) {
  const config = JOURNEY_CONFIG[journeyType];
  const fields = config.fields as unknown as readonly FieldSpec[];
  const personas: Persona[] = journeyType === 'loan' ? LOAN_PERSONAS : INSURANCE_PERSONAS;

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activePersona, setActivePersona] = useState<string | null>(null);

  const [formData, setFormData] = useState<Record<string, string | number>>(() =>
    fields.reduce<Record<string, string | number>>((acc, field) => {
      const initialValue = initialData?.[field.key];
      if (initialValue !== undefined) {
        acc[field.key] = initialValue as string | number;
      } else if (field.type === 'number') {
        acc[field.key] = field.min ?? 0;
      } else if (field.type === 'select') {
        acc[field.key] = field.options?.[0] ?? '';
      } else {
        acc[field.key] = '';
      }
      return acc;
    }, {})
  );

  const handleChange = (key: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setActivePersona(null);
    if (errors[key]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  /**
   * Select elements always hand back strings, but tenure/term are numbers.
   * Keeping the original typed option value prevents "26" + "20" becoming
   * "2620" in the insurance maturity calculation.
   */
  const handleSelectChange = (field: FieldSpec, raw: string) => {
    const original = field.options?.find(option => String(option) === raw);
    handleChange(field.key, original !== undefined ? original : raw);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    for (const field of fields) {
      const value = formData[field.key];

      if (field.required && (value === '' || value === undefined || value === null)) {
        newErrors[field.key] = `${field.label} is required`;
        continue;
      }
      if (field.key === 'fullName' && typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length < 3) newErrors[field.key] = 'Enter your full name (at least 3 characters)';
        else if (!trimmed.includes(' ')) newErrors[field.key] = 'Please enter first and last name, as printed on your documents';
      }
      if (field.type === 'number' && typeof value === 'number') {
        if (field.min !== undefined && value < field.min) {
          const hint = field.key === 'annualIncome' ? ` (${formatCurrency(field.min)} minimum)` : '';
          newErrors[field.key] = `${field.label} must be at least ${field.min}${hint}`;
        }
        if (field.max !== undefined && value > field.max) {
          newErrors[field.key] = `${field.label} must be at most ${field.max}`;
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    if (journeyType === 'loan') {
      onSubmit({
        fullName: String(formData.fullName).trim(),
        age: Number(formData.age),
        annualIncome: Number(formData.annualIncome),
        employmentType: formData.employmentType as EmploymentType,
        existingEMIs: Number(formData.existingEMIs),
        creditScore: Number(formData.creditScore),
        loanAmount: Number(formData.loanAmount),
        tenureMonths: Number(formData.tenureMonths),
      });
    } else {
      onSubmit({
        fullName: String(formData.fullName).trim(),
        age: Number(formData.age),
        annualIncome: Number(formData.annualIncome),
        employmentType: formData.employmentType as EmploymentType,
        coverageAmount: Number(formData.coverageAmount),
        policyTermYears: Number(formData.policyTermYears),
        preExistingConditions: String(formData.preExistingConditions || 'None'),
      });
    }
  };

  const applyPersona = (persona: Persona) => {
    const applicant = persona.applicant as unknown as Record<string, string | number>;
    setFormData(prev => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(applicant)) next[key] = value;
      return next;
    });
    setErrors({});
    setActivePersona(persona.id);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card variant="default" padding="md">
        <div className="mb-4 flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary-600" />
          <h3 className="text-sm font-semibold text-surface-900">Start from a sample profile</h3>
          <span className="text-xs text-surface-500">— one click fills the form</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {personas.map(persona => {
            const isActive = activePersona === persona.id;
            return (
              <button
                key={persona.id}
                type="button"
                onClick={() => applyPersona(persona)}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 text-left transition-all',
                  isActive
                    ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-300'
                    : 'border-surface-200 bg-white hover:border-primary-300 hover:bg-primary-50/40'
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    isActive ? 'bg-primary-600 text-white' : 'bg-surface-100 text-surface-600'
                  )}
                >
                  {isActive ? <CheckCircle2 className="h-4 w-4" /> : persona.name.split(' ').map(part => part[0]).join('')}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-surface-900">{persona.name}</span>
                  <span className="block text-xs text-surface-500">{persona.description}</span>
                  <span className="mt-1 inline-block rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-surface-600">
                    {persona.tag}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {fields.map(field => {
          const error = errors[field.key];
          const value = formData[field.key];

          if (field.type === 'number') {
            const helperText =
              field.key === 'annualIncome'
                ? `Minimum ${formatCurrency(field.min ?? 0)} — enter your gross yearly income`
                : field.key === 'creditScore'
                  ? '300 to 900. Not sure? 750 is a good average.'
                  : undefined;
            return (
              <Input
                key={field.key}
                type="number"
                label={field.label}
                value={value as number}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  handleChange(field.key, event.target.value === '' ? 0 : Number(event.target.value))
                }
                min={field.min}
                max={field.max}
                step={field.step}
                error={error}
                helperText={helperText}
              />
            );
          }

          if (field.type === 'select') {
            const options = (field.options ?? []).map(option => ({
              value: option,
              label:
                field.key === 'employmentType'
                  ? EMPLOYMENT_TYPE_LABELS[option as EmploymentType] ?? String(option)
                  : field.key === 'tenureMonths'
                    ? `${option} months`
                    : field.key === 'policyTermYears'
                      ? `${option} years`
                      : String(option),
            }));
            return (
              <Select
                key={field.key}
                label={field.label}
                value={value as string | number}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => handleSelectChange(field, event.target.value)}
                options={options}
                error={error}
              />
            );
          }

          // `Input` forwards className to the <input>, so span the cell here.
          return (
            <div key={field.key} className="md:col-span-2">
              <Input
                type="text"
                label={field.label}
                value={value as string}
                onChange={(event: ChangeEvent<HTMLInputElement>) => handleChange(field.key, event.target.value)}
                placeholder={field.placeholder}
                error={error}
                helperText={
                  field.key === 'fullName' ? 'We match this against the name on your uploaded documents.' : undefined
                }
              />
            </div>
          );
        })}
      </div>

      <Button type="submit" size="lg" className="w-full">
        Check my eligibility
      </Button>
      <p className="text-center text-xs text-surface-500">
        Every check runs on your device — no data is sent anywhere.
      </p>
    </form>
  );
}
