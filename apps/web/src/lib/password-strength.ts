import { passwordSchema } from '@vr-tournament/shared';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordRequirement {
  id: string;
  label: string;
  met: boolean;
}

/** The server rule: 8–128 characters, at least one letter and one number. */
export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      id: 'length',
      label: `${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`,
      met: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    },
    { id: 'letter', label: 'One letter', met: /[A-Za-z]/.test(password) },
    { id: 'number', label: 'One number', met: /[0-9]/.test(password) },
  ];
}

/** First unmet server rule (shared passwordSchema) as a sentence, or null when acceptable. */
export function passwordRuleError(password: string): string | null {
  const result = passwordSchema.safeParse(password);
  return result.success ? null : (result.error.issues[0]?.message ?? 'Password does not meet the rules');
}

/** 0–4: one point per rule met, plus one for length ≥ 12 or a symbol once all rules pass. */
export function passwordStrengthScore(password: string): number {
  if (!password) return 0;
  const met = getPasswordRequirements(password).filter((r) => r.met).length;
  if (met < 3) return Math.min(met, 2);
  const bonus = password.length >= 12 || /[^A-Za-z0-9]/.test(password) ? 1 : 0;
  return 3 + bonus;
}

export function passwordStrengthLabel(score: number): string {
  if (score === 0) return '';
  if (score <= 1) return 'Weak';
  if (score <= 2) return 'Fair';
  if (score <= 3) return 'Good';
  return 'Strong';
}
